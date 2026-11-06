import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/crm";
import {
  metaIntegrationStatus,
  reprocessMetaEvent,
  testMetaIntegration,
  retryFailedMetaEvents,
} from "@/lib/team.functions";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — Verveox CRM" },
      { name: "description", content: "Meta Lead Ads integration health." },
      { property: "og:title", content: "Integrations — Verveox CRM" },
      { property: "og:description", content: "Meta Lead Ads integration health." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Integrations,
});

function Integrations() {
  const statusFn = useServerFn(metaIntegrationStatus);
  const reprocess = useServerFn(reprocessMetaEvent);
  const status = useQuery({ queryKey: ["meta-status"], queryFn: () => statusFn() });
  const events = useQuery({
    queryKey: ["meta-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_events")
        .select("*")
        .eq("provider", "meta")
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const testFn = useServerFn(testMetaIntegration);
  const retryAll = useServerFn(retryFailedMetaEvents);
  const [busy, setBusy] = useState(false);
  const check = useQuery({
    queryKey: ["meta-check"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_checks")
        .select("*")
        .eq("provider", "meta")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const s = status.data;
  const processEnv = s?.processEnv;
  const diagnostic = s?.runtime;

  const configured = !!(
  processEnv?.META_VERIFY_TOKEN &&
  processEnv?.META_APP_SECRET &&
  processEnv?.META_PAGE_ACCESS_TOKEN
);
  const processed = events.data?.some((e) => e.status === "processed");
  const lastOk = check.data?.ok === true;
  const connected = configured && lastOk;
  const label = status.isPending
    ? "Checking..."
    : status.isError
      ? "Status check failed"
      : !connected
        ? "Not connected"
        : processed
          ? "Connected — leads received"
          : "Connected — no leads received yet";
  const ev = events.data ?? [];
  const count = (st: string) => ev.filter((e) => e.status === st).length;
  const lastLead = ev.find((e) => e.status === "processed");
  const det = (check.data?.details ?? {}) as {
    page?: { id: string; name: string };
    forms?: { id: string; name: string; status: string }[];
  };
  const runTest = async () => {
    setBusy(true);
    try {
      const r = await testFn();
      if (r.ok) {
        toast.success("Meta connection verified");
      } else {
        toast.error(r.error ?? "Test failed");
      }
      check.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const runRetry = async () => {
    setBusy(true);
    try {
      const r = await retryAll();
      toast.message(`Retried: ${r.processed} succeeded, ${r.failed} still failing`);
      events.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const webhook =
    typeof window !== "undefined" ? `${window.location.origin}/api/public/meta-webhook` : "";

  return (
    <div>
      <PageHeader title="Integrations" />
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Meta Lead Ads (Facebook & Instagram)</h2>
          <Badge variant={configured ? (processed ? "success" : "warm") : "muted"}>{label}</Badge>
        </div>
        {status.isError && (
          <div className="mt-3 rounded-md border border-destructive p-3 text-sm text-destructive">
            Status request failed:{" "}
            {status.error instanceof Error ? status.error.message : "Unknown server error"}
          </div>
        )}

        <ul className="mt-3 space-y-1 text-sm">
          <li>
            Verify token:{" "}
            {status.isPending
              ? "checking..."
              : status.isError
                ? "unknown"
                : processEnv?.META_VERIFY_TOKEN
                  ? "set"
                  : "missing"}
          </li>
          <li>
            App secret:{" "}
            {status.isPending
              ? "checking..."
              : status.isError
                ? "unknown"
                : processEnv?.META_APP_SECRET
                  ? "set"
                  : "missing"}
          </li>
          <li>
            Page access token:{" "}
            {status.isPending
              ? "checking..."
              : status.isError
                ? "unknown"
                : processEnv?.META_PAGE_ACCESS_TOKEN
                  ? "set"
                  : "missing"}
          </li>
        </ul>

        {diagnostic && processEnv && (
  <details className="mt-3 rounded-md border p-3 text-sm">
    <summary className="cursor-pointer font-medium">
      Server environment diagnostics
    </summary>

    <ul className="mt-2 space-y-1">
      <li>Process exists: {String(diagnostic.processExists)}</li>
      <li>
        Process environment exists: {String(diagnostic.processEnvExists)}
      </li>
      <li>
        META_VERIFY_TOKEN detected:{" "}
        {String(processEnv.META_VERIFY_TOKEN)}
      </li>
      <li>
        META_APP_SECRET detected:{" "}
        {String(processEnv.META_APP_SECRET)}
      </li>
      <li>
        META_PAGE_ACCESS_TOKEN detected:{" "}
        {String(processEnv.META_PAGE_ACCESS_TOKEN)}
      </li>
    </ul>
  </details>
)}
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ["Processed", count("processed")],
            ["Duplicates", count("duplicate")],
            [
              "Retrying",
              count("failed") + count("received") + count("pending") + count("processing"),
            ],
            ["Permanent failures", count("permanent_failure")],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{k} (last 100)</div>
              <div className="text-xl font-semibold">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-sm">
          <div>
            Last connection test:{" "}
            {check.data
              ? `${fmtDate(check.data.checked_at, true)} — ${check.data.ok ? "passed" : "failed"}`
              : "never run"}
          </div>
          {check.data?.error && <div className="text-destructive">{check.data.error}</div>}
          {det.page && (
            <div>
              Page: {det.page.name} ({det.page.id}) · {det.forms?.length ?? 0} lead forms accessible
            </div>
          )}
          <div>
            Last lead imported:{" "}
            {lastLead ? fmtDate(lastLead.processed_at ?? lastLead.received_at, true) : "none"}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={runTest} disabled={busy}>
            Test connection
          </Button>
          <Button size="sm" variant="outline" onClick={runRetry} disabled={busy}>
            Retry pending/failed events
          </Button>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">Field mapping</summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>Full name ← full_name, name, or first_name + last_name</li>
            <li>Email ← email (validated)</li>
            <li>Phone ← phone_number, phone</li>
            <li>College ← college, college_name</li>
            <li>Degree ← degree, qualification</li>
            <li>Graduation year ← graduation_year</li>
            <li>Course interest ← course, interest, program</li>
            <li>Campaign / ad set / ad / form ← Graph API lead attribution (saved to Campaigns)</li>
          </ul>
        </details>
        <div className="mt-4 rounded-md bg-muted p-3 text-sm">
          <div className="font-medium">Setup</div>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              Create a Meta developer app with the Webhooks and Lead Ads products; request{" "}
              <code>leads_retrieval</code>, <code>pages_manage_metadata</code>,{" "}
              <code>pages_show_list</code>.
            </li>
            <li>
              Ask Lovable to add the three secrets above (they are stored server-side, never in the
              browser).
            </li>
            <li>
              In Webhooks → Page, set the callback URL to{" "}
              <code className="break-all text-foreground">{webhook}</code> and the same verify
              token, then subscribe to <code>leadgen</code>.
            </li>
            <li>
              Click <b>Test connection</b> — the status stays Not connected until it passes.
            </li>
            <li>
              Subscribe your Page to the app, then send a test lead from Meta's Lead Ads Testing
              Tool. It should appear below and in Leads.
            </li>
          </ol>
        </div>
      </Card>
      <h3 className="mb-2 text-sm font-semibold">Recent webhook events</h3>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Received</th>
              <th className="p-3">Lead ID</th>
              <th className="p-3">Status</th>
              <th className="p-3">Attempts</th>
              <th className="p-3">Error</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {events.data?.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="p-3 text-xs">{fmtDate(e.received_at, true)}</td>
                <td className="p-3 font-mono text-xs">{e.external_event_id}</td>
                <td className="p-3">
                  <Badge
                    variant={
                      e.status === "processed"
                        ? "success"
                        : e.status.includes("fail")
                          ? "hot"
                          : "muted"
                    }
                  >
                    {e.status}
                  </Badge>
                </td>
                <td className="p-3">{e.attempts}</td>
                <td
                  className="max-w-xs truncate p-3 text-xs text-muted-foreground"
                  title={e.last_error ?? ""}
                >
                  {e.last_error}
                </td>
                <td className="p-3">
                  {(e.status === "failed" || e.status === "permanent_failure") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const r = await reprocess({ data: { eventId: e.id } });
                          toast[r.status === "processed" ? "success" : "error"](
                            `Result: ${r.status}`,
                          );
                          events.refetch();
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                    >
                      Retry
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.data?.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No events received yet.</p>
        )}
      </div>
    </div>
  );
}
