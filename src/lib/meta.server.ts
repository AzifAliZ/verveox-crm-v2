import { supabaseAdmin } from "@/integrations/supabase/client.server";
export { verifyMetaSignature } from "./meta-security";

const GRAPH = "https://graph.facebook.com/v21.0";
import { metaFailurePermanent } from "./meta-retry";
import { z } from "zod";

const graphLeadSchema = z.object({
  field_data: z
    .array(z.object({ name: z.string().max(100), values: z.array(z.string().max(2000)).max(50) }))
    .max(100)
    .optional(),
  campaign_id: z
    .string()
    .regex(/^\d{1,100}$/)
    .optional(),
  campaign_name: z.string().max(500).optional(),
  adset_id: z
    .string()
    .regex(/^\d{1,100}$/)
    .optional(),
  adset_name: z.string().max(500).optional(),
  ad_id: z
    .string()
    .regex(/^\d{1,100}$/)
    .optional(),
  ad_name: z.string().max(500).optional(),
  form_id: z
    .string()
    .regex(/^\d{1,100}$/)
    .optional(),
});
const pick = (fields: { name: string; values: string[] }[], ...names: string[]) => {
  for (const name of names) {
    const value = fields.find((f) => f.name.toLowerCase() === name)?.values[0]?.trim();
    if (value) return value;
  }
  return null;
};

