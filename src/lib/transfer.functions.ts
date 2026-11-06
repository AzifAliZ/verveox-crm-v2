import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseUpload, checkRows, mappingSchema, exportBytes } from "./transfer";
import { EXPORT_COLUMNS } from "./crm";

const idSchema = z.object({ id: z.string().uuid() });
type Client = typeof import("@/integrations/supabase/client").supabase;
async function authorize(client: Client, uid: string, importing = false) {
  const active = await client.rpc("is_active_user", { _uid: uid });
  if (active.error || !active.data) throw new Error("An active account is required");
  if (importing) {
    const [a, m] = await Promise.all([
      client.rpc("is_admin", { _uid: uid }),
      client.rpc("is_manager", { _uid: uid }),
    ]);
    if (!a.data && !m.data) throw new Error("Only Managers and Super Admins can import");
  }
}
async function adminClient() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function cleanExpiredTransfers() {
  return (await import("./maintenance.server")).cleanExpiredTransfers();
}
async function ownJob(client: Client, id: string, uid: string) {
  const { data, error } = await client
    .from("transfer_jobs")
    .select("*")
    .eq("id", id)
    .eq("requested_by", uid)
    .gt("expires_at", new Date().toISOString())
    .single();
  if (error || !data) throw new Error("File or job is unavailable or expired");
  return data;
}
export const uploadTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("File upload required");
    const file = d.get("file");
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
      throw new Error("Upload a file under 5 MB");
    return d;
  })
  .handler(async ({ data, context }) => {
    await authorize(context.supabase, context.userId, true);
    await cleanExpiredTransfers();
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("File required");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parseUpload(file.name, bytes);
    const admin = await adminClient();
    const recent = await admin
      .from("transfer_jobs")
      .select("id", { count: "exact", head: true })
      .eq("requested_by", context.userId)
      .gte("created_at", new Date(Date.now() - 3600000).toISOString());
    if ((recent.count ?? 0) >= 30) throw new Error("Hourly upload/export limit reached");
    const id = crypto.randomUUID(),
      path = `${context.userId}/${id}/input.${file.name.split(".").pop()?.toLowerCase()}`;
    const stored = await admin.storage
      .from("crm-transfers")
      .upload(path, bytes, { contentType: "application/octet-stream" });
    if (stored.error) throw new Error("Upload could not be saved");
    const inserted = await admin.from("transfer_jobs").insert({
      id,
      requested_by: context.userId,
      kind: "upload",
      status: "completed",
      file_name: file.name.slice(0, 200),
      file_path: path,
      total_rows: parsed.rows.length,
    });
    if (inserted.error) {
      await admin.storage.from("crm-transfers").remove([path]);
      throw new Error("Upload history could not be saved");
    }
    return {
      id,
      headers: parsed.headers,
      preview: parsed.rows.slice(0, 5),
      total: parsed.rows.length,
    };
  });
