import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe, useProfiles } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FollowupDialog } from "@/components/followup-dialog";
import { taskWindow } from "@/lib/followup";
import { activityDescription } from "@/lib/lead-attribution";
import type { Tables } from "@/integrations/supabase/types";
import { FOLLOWUP_TYPES, fmtDate } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({
    meta: [
      { title: "Follow-ups — Verveox CRM" },
      { name: "description", content: "Calls, emails, WhatsApp and meetings to do." },
      { property: "og:title", content: "Follow-ups — Verveox CRM" },
      { property: "og:description", content: "Calls, emails, WhatsApp and meetings to do." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Followups,
});

type View = "overdue" | "today" | "upcoming" | "completed" | "cancelled";

function Followups() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: profiles } = useProfiles();
  const [view, setView] = useState<View>("today");
  const [editing, setEditing] = useState<Tables<"followups">>();
  const [completion, setCompletion] = useState<Tables<"followups">>();
  const [outcome, setOutcome] = useState("");
  const [history, setHistory] = useState<Tables<"followups">>();
  const [page, setPage] = useState(0);
  const [assignee, setAssignee] = useState("");
  const [type, setType] = useState("");

  const q = useQuery({
    queryKey: ["followups", view, assignee, type, page, me?.id],
    refetchInterval: 60_000,
    queryFn: async () => {
      const w = taskWindow();
      let qq = supabase
        .from("followups")
        .select(
          "*, leads(full_name), assignee:profiles!followups_assigned_to_fkey(full_name, email)",
          { count: "exact" },
        );
      if (view === "overdue") qq = qq.eq("status", "pending").lt("due_at", w.now);
      if (view === "today")
        qq = qq.eq("status", "pending").gte("due_at", w.start).lt("due_at", w.end);
      if (view === "upcoming") qq = qq.eq("status", "pending").gte("due_at", w.end);
      if (view === "completed") qq = qq.eq("status", "completed");
      if (view === "cancelled") qq = qq.eq("status", "cancelled");
      if (assignee === "me" && me) qq = qq.eq("assigned_to", me.id);
      else if (assignee) qq = qq.eq("assigned_to", assignee);
      if (type) qq = qq.eq("followup_type", type as "call");
      const { data, error, count } = await qq
        .order("due_at", { ascending: view !== "completed" })
        .order("id")
        .range(page * 25, page * 25 + 24);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });
  const act = useMutation({
    mutationFn: async ({
      id,
      updatedAt,
      patch,
    }: {
      id: string;
      updatedAt: string;
      patch: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase
        .from("followups")
        .update(patch as never)
        .eq("id", id)
        .eq("updated_at", updatedAt)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Not permitted");
    },
    onSuccess: () => {
      toast.success("Updated");
      setCompletion(undefined);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  function refresh() {
    for (const key of [
      "followups",
      "followup-history",
      "dash",
      "dash-lists",
      "lead",
      "notifications",
    ])
      qc.invalidateQueries({ queryKey: [key] });
  }
  const h = useQuery({
    queryKey: ["followup-history", history?.id],
    enabled: !!history,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("followup_history")
        .select("*, actor:profiles(full_name)")
        .eq("followup_id", history?.id ?? "")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div>
      <PageHeader title="Follow-ups & Tasks" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          value={view}
          onValueChange={(v) => {
            setView(v as View);
            setPage(0);
          }}
        >
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="today">Due today</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>
        <select
          className={sel}
          value={assignee}
          onChange={(e) => {
            setAssignee(e.target.value);
            setPage(0);
          }}
          aria-label="Assignee"
        >
          <option value="">Everyone</option>
          <option value="me">Me</option>
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(0);
          }}
          aria-label="Type"
        >
          <option value="">All types</option>
          {FOLLOWUP_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : q.data?.rows.length ? (
        <div className="divide-y rounded-lg border bg-card">
          {q.data.rows.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <div className="text-sm font-medium">
                  {f.title}{" "}
                  <Badge variant="muted" className="ml-1">
                    {f.followup_type}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  <Link
                    to="/leads/$id"
                    params={{ id: f.lead_id }}
                    className="text-info hover:underline"
                  >
                    {(f.leads as { full_name: string } | null)?.full_name}
                  </Link>
                  {" · "}
                  <span className={view === "overdue" ? "text-hot" : ""}>
                    {fmtDate(f.due_at, true)}
                  </span>
                  {" · "}
                  {(f.assignee as { full_name: string } | null)?.full_name ?? "Unassigned"}
                  {f.outcome ? ` · ${f.outcome}` : ""}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setHistory(f)}>
                History
              </Button>
              {f.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={act.isPending}
                    onClick={() => {
                      setOutcome("");
                      setCompletion(f);
                    }}
                  >
                    Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={act.isPending}
                    onClick={() => setEditing(f)}
                  >
                    Edit / Reschedule
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={act.isPending}
                    onClick={() => {
                      if (confirm("Cancel this follow-up?"))
                        act.mutate({
                          id: f.id,
                          updatedAt: f.updated_at,
                          patch: { status: "cancelled" },
                        });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing here" description="No follow-ups match this view." />
      )}
      <div className="mt-4 flex items-center gap-3 text-sm">
        <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>
          {q.data?.count ?? 0} tasks · Page {page + 1}
        </span>
        <Button
          variant="outline"
          disabled={(page + 1) * 25 >= (q.data?.count ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
      {editing && (
        <FollowupDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditing(undefined);
          }}
          task={editing}
          leadId={editing.lead_id}
          onSaved={refresh}
        />
      )}
      <Dialog
        open={!!completion}
        onOpenChange={(o) => {
          if (!o) setCompletion(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete follow-up</DialogTitle>
          </DialogHeader>
          <Textarea
            aria-label="Outcome"
            placeholder="Outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            maxLength={500}
          />
          <DialogFooter>
            <Button
              disabled={act.isPending}
              onClick={() => {
                if (completion)
                  act.mutate({
                    id: completion.id,
                    updatedAt: completion.updated_at,
                    patch: { status: "completed", outcome: outcome.trim() || null },
                  });
              }}
            >
              Save completion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!history}
        onOpenChange={(o) => {
          if (!o) setHistory(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Task history</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {h.error && <p className="text-destructive">{h.error.message}</p>}
            {h.isLoading ? (
              <Skeleton className="h-24" />
            ) : (
              h.data?.map((event) => (
                <div key={event.id} className="border-b pb-3">
                  <p className="text-sm font-medium">
                    {event.event} · {event.actor?.full_name ?? "System"}
                  </p>
                  <p className="text-xs text-muted-foreground">{fmtDate(event.created_at, true)}</p>
                  <p className="whitespace-pre-wrap text-sm">
                    {activityDescription(JSON.stringify(event.changes))}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