/** Claim ownership in PostgreSQL; finalize lead + attribution + event atomically. */
export async function processMetaEvent(eventId: string) {
  const claim = await supabaseAdmin.rpc("claim_meta_event", { _id: eventId });
  if (claim.error) throw new Error("Event claim unavailable");
  const ev = claim.data?.[0];
  if (!ev?.claim_token) return { status: "not_eligible" };
  const claimToken = ev.claim_token;
  try {
    const payload = z
      .object({
        leadgen_id: z.string().regex(/^\d{1,100}$/),
        campaign_id: z.string().optional(),
        adgroup_id: z.string().optional(),
        ad_id: z.string().optional(),
      })
      .parse(ev.payload);
    const existing = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("meta_lead_id", payload.leadgen_id)
      .maybeSingle();
    if (existing.error) throw new Error("Candidate lookup unavailable");
    let data: Record<string, string | number | null> = {};
    if (!existing.data) {
      const token = process.env["META_PAGE_ACCESS_TOKEN"];
      if (!token) throw new Error("Page access token is not configured");
      const res = await fetch(
        `${GRAPH}/${encodeURIComponent(payload.leadgen_id)}?fields=field_data,created_time,ad_id,adset_id,campaign_id,form_id,campaign_name,ad_name,adset_name`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      const raw = (await res.json()) as { error?: { code?: number; is_transient?: boolean } };
      if (!res.ok || raw.error)
        throw Object.assign(new Error(`Meta retrieval failed (HTTP ${res.status})`), {
          permanent: !raw.error?.is_transient && metaFailurePermanent(res.status, raw.error?.code),
        });
      const parsed = graphLeadSchema.safeParse(raw);
      if (!parsed.success)
        throw Object.assign(new Error("Invalid Meta lead response"), { permanent: true });
      const body = parsed.data,
        fields = body.field_data ?? [];
      const email = pick(fields, "email"),
        year = Number(pick(fields, "graduation_year"));
      data = {
        full_name: (
          pick(fields, "full_name", "name") ??
          ([pick(fields, "first_name"), pick(fields, "last_name")].filter(Boolean).join(" ") ||
            "Meta lead")
        ).slice(0, 150),
        email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.slice(0, 255) : null,
        phone: pick(fields, "phone_number", "phone")?.slice(0, 30) ?? null,
        college: pick(fields, "college", "college_name")?.slice(0, 500) ?? null,
        degree: pick(fields, "degree", "qualification")?.slice(0, 500) ?? null,
        graduation_year: Number.isInteger(year) && year >= 1970 && year <= 2100 ? year : null,
        interest: pick(fields, "course", "interest", "program"),
        campaign_external_id: body.campaign_id ?? payload.campaign_id ?? null,
        campaign_name: body.campaign_name ?? null,
        adset_external_id: body.adset_id ?? payload.adgroup_id ?? null,
        adset_name: body.adset_name ?? null,
        ad_external_id: body.ad_id ?? payload.ad_id ?? null,
        ad_name: body.ad_name ?? null,
        form_id: body.form_id ?? null,
      };
    }
    const completed = await supabaseAdmin.rpc("complete_meta_event", {
      _id: eventId,
      _claim: claimToken,
      _data: data,
    });
    if (completed.error) throw new Error("Event finalization unavailable");
    return completed.data as { status: string; lead_id?: string };
  } catch (error) {
    const permanent = error instanceof z.ZodError || !!(error as { permanent?: boolean }).permanent;
    const message =
      error instanceof z.ZodError
        ? "Invalid event payload"
        : error instanceof Error
          ? error.message
          : "Meta processing unavailable";
    const failed = await supabaseAdmin.rpc("fail_meta_event", {
      _id: eventId,
      _claim: claimToken,
      _error: message,
      _permanent: permanent,
    });
    if (failed.error) throw new Error("Failure recording unavailable; lease recovery required");
    return { status: failed.data ?? "lease_lost", error: message };
  }
}

export async function processDueMetaEvents() {
  const now = new Date().toISOString();
  const due = await supabaseAdmin
    .from("integration_events")
    .select("id")
    .eq("provider", "meta")
    .or(
      `and(status.in.(received,failed),next_attempt_at.lte.${now}),and(status.eq.processing,lease_expires_at.lte.${now})`,
    )
    .order("received_at")
    .limit(10);
  if (due.error) throw new Error("Recovery queue unavailable");
  const results = await Promise.all(due.data.map((e) => processMetaEvent(e.id)));
  return {
    processed: results.filter((r) => ["processed", "duplicate"].includes(r.status)).length,
    failed: results.filter((r) => ["failed", "dead_letter", "lease_lost"].includes(r.status))
      .length,
  };
}

/** Field names accepted from Meta lead forms, per CRM field (first match wins). */
// Documented on the Integrations page.
export const META_FIELD_MAP: Record<string, string[]> = {
  full_name: ["full_name", "name", "first_name + last_name"],
  email: ["email"],
  phone: ["phone_number", "phone"],
  college: ["college", "college_name"],
  degree: ["degree", "qualification"],
  graduation_year: ["graduation_year"],
  interest: ["course", "interest", "program"],
};

/** Real connectivity test against the Graph API using the server-side Page token. */

export async function testMetaConnection(actorId: string) {
  const token = process.env["META_PAGE_ACCESS_TOKEN"];

  const missing = [
    "META_VERIFY_TOKEN",
    "META_APP_SECRET",
    "META_PAGE_ACCESS_TOKEN",
  ].filter((k) => !process.env[k]);

  const details: Record<string, unknown> = { missing };

  let ok = false;
  let error: string | null = null;

  try {
    if (!token) {
      throw new Error("Page access token is not configured");
    }

    const me = await fetch(`${GRAPH}/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });

    const meBody = (await me.json()) as {
      id?: string;
      name?: string;
      error?: { message: string };
    };

    if (!me.ok || meBody.error) {
      throw new Error(
        `Token check failed (HTTP ${me.status}): ${
          meBody.error?.message ?? "Unknown Meta API error"
        }`,
      );
    }

    details.page = {
      id: meBody.id,
      name: meBody.name,
    };

    const forms = await fetch(
      `${GRAPH}/${meBody.id}/leadgen_forms?fields=id,name,status&limit=25`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );

    const fb = (await forms.json()) as {
      data?: { id: string; name: string; status: string }[];
      error?: { message: string };
    };

    if (!forms.ok || fb.error) {
      throw new Error(
        `Lead form access failed (HTTP ${forms.status}): ${
          fb.error?.message ?? "Unknown Meta API error"
        }`,
      );
    }

    details.forms = (fb.data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      status: f.status,
    }));

    if (missing.length) {
      throw new Error(
        `Graph access works, but webhook secrets are missing: ${missing.join(", ")}`,
      );
    }

    ok = true;
  } catch (e) {
    error = (e as Error).message.slice(0, 1000);
  }

  // Read-only Supabase admin query diagnostic
  const { data: adminTest, error: adminError } = await supabaseAdmin
    .from("integration_checks")
    .select("id")
    .limit(1);

  console.info("[SUPABASE ADMIN QUERY TEST]", {
    success: !adminError,
    errorCode: adminError?.code ?? null,
    errorMessage: adminError?.message ?? null,
    rowsReturned: adminTest?.length ?? 0,
  });

  // Existing integration check insert
  const { error: saveErr } = await supabaseAdmin
    .from("integration_checks")
    .insert({
      provider: "meta",
      ok,
      details: details as never,
      error,
      checked_by: actorId,
    });

  if (saveErr) {
    console.error("[META CHECK SAVE ERROR]", {
      code: saveErr.code,
      message: saveErr.message,
      details: saveErr.details,
      hint: saveErr.hint,
    });

    throw new Error(
      `Supabase save failed (${saveErr.code}): ${saveErr.message}`,
    );
  }

  return { ok, error, details };
}