export const previewImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), mapping: mappingSchema, mode: z.enum(["skip", "update"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await authorize(context.supabase, context.userId, true);
    const job = await ownJob(context.supabase, data.id, context.userId);
    if (job.kind !== "upload" || !job.file_path) throw new Error("Invalid upload");
    const admin = await adminClient();
    const file = await admin.storage.from("crm-transfers").download(job.file_path);
    if (!file.data || file.error) throw new Error("Upload unavailable");
    const parsed = parseUpload(job.file_name, new Uint8Array(await file.data.arrayBuffer()));
    if (Object.values(data.mapping).some((h) => h && !parsed.headers.includes(h)))
      throw new Error("Invalid mapped column");
    const rows = checkRows(parsed.rows, data.mapping);
    const sources = await context.supabase.from("lead_sources").select("key");
    for (const row of rows)
      if (row.data.source && !sources.data?.some((s) => s.key === row.data.source))
        row.error = "Unknown source key";
    // Privileged duplicate lookup detects hidden conflicts but never returns their identity.
    const emails = [
      ...new Set(rows.map((r) => String(r.data.email ?? "").toLowerCase()).filter(Boolean)),
    ];
    const phones = [
      ...new Set(
        rows
          .map((r) =>
            String(r.data.phone ?? "")
              .replace(/\D/g, "")
              .slice(-10),
          )
          .filter((p) => p.length >= 7),
      ),
    ];
    const existing = new Map<
      string,
      { id: string; normalized_email: string | null; normalized_phone: string | null }
    >();
    for (const [column, values] of [
      ["normalized_email", emails],
      ["normalized_phone", phones],
    ] as const)
      for (let i = 0; i < values.length; i += 100) {
        const result = await admin
          .from("leads")
          .select("id,normalized_email,normalized_phone")
          .in(column, values.slice(i, i + 100))
          .limit(1000);
        if (result.error || result.data.length >= 1000)
          throw new Error("Duplicate review requires a smaller file");
        result.data.forEach((r) => existing.set(r.id, r));
      }
    const allowed = new Set<string>();
    const ids = [...existing.keys()];
    for (let i = 0; i < ids.length; i += 100) {
      const result = await context.supabase
        .from("leads")
        .select("id")
        .in("id", ids.slice(i, i + 100));
      if (result.error) throw new Error("Duplicate permission check failed");
      result.data.forEach((r) => allowed.add(r.id));
    }
    for (const row of rows) {
      const email = String(row.data.email ?? "").toLowerCase(),
        phone = String(row.data.phone ?? "")
          .replace(/\D/g, "")
          .slice(-10);
      const hits = [...existing.values()].filter(
        (r) =>
          (email && r.normalized_email === email) ||
          (phone.length >= 7 && r.normalized_phone === phone),
      );
      if (hits.length > 1) row.error = "Ambiguous duplicate; review manually";
      else if (hits[0] && !allowed.has(hits[0].id))
        row.error = "Row cannot be processed with your permissions";
      else if (hits.length) row.duplicate = true;
    }
    const result = await admin
      .from("transfer_jobs")
      .insert({
        requested_by: context.userId,
        kind: "import",
        file_name: job.file_name,
        total_rows: rows.length,
        payload: { mode: data.mode, rows } as never,
      })
      .select("id")
      .single();
    if (result.error) throw new Error("Dry run could not be saved");
    return {
      id: result.data.id,
      total: rows.length,
      newRows: rows.filter((r) => !r.error && !r.duplicate).length,
      duplicates: rows.filter((r) => !r.error && r.duplicate).length,
      invalid: rows.filter((r) => r.error).length,
      errors: rows.filter((r) => r.error).map((r) => ({ row: r.row, error: r.error })),
    };
  });
export const runImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context.supabase, context.userId, true);
    const result = await context.supabase.rpc("process_import_batch", { _job_id: data.id });
    if (result.error) throw new Error(result.error.message);
    return result.data as unknown as {
      id: string;
      status: string;
      processed_rows: number;
      total_rows: number;
      imported_rows: number;
      updated_rows: number;
      skipped_rows: number;
      failed_rows: number;
    };
  });
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)))
  .optional();
const filtersSchema = z
  .object({
    q: z.string().max(150).optional(),
    stage: z.string().max(40).optional(),
    temperature: z.enum(["hot", "warm", "cold"]).optional(),
    course: z.string().uuid().optional(),
    source: z.string().max(100).optional(),
    campaign: z.string().uuid().optional(),
    owner: z.union([z.string().uuid(), z.enum(["me", "unassigned"])]).optional(),
    from: date,
    to: date,
    minScore: z.number().min(0).max(100).optional(),
    maxScore: z.number().min(0).max(100).optional(),
    followup: z.enum(["overdue", "today", "none", "scheduled"]).optional(),
    archived: z.boolean().optional(),
    tag: z.string().uuid().optional(),
  })
  .strict();
