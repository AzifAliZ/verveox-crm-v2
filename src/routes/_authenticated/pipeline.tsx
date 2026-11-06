import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { TempBadge, PriorityBadge } from "@/components/lead-badges";
import { Button } from "@/components/ui/button";
import { fetchAllPages, requireAffectedRows } from "@/lib/persistence";
import { stagePatch } from "@/lib/pipeline";
import { useMe, useProfiles, useRefData } from "@/hooks/use-auth";
import { STAGES, TEMPERATURES, fmtDate, type Stage } from "@/lib/crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline — Verveox CRM" },
      { name: "description", content: "Drag leads between pipeline stages." },
      { property: "og:title", content: "Pipeline — Verveox CRM" },
      { property: "og:description", content: "Drag leads between pipeline stages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pipeline,
});

type Card = {
  id: string;
  full_name: string;
  stage: Stage;
  temperature: string;
  priority: string;
  score: number;
  assigned_to: string | null;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  courses: { name: string } | null;
};

function Pipeline() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: ref } = useRefData();
  const { data: profiles } = useProfiles();
  const emptyFilters = { course: "", source: "", temperature: "", owner: "", stage: "" };
  const [f, setF] = useState(emptyFilters);
  const moving = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const key = ["pipeline", f];

  const q = useQuery({
    queryKey: key,
    enabled: !!me,
    queryFn: async ({ signal }) => {
      return fetchAllPages<Card>(async (from, to) => {
        let qq = supabase
          .from("leads")
          .select(
            "id, full_name, stage, temperature, priority, score, assigned_to, last_contacted_at, next_followup_at, courses(name)",
          )
          .is("archived_at", null);
        if (f.course) qq = qq.eq("course_id", f.course);
        if (f.source) qq = qq.eq("source", f.source);
        if (f.temperature) qq = qq.eq("temperature", f.temperature as "hot");
        if (f.owner) qq = qq.eq("assigned_to", f.owner);
        if (f.stage) qq = qq.eq("stage", f.stage as Stage);
        const { data, error } = await qq
          .order("score", { ascending: false })
          .order("id")
          .range(from, to)
          .abortSignal(signal);
        return { data: data as unknown as Card[] | null, error };
      });
    },
  });

  async function move(id: string, stage: Stage) {
    if (moving.current || !me?.is_active) return;
    moving.current = true;
    await qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<Card[]>(key);
    const card = prev?.find((c) => c.id === id);
    if (!card || card.stage === stage) {
      moving.current = false;
      return;
    }
    qc.setQueryData<Card[]>(key, (d) => d?.map((c) => (c.id === id ? { ...c, stage } : c)));
    setSaving(id);
    try {
      const { data, error } = await supabase
        .from("leads")
        .update(stagePatch(stage))
        .eq("id", id)
        .eq("stage", card.stage)
        .is("archived_at", null)
        .select("id");
      if (error) throw error;
      requireAffectedRows(data?.length ?? 0);
      toast.success(`${card.full_name} → ${STAGES.find((s) => s.value === stage)?.label}`);
    } catch (error) {
      qc.setQueryData(key, prev);
      toast.error(
        error instanceof Error ? error.message : "Stage change failed. Previous position restored.",
      );
    } finally {
      moving.current = false;
      setSaving(null);
      for (const prefix of ["pipeline", "leads", "lead", "dashboard", "reports"])
        qc.invalidateQueries({ queryKey: [prefix] });
    }
  }
  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const name = (id: string | null) => {
    const p = profiles?.find((x) => x.id === id);
    return p ? p.full_name || p.email : "Unassigned";
  };

  return (
    <div>
      <PageHeader title="Pipeline" />
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          className={sel}
          value={f.course}
          onChange={(e) => setF({ ...f, course: e.target.value })}
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
          value={f.source}
          onChange={(e) => setF({ ...f, source: e.target.value })}
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
          value={f.temperature}
          onChange={(e) => setF({ ...f, temperature: e.target.value })}
          aria-label="Temperature"
        >
          <option value="">All temperatures</option>
          {TEMPERATURES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={f.stage}
          onChange={(e) => setF({ ...f, stage: e.target.value })}
          aria-label="Stage"
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={f.owner}
          onChange={(e) => setF({ ...f, owner: e.target.value })}
          aria-label="Owner"
        >
          <option value="">All owners</option>
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
        {Object.values(f).some(Boolean) && (
          <Button variant="ghost" onClick={() => setF(emptyFilters)}>
            Clear filters
          </Button>
        )}
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.filter((s) => !f.stage || s.value === f.stage).map((s) => {
          const cards = q.data?.filter((c) => c.stage === s.value) ?? [];
          return (
            <div
              key={s.value}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s.value);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragId) void move(dragId, s.value);
                setDragId(null);
              }}
              aria-label={`${s.label} stage`}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-lg border bg-card/50",
                over === s.value && "border-info",
              )}
            >
              <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-semibold">
                {s.label}
                <span className="text-xs text-muted-foreground">{cards.length}</span>
              </div>
              <div className="flex min-h-24 flex-col gap-2 p-2">
                {q.isLoading ? (
                  <Skeleton className="h-20" />
                ) : (
                  cards.map((c) => (
                    <div
                      key={c.id}
                      draggable={!saving && !!me?.is_active}
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      aria-label={`Candidate ${c.full_name}`}
                      aria-busy={saving === c.id}
                      className={cn(
                        "cursor-grab rounded-md border bg-card p-2.5 text-sm active:cursor-grabbing",
                        saving === c.id && "opacity-60",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to="/leads/$id"
                          params={{ id: c.id }}
                          className="font-medium hover:text-info"
                        >
                          {c.full_name}
                        </Link>
                        <TempBadge t={c.temperature} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {c.courses?.name ?? "No course"} · Score {c.score}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {name(c.assigned_to)}
                      </div>
                      <div className="mt-2">
                        <PriorityBadge p={c.priority} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Last: {fmtDate(c.last_contacted_at)} · Next:{" "}
                        <span
                          className={
                            c.next_followup_at && new Date(c.next_followup_at) < new Date()
                              ? "text-hot"
                              : ""
                          }
                        >
                          {fmtDate(c.next_followup_at)}
                        </span>
                      </div>
                      <select
                        disabled={!!saving || !me?.is_active}
                        aria-label={`Move ${c.full_name} to stage`}
                        className="mt-2 h-7 w-full rounded border border-input bg-background text-xs"
                        value={c.stage}
                        onChange={(e) => void move(c.id, e.target.value as Stage)}
                      >
                        {STAGES.map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))
                )}
                {!q.isLoading && !cards.length && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No leads</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
