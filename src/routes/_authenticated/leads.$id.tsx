import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Archive, RotateCcw, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MergeLeadDialog } from "@/components/merge-lead-dialog";
import { activityDescription } from "@/lib/lead-attribution";
import { LeadFormDialog } from "@/components/lead-form-dialog";
import { FollowupDialog } from "@/components/followup-dialog";
import { TempBadge, StageBadge, PriorityBadge } from "@/components/lead-badges";
import { useMe, useProfiles, useRefData } from "@/hooks/use-auth";
import { STAGES, TEMPERATURES, PRIORITIES, fmtDate, stageLabel, type Lead } from "@/lib/crm";
import { requireAffectedRows } from "@/lib/persistence";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  head: () => ({
    meta: [
      { title: "Lead profile — Verveox CRM" },
      { name: "description", content: "Candidate profile, activity and follow-ups." },
      { property: "og:title", content: "Lead profile — Verveox CRM" },
      { property: "og:description", content: "Candidate profile, activity and follow-ups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadPage,
});

function LeadPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: me } = useMe();
  const { data: ref } = useRefData();
  const { data: profiles } = useProfiles();
  const [edit, setEdit] = useState(false);
  const [merge, setMerge] = useState(false);
  const [fuOpen, setFuOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "archive" | "delete">(null);
  const [note, setNote] = useState("");
  const [actType, setActType] = useState("note");

  const lead = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*, courses(name), campaigns(name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as
        (Lead & { courses: { name: string } | null; campaigns: { name: string } | null }) | null;
    },
  });
  const extra = useQuery({
    queryKey: ["lead", id, "extra"],
    queryFn: async () => {
      const [a, f, sh, sc, sig, tg, cr, rules, merged] = await Promise.all([
        supabase
          .from("activities")
          .select("*, actor:profiles(full_name)")
          .eq("lead_id", id)
          .order("occurred_at", { ascending: false }),
        supabase
          .from("followups")
          .select("*, assignee:profiles!followups_assigned_to_fkey(full_name)")
          .eq("lead_id", id)
          .order("due_at"),
        supabase
          .from("lead_stage_history")
          .select("*")
          .eq("lead_id", id)
          .order("changed_at", { ascending: false }),
        supabase
          .from("lead_score_history")
          .select("*")
          .eq("lead_id", id)
          .order("created_at", { ascending: false }),
        supabase.from("lead_signals").select("rule_key").eq("lead_id", id),
        supabase.from("lead_tags").select("tag_id").eq("lead_id", id),
        supabase
          .from("consent_records")
          .select("*")
          .eq("lead_id", id)
          .order("recorded_at", { ascending: false }),
        supabase.from("scoring_rules").select("*").order("sort_order"),
        supabase
          .from("lead_merges")
          .select("id, source_lead_id, merged_at, source_snapshot")
          .eq("target_lead_id", id)
          .order("merged_at", { ascending: false }),
      ]);
      for (const r of [a, f, sh, sc, sig, tg, cr, rules, merged]) if (r.error) throw r.error;
      return {
        merged: merged.data ?? [],
        acts: a.data ?? [],
        fus: f.data ?? [],
        stages: sh.data ?? [],
        scores: sc.data ?? [],
        signals: new Set((sig.data ?? []).map((s) => s.rule_key)),
        tags: new Set((tg.data ?? []).map((t) => t.tag_id)),
        consents: cr.data ?? [],
        rules: rules.data ?? [],
      };
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead", id] });
    for (const key of ["leads", "pipeline", "dashboard", "reports"])
      qc.invalidateQueries({ queryKey: [key] });
  };

  const update = useMutation({
    mutationFn: async (patch: Partial<Lead>) => {
      const { data, error } = await supabase
        .from("leads")
        .update(patch as never)
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data.length) throw new Error("You don't have permission to change this lead");
    },
    onSuccess: () => {
      toast.success("Saved");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleSignal = useMutation({
    mutationFn: async ({ key, on }: { key: string; on: boolean }) => {
      const r = on
        ? await supabase
            .from("lead_signals")
            .insert({ lead_id: id, rule_key: key, added_by: me?.id ?? "" })
            .select("rule_key")
        : await supabase
            .from("lead_signals")
            .delete()
            .eq("lead_id", id)
            .eq("rule_key", key)
            .select("rule_key");
      if (r.error) throw r.error;
      requireAffectedRows(r.data?.length ?? 0);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleTag = useMutation({
    mutationFn: async ({ tag, on }: { tag: string; on: boolean }) => {
      const r = on
        ? await supabase
            .from("lead_tags")
            .upsert({ lead_id: id, tag_id: tag }, { ignoreDuplicates: true })
        : await supabase.from("lead_tags").delete().eq("lead_id", id).eq("tag_id", tag);
      if (r.error) throw r.error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const addActivity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("activities").insert({
        lead_id: id,
        actor_id: me?.id ?? "",
        activity_type: actType,
        subject: actType === "note" ? "Note" : `Logged ${actType}`,
        description: note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      toast.success("Activity logged");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const consent = useMutation({
    mutationFn: async ({ purpose, status }: { purpose: string; status: string }) => {
      const { error } = await supabase.from("consent_records").insert({
        lead_id: id,
        purpose,
        consent_status: status,
        consent_source: "crm_manual",
        recorded_by: me?.id ?? "",
        withdrawn_at: status === "withdrawn" ? new Date().toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Consent recorded");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fuAction = useMutation({
    mutationFn: async ({ fid, patch }: { fid: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("followups")
        .update(patch as never)
        .eq("id", fid)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("leads").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data.length) throw new Error("Not permitted");
    },
    onSuccess: () => {
      toast.success("Lead deleted");
      nav({ to: "/leads" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (lead.isLoading) return <Skeleton className="h-96" />;
  if (lead.error)
    return <p className="text-destructive">Couldn't load lead: {(lead.error as Error).message}</p>;
  const l = lead.data;
  if (!l)
    return (
      <div>
        <p>Lead not found or you don't have access.</p>
        <Link to="/leads" className="text-info">
          Back to leads
        </Link>
      </div>
    );
  const owner = profiles?.find((p) => p.id === l.assigned_to);
  const x = extra.data;
  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v || "—"}</span>
    </div>
  );

  return (
    <div>
      <Link
        to="/leads"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Leads
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{l.full_name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <StageBadge s={l.stage} />
            <TempBadge t={l.temperature} manual={l.classification_mode === "manual"} />
            <PriorityBadge p={l.priority} />
            <Badge variant="outline">Score {l.score}</Badge>
            {l.marketing_opt_out && <Badge variant="hot">Opted out of marketing</Badge>}
            {l.archived_at && <Badge variant="muted">Archived</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEdit(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" onClick={() => setFuOpen(true)}>
            Schedule follow-up
          </Button>
          {me?.canManage && !l.archived_at && (
            <Button variant="outline" onClick={() => setMerge(true)}>
              Merge duplicate
            </Button>
          )}
          {l.archived_at ? (
            <Button variant="outline" onClick={() => update.mutate({ archived_at: null })}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setConfirm("archive")}>
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </Button>
          )}
          {me?.isAdmin && (
            <Button variant="destructive" onClick={() => setConfirm("delete")}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Classification</h3>
            <div className="space-y-3 text-sm">
              <label className="block">
                Stage
                <select
                  aria-label="Candidate stage"
                  disabled={update.isPending}
                  className={`${sel} mt-1 w-full`}
                  value={l.stage}
                  onChange={(e) => update.mutate({ stage: e.target.value as Lead["stage"] })}
                >
                  {STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Temperature
                <select
                  aria-label="Candidate temperature"
                  disabled={update.isPending}
                  className={`${sel} mt-1 w-full`}
                  value={l.manual_temperature_override ?? "auto"}
                  onChange={(e) =>
                    update.mutate({
                      manual_temperature_override:
                        e.target.value === "auto" ? null : (e.target.value as Lead["temperature"]),
                    })
                  }
                >
                  <option value="auto">Automatic (from score)</option>
                  {TEMPERATURES.map((t) => (
                    <option key={t.value} value={t.value}>
                      Manual: {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Priority
                <select
                  aria-label="Candidate priority"
                  disabled={update.isPending}
                  className={`${sel} mt-1 w-full`}
                  value={l.priority}
                  onChange={(e) => update.mutate({ priority: e.target.value as Lead["priority"] })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {me?.canManage && (
                <label className="block">
                  Assigned to
                  <select
                    aria-label="Assigned to"
                    disabled={update.isPending}
                    className={`${sel} mt-1 w-full`}
                    value={l.assigned_to ?? ""}
                    onChange={(e) => update.mutate({ assigned_to: e.target.value || null })}
                  >
                    <option value="">Unassigned</option>
                    {profiles
                      ?.filter((p) => p.is_active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name || p.email}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <p className="text-xs text-muted-foreground">
                Score reason: {l.score_reason ?? "No signals recorded"}
              </p>
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Scoring signals</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              Tick what you've documented. Ad clicks alone never count.
            </p>
            {x?.rules
              .filter((r) => r.is_active)
              .map((r) => (
                <label key={r.key} className="flex items-center gap-2 py-1 text-sm">
                  <Checkbox
                    aria-label={`Scoring signal: ${r.label}`}
                    disabled={toggleSignal.isPending}
                    checked={x.signals.has(r.key)}
                    onCheckedChange={(v) => toggleSignal.mutate({ key: r.key, on: !!v })}
                  />
                  <span className="flex-1">{r.label}</span>
                  <span className={r.points < 0 ? "text-hot" : "text-success"}>
                    {r.points > 0 ? "+" : ""}
                    {r.points}
                  </span>
                </label>
              ))}
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {ref?.tags.length ? (
                ref.tags.map((t) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={toggleTag.isPending}
                    key={t.id}
                    onClick={() => toggleTag.mutate({ tag: t.id, on: !x?.tags.has(t.id) })}
                  >
                    <Badge variant={x?.tags.has(t.id) ? "info" : "muted"}>
                      {t.name}
                      {x?.tags.has(t.id) && <X className="ml-1 h-3 w-3" />}
                    </Badge>
                  </Button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  No tags yet. Admins add tags in Settings.
                </p>
              )}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Consent & communication</h3>
            <Row k="Preferred channel" v={l.preferred_channel} />
            <Row k="Marketing" v={l.marketing_opt_out ? "Opted out" : "Not opted out"} />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => consent.mutate({ purpose: "marketing", status: "granted" })}
              >
                Record consent
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => consent.mutate({ purpose: "marketing", status: "withdrawn" })}
              >
                Record opt-out
              </Button>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {x?.consents.map((c) => (
                <li key={c.id}>
                  {c.purpose}: {c.consent_status} · {fmtDate(c.recorded_at, true)}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="followups">
                Follow-ups ({x?.fus.filter((f) => f.status === "pending").length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="details">
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Personal</h3>
                  <Row k="Email" v={l.email} />
                  <Row k="Phone" v={l.phone} />
                  <Row k="WhatsApp" v={l.whatsapp_number} />
                  <Row k="Availability" v={l.availability} />
                  <Row k="Preferred batch" v={l.preferred_batch} />
                </Card>
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Education</h3>
                  <Row k="College" v={l.college} />
                  <Row k="Degree" v={l.degree} />
                  <Row k="Department" v={l.department} />
                  <Row k="Graduation year" v={l.graduation_year} />
                  <Row k="Experience" v={l.experience_level} />
                  <Row k="Skills" v={l.skills} />
                  <Row k="Eligibility" v={l.eligibility_status.replace("_", " ")} />
                </Card>
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Interest</h3>
                  <Row k="Course / internship" v={l.courses?.name} />
                  <Row k="Notes" v={l.interest} />
                  <Row k="Lost reason" v={l.lost_reason} />
                </Card>
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Attribution</h3>
                  <Row k="Source" v={l.source} />
                  <Row k="Campaign" v={l.campaigns?.name ?? l.campaign_name_snapshot} />
                  <Row k="Source details" v={l.source_details} />
                  <Row k="Landing page" v={l.landing_page} />
                  <Row k="Meta lead ID" v={l.meta_lead_id} />
                  <Row k="Meta form" v={l.meta_form_id} />
                  <Row
                    k="UTM"
                    v={[l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(" / ")}
                  />
                  <Row k="Owner" v={owner?.full_name || owner?.email} />
                  <Row k="Created" v={fmtDate(l.created_at, true)} />
                  <Row k="Updated" v={fmtDate(l.updated_at, true)} />
                  <Row k="Last contacted" v={fmtDate(l.last_contacted_at, true)} />
                  <Row k="Next follow-up" v={fmtDate(l.next_followup_at, true)} />
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="activity">
              <Card className="p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <select
                      className={sel}
                      value={actType}
                      onChange={(e) => setActType(e.target.value)}
                      aria-label="Activity type"
                    >
                      <option value="note">Note</option>
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="meeting">Meeting</option>
                    </select>
                  </div>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What happened?"
                    maxLength={2000}
                  />
                  <Button
                    className="self-end"
                    disabled={!note.trim() || addActivity.isPending}
                    onClick={() => addActivity.mutate()}
                  >
                    Log
                  </Button>
                </div>
                <ol className="mt-4 space-y-3">
                  {x?.acts.map((a) => (
                    <li key={a.id} className="border-l-2 border-info/50 pl-3">
                      <div className="text-sm font-medium">{a.subject ?? a.activity_type}</div>
                      {a.description && (
                        <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {activityDescription(a.description)}
                        </div>
                      )}
                      {a.outcome && <div className="text-xs">Outcome: {a.outcome}</div>}
                      <div className="text-xs text-muted-foreground">
                        {(a.actor as { full_name: string } | null)?.full_name ?? "System"} ·{" "}
                        {fmtDate(a.occurred_at, true)}
                      </div>
                    </li>
                  ))}
                  {x && !x.acts.length && (
                    <p className="text-sm text-muted-foreground">No activity yet.</p>
                  )}
                </ol>
              </Card>
            </TabsContent>
            <TabsContent value="followups">
              <Card className="divide-y p-0">
                {x?.fus.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div>
                      <div className="text-sm font-medium">
                        {f.title}{" "}
                        <Badge variant="muted" className="ml-1">
                          {f.followup_type}
                        </Badge>
                      </div>
                      <div
                        className={`text-xs ${f.status === "pending" && new Date(f.due_at) < new Date() ? "text-hot" : "text-muted-foreground"}`}
                      >
                        {f.status} · {fmtDate(f.due_at, true)} ·{" "}
                        {(f.assignee as { full_name: string } | null)?.full_name ?? "Unassigned"}
                        {f.outcome ? ` · ${f.outcome}` : ""}
                      </div>
                    </div>
                    {f.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const o = prompt("Outcome (optional)") ?? "";
                            fuAction.mutate({
                              fid: f.id,
                              patch: {
                                status: "completed",
                                completed_at: new Date().toISOString(),
                                outcome: o.slice(0, 500) || null,
                              },
                            });
                          }}
                        >
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const d = prompt("New date/time (YYYY-MM-DD HH:MM)");
                            if (d && !isNaN(Date.parse(d)))
                              fuAction.mutate({
                                fid: f.id,
                                patch: { due_at: new Date(d).toISOString() },
                              });
                            else if (d) toast.error("Invalid date");
                          }}
                        >
                          Reschedule
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            fuAction.mutate({ fid: f.id, patch: { status: "cancelled" } })
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {x && !x.fus.length && (
                  <p className="p-4 text-sm text-muted-foreground">
                    No follow-ups.{" "}
                    <button className="text-info" onClick={() => setFuOpen(true)}>
                      Schedule one
                    </button>
                  </p>
                )}
              </Card>
            </TabsContent>
            <TabsContent value="history">
              {x?.merged.map((record) => (
                <div key={record.id} className="mb-3 border-b py-3 text-sm">
                  <Link
                    to="/leads/$id"
                    params={{ id: record.source_lead_id }}
                    className="text-info"
                  >
                    Original merged candidate
                  </Link>
                  <span className="ml-2 text-muted-foreground">
                    {fmtDate(record.merged_at, true)}
                  </span>
                  <p className="mt-1">
                    Original attribution and history are preserved on the archived profile.
                  </p>
                </div>
              ))}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Stage history</h3>
                  {x?.stages.map((s) => (
                    <div key={s.id} className="border-b py-1.5 text-sm last:border-0">
                      {s.old_stage ? stageLabel(s.old_stage) : "—"} → {stageLabel(s.new_stage)}
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(s.changed_at, true)}
                      </div>
                    </div>
                  ))}
                </Card>
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Score history</h3>
                  {x?.scores.length ? (
                    x.scores.map((s) => (
                      <div key={s.id} className="border-b py-1.5 text-sm last:border-0">
                        {s.old_score} → {s.new_score} · {s.old_temperature} → {s.new_temperature}{" "}
                        <Badge variant="muted">{s.source}</Badge>
                        <div className="text-xs text-muted-foreground">
                          {s.reason} · {fmtDate(s.created_at, true)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No changes yet.</p>
                  )}
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <MergeLeadDialog lead={l} open={merge} onOpenChange={setMerge} />
      {extra.error && (
        <p role="alert" className="mt-4 text-destructive">
          Could not load candidate history: {extra.error.message}
        </p>
      )}
      <LeadFormDialog open={edit} onOpenChange={setEdit} lead={l} />
      <FollowupDialog open={fuOpen} onOpenChange={setFuOpen} leadId={id} onSaved={refresh} />
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete" ? "Permanently delete this lead?" : "Archive this lead?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "All history, notes and follow-ups will be removed. This cannot be undone."
                : "It will be hidden from lists and can be restored."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm === "delete") {
                  del.mutate();
                } else {
                  update.mutate({ archived_at: new Date().toISOString() });
                }
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {me && !me.canManage && <Input type="hidden" />}
    </div>
  );
}