export const createLeadExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        columns: z
          .array(z.string().refine((k) => EXPORT_COLUMNS.some((c) => c.key === k)))
          .min(1)
          .max(20),
        format: z.enum(["csv", "xlsx"]),
        ids: z.array(z.string().uuid()).min(1).max(5000).optional(),
        filters: filtersSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await authorize(context.supabase, context.userId);
    await cleanExpiredTransfers();
    const admin = await adminClient();
    const recent = await admin
      .from("transfer_jobs")
      .select("id", { count: "exact", head: true })
      .eq("requested_by", context.userId)
      .gte("created_at", new Date(Date.now() - 3600000).toISOString());
    if ((recent.count ?? 0) >= 30) throw new Error("Hourly upload/export limit reached");
    // Import the browser-safe filter builder only; all reads use the caller's client.
    const { applyLeadFilters } = await import("./lead-query");
    let tagIds: string[] | undefined;
    if (data.filters.tag) {
      tagIds = [];
      for (let from = 0; from <= 5000; from += 500) {
        const t = await context.supabase
          .from("lead_tags")
          .select("lead_id")
          .eq("tag_id", data.filters.tag)
          .order("lead_id")
          .range(from, from + 499);
        if (t.error) throw new Error("Tag filter failed");
        tagIds.push(...t.data.map((r) => r.lead_id));
        if (t.data.length < 500) break;
      }
      if (tagIds.length > 5000) throw new Error("Narrow the tag filter to 5,000 leads");
    }
    const id = crypto.randomUUID();
    const path = `${context.userId}/${id}/verveox-leads.${data.format}`;
    const inserted = await admin.from("transfer_jobs").insert({
      id,
      requested_by: context.userId,
      kind: "export",
      file_name: `verveox-leads.${data.format}`,
      status: "running",
      payload: {
        columns: data.columns,
        filters: data.filters,
        scope: data.ids ? "selected" : "filtered",
      } as never,
    });
    if (inserted.error) throw new Error("Export could not start");
    try {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; from <= 5000; from += 500) {
        let q = context.supabase
          .from("leads")
          .select(["id", ...data.columns].join(","), { count: "exact" });
        if (data.ids) q = q.in("id", data.ids);
        else {
          q = applyLeadFilters(q, data.filters, context.userId);
          if (tagIds)
            q = q.in("id", tagIds.length ? tagIds : ["00000000-0000-0000-0000-000000000000"]);
        }
        const result = await q.order("id").range(from, from + 499);
        if (result.error) throw new Error("Export records could not be read");
        if ((result.count ?? 0) > 5000)
          throw new Error("Narrow your export to at most 5,000 leads");
        rows.push(...(result.data as unknown as Record<string, unknown>[]));
        const progress = await admin
          .from("transfer_jobs")
          .update({
            total_rows: Math.max(result.count ?? 0, rows.length),
            processed_rows: rows.length,
          })
          .eq("id", id);
        if (progress.error) throw new Error("Export progress could not be saved");
        if (result.data.length < 500) break;
      }
      if (rows.length > 5000) throw new Error("Narrow your export to at most 5,000 leads");
      if (data.ids && rows.length !== new Set(data.ids).size)
        throw new Error("Some selected leads are no longer accessible");
      const bytes = exportBytes(rows, data.columns, data.format);
      if (bytes.length > 10 * 1024 * 1024)
        throw new Error("Export exceeds 10 MB; choose fewer columns");
      const saved = await admin.storage.from("crm-transfers").upload(path, bytes, {
        contentType:
          data.format === "csv"
            ? "text/csv"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      if (saved.error) throw new Error("Export file could not be saved");
      const done = await admin
        .from("transfer_jobs")
        .update({
          status: "completed",
          file_path: path,
          total_rows: rows.length,
          processed_rows: rows.length,
          payload: {
            columns: data.columns,
            leadIds: rows.map((r) => r.id),
            filters: data.filters,
            scope: data.ids ? "selected" : "filtered",
          } as never,
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (done.error) throw new Error("Export history could not be saved");
      const audit = await admin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "export",
        entity_type: "transfer",
        entity_id: id,
        metadata: { row_count: rows.length, format: data.format },
      });
      if (audit.error) throw new Error("Export audit could not be saved");
      return { id, rows: rows.length };
    } catch (e) {
      await admin.storage.from("crm-transfers").remove([path]);
      await admin
        .from("transfer_jobs")
        .update({ status: "failed", errors: [{ error: (e as Error).message }] })
        .eq("id", id);
      throw e;
    }
  });
export const downloadTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context.supabase, context.userId);
    const job = await ownJob(context.supabase, data.id, context.userId);
    if (job.kind !== "export" || job.status !== "completed" || !job.file_path)
      throw new Error("Export is not ready");
    // Recheck record scope before every later download, not just at creation.
    const payload = job.payload as { columns: string[]; leadIds: string[] };
    if (!payload.columns || !Array.isArray(payload.leadIds)) throw new Error("Invalid export");
    for (let i = 0; i < payload.leadIds.length; i += 100) {
      const ids = payload.leadIds.slice(i, i + 100);
      const readable = await context.supabase.from("leads").select("id").in("id", ids);
      if (readable.error || readable.data.length !== ids.length)
        throw new Error("Access changed; create a new export");
    }
    const admin = await adminClient();
    const link = await admin.storage
      .from("crm-transfers")
      .createSignedUrl(job.file_path, 60, { download: job.file_name });
    if (link.error) throw new Error("Download could not be prepared");
    const base = process.env["SUPABASE_URL"];
    const publicBase = import.meta.env.VITE_SUPABASE_URL;
    return {
      url: base && publicBase ? link.data.signedUrl.replace(base, publicBase) : link.data.signedUrl,
    };
  });
