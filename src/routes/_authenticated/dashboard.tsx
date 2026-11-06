import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useProfiles, useRefData } from "@/hooks/use-auth";
import { STAGES, fmtDate, stageLabel } from "@/lib/crm";
import { taskWindow } from "@/lib/followup";
import { TempBadge } from "@/components/lead-badges";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Verveox CRM" },
      { name: "description", content: "Lead KPIs and activity." },
      { property: "og:title", content: "Dashboard — Verveox CRM" },
      { property: "og:description", content: "Lead KPIs and activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type M = {
  total: number;
  total_all: number;
  today: number;
  week: number;
  month: number;
  hot: number;
  warm: number;
  cold: number;
  contacted: number;
  qualified: number;
  converted: number;
  fu_today: number;
  fu_overdue: number;
  by_day: { day: string; count: number }[];
  by_source: { name: string; count: number }[];
  by_stage: { name: string; count: number }[];
  by_course: { name: string; count: number }[];
  by_campaign: { name: string; count: number }[];
  by_owner: { name: string; count: number; converted: number }[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--foreground)",
  },
};

function Dashboard() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return iso(d);
  });
  const [to, setTo] = useState(() => iso(new Date()));
  const [campaign, setCampaign] = useState("");
  const [source, setSource] = useState("");
  const [course, setCourse] = useState("");
  const [owner, setOwner] = useState("");
  const { data: ref } = useRefData();
  const { data: profiles } = useProfiles();

  const m = useQuery({
    queryKey: ["dash", from, to, campaign, source, course, owner],
    queryFn: async () => {
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      const { data, error } = await supabase.rpc("dashboard_metrics", {
        _from: new Date(from).toISOString(),
        _to: end.toISOString(),
        ...(campaign ? { _campaign: campaign } : {}),
        ...(source ? { _source: source } : {}),
        ...(course ? { _course: course } : {}),
        ...(owner ? { _owner: owner } : {}),
      });
      if (error) throw error;
      return data as unknown as M;
    },
  });
  const lists = useQuery({
    queryKey: ["dash-lists"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const w = taskWindow();
      const [up, od, today, act, conv] = await Promise.all([
        supabase
          .from("followups")
          .select("id, title, due_at, followup_type, lead_id, leads(full_name)")
          .eq("status", "pending")
          .gte("due_at", w.end)
          .order("due_at")
          .limit(6),
        supabase
          .from("followups")
          .select("id, title, due_at, lead_id, leads(full_name)")
          .eq("status", "pending")
          .lt("due_at", w.now)
          .order("due_at")
          .limit(6),
        supabase
          .from("followups")
          .select("id, title, due_at, lead_id, leads(full_name)")
          .eq("status", "pending")
          .gte("due_at", w.start)
          .lt("due_at", w.end)
          .order("due_at")
          .limit(6),
        supabase
          .from("activities")
          .select("id, activity_type, subject, occurred_at, lead_id, leads(full_name)")
          .order("occurred_at", { ascending: false })
          .limit(8),
        supabase
          .from("leads")
          .select("id, full_name, conversion_at, temperature")
          .not("conversion_at", "is", null)
          .order("conversion_at", { ascending: false })
          .limit(6),
      ]);
      for (const r of [up, od, today, act, conv]) if (r.error) throw r.error;
      return {
        up: up.data ?? [],
        od: od.data ?? [],
        today: today.data ?? [],
        act: act.data ?? [],
        conv: conv.data ?? [],
      };
    },
  });

  const d = m.data;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const kpis = d
    ? ([
        ["Total leads (all time)", d.total_all],
        ["New today", d.today],
        ["This week", d.week],
        ["This month", d.month],
        ["Hot", d.hot, "text-hot"],
        ["Warm", d.warm, "text-warm"],
        ["Cold", d.cold, "text-cold"],
        ["Contacted", d.contacted, "", pct(d.contacted, d.total)],
        ["Qualified", d.qualified, "", pct(d.qualified, d.total)],
        ["Converted (enrolled)", d.converted, "text-success", pct(d.converted, d.total)],
        ["Follow-ups due today", d.fu_today],
        ["Overdue follow-ups", d.fu_overdue, d.fu_overdue ? "text-hot" : ""],
      ] as [string, number, string?, string?][])
    : [];
  const funnel = d
    ? [
        { name: "Leads", count: d.total },
        { name: "Contacted", count: d.contacted },
        { name: "Qualified", count: d.qualified },
        { name: "Enrolled", count: d.converted },
      ]
    : [];
  const temps = d
    ? [
        { name: "Hot", v: d.hot, c: "var(--hot)" },
        { name: "Warm", v: d.warm, c: "var(--warm)" },
        { name: "Cold", v: d.cold, c: "var(--cold)" },
      ]
    : [];
  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Rates use leads created in the selected range (non-archived) as the denominator. Contacted = stage moved past New or a contact logged."
      />
      <div className="mb-6 flex flex-wrap gap-2">
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
        <select
          className={sel}
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          aria-label="Campaign"
        >
          <option value="">All campaigns</option>
          {ref?.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Source"
        >
          <option value="">All sources</option>
          {ref?.sources.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          aria-label="Course"
        >
          <option value="">All courses</option>
          {ref?.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          aria-label="Employee"
        >
          <option value="">All employees</option>
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
      </div>
      {m.error && (
        <p className="mb-4 text-sm text-destructive">
          Couldn't load metrics: {(m.error as Error).message}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {m.isLoading
          ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          : kpis.map(([l, v, c, sub]) => (
              <Card key={l} className="p-4">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className={`mt-1 font-display text-2xl font-semibold ${c ?? ""}`}>{v}</div>
                {sub && <div className="text-xs text-muted-foreground">{sub} of range</div>}
              </Card>
            ))}
      </div>

      {d && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Leads received over time">
            <LineChart data={d.by_day}>
              <CartesianGrid stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip {...tip} />
              <Line dataKey="count" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>
          <ChartCard title="Conversion funnel">
            <BarChart data={funnel} layout="vertical">
              <XAxis
                type="number"
                allowDecimals={false}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <Tooltip {...tip} />
              <Bar dataKey="count" fill="var(--info)" radius={4} />
            </BarChart>
          </ChartCard>
          <ChartCard title="Leads by source">
            <SimpleBar data={d.by_source} />
          </ChartCard>
          <ChartCard title="Leads by temperature">
            <PieChart>
              <Pie data={temps} dataKey="v" nameKey="name" innerRadius={50} outerRadius={80}>
                {temps.map((t) => (
                  <Cell key={t.name} fill={t.c} />
                ))}
              </Pie>
              <Tooltip {...tip} />
            </PieChart>
          </ChartCard>
          <ChartCard title="Leads by pipeline stage">
            <SimpleBar
              data={STAGES.map((s) => ({
                name: s.label,
                count: d.by_stage.find((x) => x.name === s.value)?.count ?? 0,
              }))}
            />
          </ChartCard>
          <ChartCard title="Leads by course">
            <SimpleBar data={d.by_course} />
          </ChartCard>
          <ChartCard title="Campaign-wise lead volume">
            <SimpleBar data={d.by_campaign} color="var(--primary)" />
          </ChartCard>
          <ChartCard title="Employee performance (leads / enrolled)">
            <BarChart data={d.by_owner}>
              <CartesianGrid stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip {...tip} />
              <Bar dataKey="count" fill="var(--info)" />
              <Bar dataKey="converted" fill="var(--success)" />
            </BarChart>
          </ChartCard>
        </div>
      )}

      {lists.error && (
        <p className="mt-4 text-sm text-destructive">Unable to load tasks: {lists.error.message}</p>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ListCard
          title="Due today"
          items={lists.data?.today.map((f) => ({
            id: f.id,
            lead: f.lead_id,
            a: f.title,
            b: `${f.leads?.full_name ?? ""} · ${fmtDate(f.due_at, true)}`,
          }))}
        />
        <ListCard
          title="Upcoming follow-ups"
          items={lists.data?.up.map((f) => ({
            id: f.id,
            lead: f.lead_id,
            a: f.title,
            b: `${(f.leads as { full_name: string } | null)?.full_name ?? ""} · ${fmtDate(f.due_at, true)}`,
          }))}
        />
        <ListCard
          title="Overdue tasks"
          danger
          items={lists.data?.od.map((f) => ({
            id: f.id,
            lead: f.lead_id,
            a: f.title,
            b: `${(f.leads as { full_name: string } | null)?.full_name ?? ""} · due ${fmtDate(f.due_at, true)}`,
          }))}
        />
        <ListCard
          title="Recent lead activity"
          items={lists.data?.act.map((a) => ({
            id: a.id,
            lead: a.lead_id,
            a: `${a.activity_type}: ${a.subject ?? ""}`,
            b: `${(a.leads as { full_name: string } | null)?.full_name ?? ""} · ${fmtDate(a.occurred_at, true)}`,
          }))}
        />
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Recent conversions</h3>
          {lists.data?.conv.length ? (
            lists.data.conv.map((l) => (
              <Link
                key={l.id}
                to="/leads/$id"
                params={{ id: l.id }}
                className="flex items-center justify-between border-b py-2 text-sm last:border-0 hover:text-info"
              >
                <span>{l.full_name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TempBadge t={l.temperature} />
                  {fmtDate(l.conversion_at)}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No conversions yet.</p>
          )}
        </Card>
      </div>
      {d && d.total === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No leads in this range.{" "}
          <Link to="/leads" className="text-info">
            Add your first lead
          </Link>
          .
        </p>
      )}
      <span className="hidden">{stageLabel("new")}</span>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </Card>
  );
}
function SimpleBar({
  data,
  color = "var(--info)",
}: {
  data: { name: string; count: number }[];
  color?: string;
}) {
  return (
    <BarChart data={data}>
      <CartesianGrid stroke="var(--border)" />
      <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
      <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} />
      <Tooltip {...tip} />
      <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} />
    </BarChart>
  );
}
function ListCard({
  title,
  items,
  danger,
}: {
  title: string;
  items?: { id: string; lead: string; a: string; b: string }[];
  danger?: boolean;
}) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {!items ? (
        <Skeleton className="h-24" />
      ) : items.length ? (
        items.map((i) => (
          <Link
            key={i.id}
            to="/leads/$id"
            params={{ id: i.lead }}
            className="block border-b py-2 last:border-0 hover:text-info"
          >
            <div className={`text-sm ${danger ? "text-hot" : ""}`}>{i.a}</div>
            <div className="text-xs text-muted-foreground">{i.b}</div>
          </Link>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      )}
    </Card>
  );
}
