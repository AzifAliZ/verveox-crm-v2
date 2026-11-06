import type { Database } from "@/integrations/supabase/types";

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type Stage = Database["public"]["Enums"]["lead_stage"];
export type Temperature = Database["public"]["Enums"]["lead_temperature"];
export type Priority = Database["public"]["Enums"]["lead_priority"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type FollowupType = Database["public"]["Enums"]["followup_type"];

export const STAGES: { value: Stage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "qualified", label: "Qualified" },
  { value: "application_started", label: "Application Started" },
  { value: "enrolled", label: "Enrolled" },
  { value: "not_responding", label: "Not Responding" },
  { value: "not_interested", label: "Not Interested" },
  { value: "not_eligible", label: "Not Eligible" },
  { value: "lost", label: "Lost" },
];
export const stageLabel = (s: string) => STAGES.find((x) => x.value === s)?.label ?? s;

export const TEMPERATURES: { value: Temperature; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];
export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];
export const FOLLOWUP_TYPES: { value: FollowupType; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "meeting", label: "Meeting" },
  { value: "other", label: "Other" },
];
export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  employee: "Employee",
};

export function fmtDate(d?: string | null, withTime = false) {
  if (!d) return "—";
  const dt = new Date(d);
  return withTime
    ? dt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : dt.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function normalizePhone(p?: string | null) {
  return (p ?? "").replace(/\D/g, "").slice(-10);
}

/** Columns allowed for export, in order. */
export const EXPORT_COLUMNS: { key: keyof Lead; label: string }[] = [
  { key: "full_name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp_number", label: "WhatsApp" },
  { key: "college", label: "College" },
  { key: "degree", label: "Degree" },
  { key: "department", label: "Department" },
  { key: "graduation_year", label: "Graduation year" },
  { key: "interest", label: "Interest" },
  { key: "source", label: "Source" },
  { key: "campaign_name_snapshot", label: "Campaign" },
  { key: "stage", label: "Stage" },
  { key: "temperature", label: "Temperature" },
  { key: "score", label: "Score" },
  { key: "priority", label: "Priority" },
  { key: "eligibility_status", label: "Eligibility" },
  { key: "marketing_opt_out", label: "Marketing opt-out" },
  { key: "last_contacted_at", label: "Last contacted" },
  { key: "next_followup_at", label: "Next follow-up" },
  { key: "created_at", label: "Created" },
];

/** Neutralise spreadsheet formula injection. */
/** Neutralise spreadsheet formula injection. */
export function safeCell(v: unknown): string {
  if (v === null || v === undefined) return "";

  const s = String(v);
  let i = 0;

  while (i < s.length) {
    const code = s.charCodeAt(i);

    if (code <= 0x1f || /\s/.test(s[i])) {
      i++;
    } else {
      break;
    }
  }

  const first = s[i];

  if (first === "=" || first === "+" || first === "-" || first === "@") {
    return `'${s}`;
  }

  return s;
}
