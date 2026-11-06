import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMe } from "@/hooks/use-auth";
import { fmtDate } from "@/lib/crm";
import { downloadRows } from "@/lib/export";
import { IMPORT_FIELDS, parseUpload, mappingSchema } from "@/lib/transfer";
import {
  uploadTransfer,
  previewImport,
  runImportBatch,
  downloadTransfer,
} from "@/lib/transfer.functions";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import / Export — Verveox CRM" },
      { name: "description", content: "Secure lead imports, exports and transfer history." },
      { property: "og:title", content: "Import / Export — Verveox CRM" },
      { property: "og:description", content: "Secure lead imports, exports and transfer history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

type Upload = { id: string; headers: string[]; preview: Record<string, string>[]; total: number };
type Review = Awaited<ReturnType<typeof previewImport>>;
function ImportPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadTransfer),
    previewFn = useServerFn(previewImport),
    batchFn = useServerFn(runImportBatch),
    downloadFn = useServerFn(downloadTransfer);
  const [upload, setUpload] = useState<Upload | null>(null),
    [review, setReview] = useState<Review | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({}),
    [mode, setMode] = useState<"skip" | "update">("skip"),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState("");
  const jobs = useQuery({
    queryKey: ["transfer_jobs", me?.id],
    enabled: !!me,
    refetchInterval: busy ? 1000 : 15000,
    queryFn: async () => {
      const r = await supabase
        .from("transfer_jobs")
        .select(
          "id,kind,status,file_name,total_rows,processed_rows,imported_rows,updated_rows,skipped_rows,failed_rows,errors,created_at,expires_at",
        )
        .neq("kind", "upload")
        .order("created_at", { ascending: false })
        .limit(50);
      if (r.error) throw r.error;
      return r.data;
    },
  });
  async function onFile(file: File) {
    setUpload(null);
    setReview(null);
    setError("");
    setProgress(null);
    setBusy(true);
    try {
      parseUpload(file.name, new Uint8Array(await file.arrayBuffer()));
      const data = new FormData();
      data.set("file", file);
      const result = await uploadFn({ data });
      setUpload(result);
      const auto: Record<string, string> = {};
      for (const [key, label] of IMPORT_FIELDS) {
        const h = result.headers.find(
          (h) =>
            h.toLowerCase().replace(/[^a-z]/g, "") === key.replace(/_/g, "") ||
            h.toLowerCase() === label.toLowerCase(),
        );
        if (h) auto[key] = h;
      }
      setMapping(auto);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function dryRun() {
    if (!upload) return;
    setBusy(true);
    setError("");
    setReview(null);
    try {
      mappingSchema.parse(mapping);
      setReview(await previewFn({ data: { id: upload.id, mapping, mode } }));
      jobs.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run(id: string) {
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      for (;;) {
        const r = await batchFn({ data: { id } });
        setProgress(Math.round((r.processed_rows / Math.max(1, r.total_rows)) * 100));
        jobs.refetch();
        if (r.status === "completed") {
          toast.success(
            `Imported ${r.imported_rows}, updated ${r.updated_rows}, skipped ${r.skipped_rows}, failed ${r.failed_rows}`,
          );
          setReview(null);
          break;
        }
      }
    } catch (e) {
      setError(`${(e as Error).message}. Saved progress is retained; resume from history.`);
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
      jobs.refetch();
    }
  }
  async function download(id: string) {
    try {
      const result = await downloadFn({ data: { id } });
      const a = document.createElement("a");
      a.href = result.url;
      a.download = "";
      a.click();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const errors = (value: unknown) =>
    Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  return (
    <div>
      <PageHeader title="Import / Export" />
      {me?.canManage ? (
        <section className="border-y py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Import candidates</h2>
            <span className="text-xs text-muted-foreground">
              CSV · XLSX · XLS / 5 MB / 5,000 rows
            </span>
          </div>
          <input
            className="mt-4 max-w-full text-sm"
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={busy}
            aria-label="Choose file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          {busy && progress === null && (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              Validating…
            </p>
          )}
          {upload && (
            <>
              <p className="mt-4 text-sm">{upload.total} candidate rows</p>
              <fieldset disabled={busy} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {IMPORT_FIELDS.map(([key, label]) => (
                  <label
                    key={key}
                    className="flex min-w-0 items-center justify-between gap-2 text-sm"
                  >
                    {label}
                    {key === "full_name" ? " *" : ""}
                    <select
                      aria-label={`Map ${label}`}
                      className="h-9 min-w-0 w-40 rounded-md border border-input bg-background px-2"
                      value={mapping[key] ?? ""}
                      onChange={(e) => {
                        setMapping({ ...mapping, [key]: e.target.value });
                        setReview(null);
                      }}
                    >
                      <option value="">Skip column</option>
                      {upload.headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>
              <div className="mt-5 overflow-x-auto border text-xs">
                <table className="w-full">
                  <thead>
                    <tr>
                      {upload.headers.map((h) => (
                        <th className="border-b p-2 text-left" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {upload.preview.map((r, i) => (
                      <tr key={i}>
                        {upload.headers.map((h) => (
                          <td className="max-w-52 break-words p-2" key={h}>
                            {r[h]?.slice(0, 80)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <fieldset disabled={busy} className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                <legend className="mb-2 text-muted-foreground">Existing candidates</legend>
                {(["skip", "update"] as const).map((m) => (
                  <label className="flex items-center gap-2" key={m}>
                    <input
                      type="radio"
                      checked={mode === m}
                      onChange={() => {
                        setMode(m);
                        setReview(null);
                      }}
                    />
                    {m === "skip" ? "Skip duplicates" : "Update existing"}
                  </label>
                ))}
                <Button variant="outline" onClick={dryRun}>
                  Dry run
                </Button>
              </fieldset>
            </>
          )}
          {review && (
            <div className="mt-5 border-t pt-4">
              <h3 className="font-semibold">Dry-run results</h3>
              <p className="my-3 text-sm">
                <span className="text-success">{review.newRows} new</span> ·{" "}
                <span className="text-warning">{review.duplicates} duplicates</span> ·{" "}
                <span className="text-destructive">{review.invalid} invalid</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || review.invalid === review.total}
                  onClick={() => run(review.id)}
                >
                  Run import
                </Button>
                {review.errors.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadRows(
                        review.errors,
                        [
                          { key: "row", label: "Row" },
                          { key: "error", label: "Error" },
                        ],
                        "dry-run-errors",
                        "csv",
                      )
                    }
                  >
                    Download error report
                  </Button>
                )}
              </div>
            </div>
          )}
          {progress !== null && (
            <div className="mt-4">
              <Progress value={progress} />
              <p className="mt-2 text-sm" role="status">
                {progress}% processed
              </p>
            </div>
          )}
        </section>
      ) : (
        <p className="mb-5 text-sm text-muted-foreground">
          Imports require a Manager or Super Admin.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <h2 className="mb-3 mt-7 font-semibold">Transfer history</h2>
      {jobs.error && (
        <p role="alert" className="text-destructive">
          History could not be loaded.
        </p>
      )}
      <div className="overflow-x-auto border text-sm">
        <table className="w-full">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              {[
                "Date",
                "File",
                "Type",
                "Status",
                "Progress",
                "Imported",
                "Updated",
                "Skipped",
                "Failed",
                "",
              ].map((h, i) => (
                <th className="p-3" key={i}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.data?.map((j) => (
              <tr className="border-b" key={j.id}>
                <td className="p-3 whitespace-nowrap">{fmtDate(j.created_at, true)}</td>
                <td className="p-3">{j.file_name}</td>
                <td className="p-3">{j.kind}</td>
                <td className="p-3">{j.status === "pending" ? "Dry run" : j.status}</td>
                <td className="p-3">
                  {j.processed_rows}/{j.total_rows}
                </td>
                <td className="p-3">{j.imported_rows}</td>
                <td className="p-3">{j.updated_rows}</td>
                <td className="p-3">{j.skipped_rows}</td>
                <td className="p-3">{j.failed_rows}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    {j.kind === "import" &&
                      j.status !== "completed" &&
                      new Date(j.expires_at) > new Date() &&
                      me?.canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => run(j.id)}
                        >
                          {j.status === "pending" ? "Run" : "Resume"}
                        </Button>
                      )}
                    {j.kind === "export" && j.status === "completed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={new Date(j.expires_at) <= new Date()}
                        onClick={() => download(j.id)}
                      >
                        {new Date(j.expires_at) <= new Date() ? "Expired" : "Download"}
                      </Button>
                    )}
                    {errors(j.errors).length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          downloadRows(
                            errors(j.errors),
                            [
                              { key: "row", label: "Row" },
                              { key: "error", label: "Error" },
                            ],
                            "import-errors",
                            "csv",
                          )
                        }
                      >
                        Errors
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.isLoading && <p className="p-4">Loading history…</p>}
        {jobs.data?.length === 0 && <p className="p-4 text-muted-foreground">No transfers yet.</p>}
      </div>
    </div>
  );
}
