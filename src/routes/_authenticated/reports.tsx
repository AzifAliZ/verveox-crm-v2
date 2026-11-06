import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfiles, useRefData } from "@/hooks/use-auth";
import { stageLabel } from "@/lib/crm";
import { fetchAllPages } from "@/lib/persistence";
import { downloadRows } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Verveox CRM" },
      { name: "description", content: "Lead, conversion and team reports." },
      { property: "og:title", content: "Reports — Verveox CRM" },
      { property: "og:description", content: "Lead, conversion and team reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reports,
});

type L = {
  id: string;
  created_at: string;
  source: string;
  campaign_id: string | null;
  course_id: string | null;
  assigned_to: string | null;
  temperature: string;
  stage: string;
  last_contacted_at: string | null;
  lost_reason: string | null;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

function Reports() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 89);
    return iso(d);
  });
  const [to, setTo] = useState(() => iso(new Date()));
  const { data: ref } = useRefData();
  const { data: profiles } = useProfiles();
  const q = useQuery({
    queryKey: ["reports", from, to],
    queryFn: async () => {
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      const rows: L[] = [];
      for (let o = 0; ; o += 1000) {
        const { data, error } = await supabase
          .from("leads")
          .select(
            "id, created_at, source, campaign_id, course_id, assigned_to, temperature, stage, last_contacted_at, lost_reason",
          )
          .is("archived_at", null)
          .gte("created_at", new Date(from).toISOString())
          .lt("created_at", end.toISOString())
          .order("id")
          .range(o, o + 999);
        if (error) throw error;
        rows.push(...(data as L[]));
        if (data.length < 1000) break;
      }
      const fus = await fetchAllPages((offset, endOffset) =>
        supabase
          .from("followups")
          .select("status, due_at")
          .gte("due_at", new Date(from).toISOString())
          .lt("due_at", end.toISOString())
          .order("id")
          .range(offset, endOffset),
      );
      return { rows, fus };
    },
  });

  const d = q.data;
  const group = (key: (l: L) => string) => {
    const m = new Map<string, number>();
    d?.rows.forEach((l) => m.set(key(l), (m.get(key(l)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  };
  const n = d?.rows.length ?? 0;
  const pct = (a: number) => (n ? `${((a / n) * 100).toFixed(1)}%` : "—");
  const contacted = d?.rows.filter((l) => l.last_contacted_at || l.stage !== "new").length ?? 0;
  const qualified =
    d?.rows.filter((l) => ["qualified", "application_started", "enrolled"].includes(l.stage))
      .length ?? 0;
  const enrolled = d?.rows.filter((l) => l.stage === "enrolled").length ?? 0;
  const resp =
    d?.rows
      .filter((l) => l.last_contacted_at)
      .map(
        (l) =>
          (new Date(l.last_contacted_at ?? l.created_at).getTime() -
            new Date(l.created_at).getTime()) /
          3600000,
      )
      .filter((h) => h >= 0) ?? [];
  const avgResp = resp.length
    ? `${(resp.reduce((a, b) => a + b, 0) / resp.length).toFixed(1)} h`
    : "—";
  const due =
    d?.fus.filter((f) => f.status !== "cancelled" && new Date(f.due_at) < new Date()) ?? [];
  const fuRate = due.length
    ? `${((due.filter((f) => f.status === "completed").length / due.length) * 100).toFixed(0)}%`
    : "—";
  const aging = [
    ["0–7 days", 0, 7],
    ["8–30 days", 8, 30],
    ["31–90 days", 31, 90],
    ["90+ days", 91, 99999],
  ].map(([name, a, b]) => ({
    name: name as string,
    count:
      d?.rows.filter((l) => {
        if (["enrolled", "lost", "not_interested", "not_eligible"].includes(l.stage)) return false;
        const age = (Date.now() - new Date(l.created_at).getTime()) / 86400000;
        return age >= (a as number) && age < (b as number) + 1;
      }).length ?? 0,
  }));

  const nameOf = {
    camp: (id: string | null) => ref?.campaigns.find((c) => c.id === id)?.name ?? "No campaign",
    course: (id: string | null) => ref?.courses.find((c) => c.id === id)?.name ?? "Unspecified",
    owner: (id: string | null) => {
      const p = profiles?.find((x) => x.id === id);
      return p ? p.full_name || p.email : "Unassigned";
    },
  };
  const tables: [string, { name: string; count: number }[]][] = [
    [
      "Leads by date",
      group((l) => l.created_at.slice(0, 10)).sort((a, b) => a.name.localeCompare(b.name)),
    ],
    ["Leads by source", group((l) => l.source)],
    ["Leads by campaign", group((l) => nameOf.camp(l.campaign_id))],
    ["Leads by course", group((l) => nameOf.course(l.course_id))],
    ["Leads by employee", group((l) => nameOf.owner(l.assigned_to))],
    ["Leads by temperature", group((l) => l.temperature)],
    ["Leads by stage", group((l) => stageLabel(l.stage))],
    [
      "Lost-lead reasons",
      group((l) => (l.stage === "lost" ? l.lost_reason || "No reason recorded" : "")).filter(
        (x) => x.name,
      ),
    ],
    ["Open lead aging", aging],
  ];

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        description="All rates use unique non-archived leads created in the range as the denominator."
        actions={
          <>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-auto"
              aria-label="From"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-auto"
              aria-label="To"
            />
          </>
        }
      />
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
            {[
              ["Leads", n],
              ["Lead→contact", pct(contacted)],
              ["Qualification rate", pct(qualified)],
              ["Enrollment rate", pct(enrolled)],
              ["Avg. first response*", avgResp],
              ["Follow-up completion", fuRate],
            ].map(([l, v]) => (
              <Card key={l as string} className="p-4">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className="mt-1 font-display text-xl font-semibold">{v}</div>
              </Card>
            ))}
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            *Approximated as time from lead creation to the most recent logged contact. Follow-up
            completion = completed ÷ (due, not cancelled). Campaign cost per lead is on the
            Campaigns page when spend exists.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tables.map(([title, data]) => (
              <Card key={title} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      downloadRows(
                        data,
                        [
                          { key: "name", label: title.replace("Leads by ", "") },
                          { key: "count", label: "Leads" },
                        ],
                        title.toLowerCase().replace(/\W+/g, "-"),
                        "csv",
                      )
                    }
                  >
                    Export
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto text-sm">
                  {data.length ? (
                    data.map((r) => (
                      <div
                        key={r.name}
                        className="flex justify-between border-b py-1 last:border-0"
                      >
                        <span>{r.name}</span>
                        <span className="tabular-nums">{r.count}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No data.</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
