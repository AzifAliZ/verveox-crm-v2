import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useProfiles } from "@/hooks/use-auth";
import { fmtDate } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit logs — Verveox CRM" },
      { name: "description", content: "Read-only record of important changes." },
      { property: "og:title", content: "Audit logs — Verveox CRM" },
      { property: "og:description", content: "Read-only record of important changes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Audit,
});

function Audit() {
  const [page, setPage] = useState(0);
  const [action, setAction] = useState("");
  const { data: profiles } = useProfiles();
  const q = useQuery({
    queryKey: ["audit", page, action],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let qq = supabase.from("audit_logs").select("*", { count: "exact" });
      if (action) qq = qq.eq("action", action);
      const { data, error, count } = await qq
        .order("created_at", { ascending: false })
        .range(page * 50, page * 50 + 49);
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });
  const who = (id: string | null) =>
    profiles?.find((p) => p.id === id)?.full_name ?? (id ? id.slice(0, 8) : "System");
  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Read-only. No user, including admins, can edit or delete entries from the app."
        actions={
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(0);
            }}
            aria-label="Action"
          >
            <option value="">All actions</option>
            {["create", "update", "archive", "restore", "delete", "export", "invite", "insert"].map(
              (a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ),
            )}
          </select>
        }
      />
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="overflow-x-auto rounded-lg border bg-card text-sm">
        <table className="w-full">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">When</th>
              <th className="p-3">Actor</th>
              <th className="p-3">Action</th>
              <th className="p-3">Entity</th>
              <th className="p-3">Changes</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.rows.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="p-3 text-xs">{fmtDate(r.created_at, true)}</td>
                <td className="p-3">{who(r.actor_id)}</td>
                <td className="p-3">{r.action}</td>
                <td className="p-3 text-xs">
                  {r.entity_type}
                  <br />
                  <span className="font-mono text-muted-foreground">
                    {r.entity_id?.slice(0, 8)}
                  </span>
                </td>
                <td className="max-w-md p-3">
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                    {JSON.stringify(r.changes ?? r.metadata, null, 1)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={(page + 1) * 50 >= (q.data?.count ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
