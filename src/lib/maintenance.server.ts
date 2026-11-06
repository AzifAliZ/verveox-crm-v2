import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function cleanExpiredTransfers() {
  const expired = await supabaseAdmin
    .from("transfer_jobs")
    .select("id,file_path")
    .lt("expires_at", new Date().toISOString())
    .or("file_path.not.is.null,payload.neq.{}")
    .limit(100);
  if (expired.error) throw new Error("Temporary file cleanup unavailable");
  let processed = 0,
    failed = 0;
  for (const job of expired.data) {
    if (job.file_path) {
      const removed = await supabaseAdmin.storage.from("crm-transfers").remove([job.file_path]);
      if (removed.error) {
        failed++;
        continue;
      }
    }
    const saved = await supabaseAdmin
      .from("transfer_jobs")
      .update({ file_path: null, payload: {} })
      .eq("id", job.id)
      .lt("expires_at", new Date().toISOString());
    if (saved.error) failed++;
    else processed++;
  }
  return { processed, failed };
}

export async function runMaintenance(kind: "meta" | "cleanup") {
  const run = await supabaseAdmin.from("background_runs").insert({ kind }).select("id").single();
  if (run.error) throw new Error("Monitoring unavailable");
  try {
    const result =
      kind === "cleanup"
        ? await cleanExpiredTransfers()
        : await (await import("./meta.server")).processDueMetaEvents();
    const finished = await supabaseAdmin
      .from("background_runs")
      .update({
        status: result.failed ? "failed" : "completed",
        ...result,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.data.id);
    if (finished.error) throw new Error("Monitoring update unavailable");
    return result;
  } catch {
    await supabaseAdmin
      .from("background_runs")
      .update({
        status: "failed",
        error: "Background processing failed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.data.id);
    throw new Error("Background processing failed");
  }
}
