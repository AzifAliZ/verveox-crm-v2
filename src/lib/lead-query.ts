import { fetchAllPages } from "@/lib/persistence";
import { supabase } from "@/integrations/supabase/client";

export type LeadFilters = {
  q?: string;
  stage?: string;
  temperature?: string;
  course?: string;
  source?: string;
  campaign?: string;
  owner?: string; // uuid | "me" | "unassigned"
  from?: string;
  to?: string;
  minScore?: number;
  maxScore?: number;
  followup?: "overdue" | "today" | "none" | "scheduled";
  archived?: boolean;
  tag?: string;
};

/** Apply filters to a leads select. RLS restricts rows to what the user may see. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyLeadFilters(query: any, f: LeadFilters, meId?: string) {
  let q = query;
  q = f.archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  if (f.q) {
    const s = f.q.replace(/[^\p{L}\p{N}\s@+._-]/gu, " ").trim();
    if (s) {
      const digits = s.replace(/\D/g, "");
      const ors = [
        `full_name.ilike.%${s}%`,
        `email.ilike.%${s}%`,
        `phone.ilike.%${s}%`,
        `college.ilike.%${s}%`,
      ];
      if (digits.length >= 4) ors.push(`normalized_phone.ilike.%${digits.slice(-10)}%`);
      q = q.or(ors.join(","));
    }
  }
  if (f.stage) q = q.eq("stage", f.stage);
  if (f.temperature) q = q.eq("temperature", f.temperature);
  if (f.course) q = q.eq("course_id", f.course);
  if (f.source) q = q.eq("source", f.source);
  if (f.campaign) q = q.eq("campaign_id", f.campaign);
  if (f.owner === "me" && meId) q = q.eq("assigned_to", meId);
  else if (f.owner === "unassigned") q = q.is("assigned_to", null);
  else if (f.owner) q = q.eq("assigned_to", f.owner);
  if (f.from) q = q.gte("created_at", new Date(f.from).toISOString());
  if (f.to) {
    const d = new Date(f.to);
    d.setDate(d.getDate() + 1);
    q = q.lt("created_at", d.toISOString());
  }
  if (f.minScore != null) q = q.gte("score", f.minScore);
  if (f.maxScore != null) q = q.lte("score", f.maxScore);
  if (f.followup) {
    const now = new Date();
    const sod = new Date(now);
    sod.setHours(0, 0, 0, 0);
    const eod = new Date(sod);
    eod.setDate(eod.getDate() + 1);
    if (f.followup === "overdue") q = q.lt("next_followup_at", now.toISOString());
    if (f.followup === "today")
      q = q.gte("next_followup_at", sod.toISOString()).lt("next_followup_at", eod.toISOString());
    if (f.followup === "none") q = q.is("next_followup_at", null);
    if (f.followup === "scheduled") q = q.gte("next_followup_at", now.toISOString());
  }
  return q;
}

export async function fetchLeadIdsForTag(tagId: string) {
  const data = await fetchAllPages((from, to) =>
    supabase
      .from("lead_tags")
      .select("lead_id")
      .eq("tag_id", tagId)
      .order("lead_id")
      .range(from, to),
  );
  return data.map((r) => r.lead_id);
}

export const SAVED_PRESETS: { name: string; filters: LeadFilters }[] = [
  { name: "My Leads", filters: { owner: "me" } },
  { name: "Hot Leads", filters: { temperature: "hot" } },
  { name: "New Leads", filters: { stage: "new" } },
  { name: "Overdue Follow-ups", filters: { followup: "overdue" } },
  { name: "Converted Leads", filters: { stage: "enrolled" } },
];
