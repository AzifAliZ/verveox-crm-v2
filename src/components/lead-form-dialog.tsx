import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMe, useProfiles, useRefData } from "@/hooks/use-auth";
import { campaignSnapshot } from "@/lib/lead-attribution";
import { PRIORITIES, STAGES, normalizePhone, type Lead } from "@/lib/crm";

const schema = z
  .object({
    full_name: z.string().trim().min(1, "Name is required").max(150),
    email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^[+\d\s()-]*$/, "Digits, spaces, + - ( ) only")
      .optional()
      .or(z.literal("")),
    whatsapp_number: z.string().trim().max(30).optional().or(z.literal("")),
    college: z.string().max(200).optional(),
    degree: z.string().max(100).optional(),
    department: z.string().max(100).optional(),
    graduation_year: z
      .string()
      .regex(/^(\d{4})?$/, "4-digit year")
      .optional(),
    skills: z.string().max(500).optional(),
    experience_level: z.string().max(50).optional(),
    interest: z.string().max(300).optional(),
    course_id: z.string().optional(),
    preferred_batch: z.string().max(100).optional(),
    availability: z.string().max(100).optional(),
    eligibility_status: z.enum(["unknown", "eligible", "not_eligible", "pending_review"]),
    source: z.string().min(1),
    campaign_id: z.string().optional(),
    stage: z.string(),
    priority: z.string(),
    assigned_to: z.string().optional(),
    preferred_channel: z.string().optional(),
    lost_reason: z.string().max(300).optional(),
  })
  .refine((v) => v.email || v.phone, { message: "Provide an email or phone", path: ["email"] });
type FormValues = z.infer<typeof schema>;

const toNull = (v?: string) => (v && v.trim() ? v.trim() : null);

export function LeadFormDialog({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead?: Lead;
}) {
  const { data: me } = useMe();
  const { data: ref } = useRefData();
  const { data: profiles } = useProfiles();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [dupes, setDupes] = useState<
    { id: string; full_name: string; email: string | null; phone: string | null }[]
  >([]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (!open) return;
    setDupes([]);
    form.reset({
      full_name: lead?.full_name ?? "",
      email: lead?.email ?? "",
      phone: lead?.phone ?? "",
      whatsapp_number: lead?.whatsapp_number ?? "",
      college: lead?.college ?? "",
      degree: lead?.degree ?? "",
      department: lead?.department ?? "",
      graduation_year: lead?.graduation_year?.toString() ?? "",
      skills: lead?.skills ?? "",
      experience_level: lead?.experience_level ?? "",
      interest: lead?.interest ?? "",
      course_id: lead?.course_id ?? "",
      preferred_batch: lead?.preferred_batch ?? "",
      availability: lead?.availability ?? "",
      eligibility_status:
        (lead?.eligibility_status as FormValues["eligibility_status"]) ?? "unknown",
      source: lead?.source ?? "manual",
      campaign_id: lead?.campaign_id ?? "",
      stage: lead?.stage ?? "new",
      priority: lead?.priority ?? "medium",
      assigned_to: lead?.assigned_to ?? (me?.canManage ? "" : (me?.id ?? "")),
      preferred_channel: lead?.preferred_channel ?? "",
      lost_reason: lead?.lost_reason ?? "",
    });
  }, [open, lead, me, form]);

  async function findDupes(v: FormValues) {
    const matches = new Map<
      string,
      { id: string; full_name: string; email: string | null; phone: string | null }
    >();
    const lookups = [];
    if (v.email)
      lookups.push(
        supabase
          .from("leads")
          .select("id, full_name, email, phone")
          .eq("normalized_email", v.email.trim().toLowerCase())
          .limit(20),
      );
    const phone = normalizePhone(v.phone);
    if (phone.length >= 7)
      lookups.push(
        supabase
          .from("leads")
          .select("id, full_name, email, phone")
          .eq("normalized_phone", phone)
          .limit(20),
      );
    for (const result of await Promise.all(lookups)) {
      if (result.error) throw result.error;
      for (const match of result.data ?? [])
        if (match.id !== lead?.id) matches.set(match.id, match);
    }
    return [...matches.values()];
  }

  const save = useMutation({
    mutationFn: async ({ v, force }: { v: FormValues; force: boolean }) => {
      if (!force) {
        const d = await findDupes(v);
        if (d.length) {
          setDupes(d);
          return null;
        }
      }
      const campaign = ref?.campaigns.find((c) => c.id === v.campaign_id);
      const payload = {
        full_name: v.full_name.trim(),
        email: toNull(v.email),
        phone: toNull(v.phone),
        whatsapp_number: toNull(v.whatsapp_number),
        college: toNull(v.college),
        degree: toNull(v.degree),
        department: toNull(v.department),
        graduation_year: v.graduation_year ? Number(v.graduation_year) : null,
        skills: toNull(v.skills),
        experience_level: toNull(v.experience_level),
        interest: toNull(v.interest),
        course_id: toNull(v.course_id),
        preferred_batch: toNull(v.preferred_batch),
        availability: toNull(v.availability),
        eligibility_status: v.eligibility_status,
        source: v.source,
        campaign_id: toNull(v.campaign_id),
        campaign_name_snapshot: campaignSnapshot(
          toNull(v.campaign_id),
          lead?.campaign_id ?? null,
          lead?.campaign_name_snapshot ?? null,
          campaign?.name,
        ),
        stage: v.stage as Lead["stage"],
        priority: v.priority as Lead["priority"],
        preferred_channel: toNull(v.preferred_channel),
        lost_reason: toNull(v.lost_reason),
        ...(me?.canManage || !lead ? { assigned_to: toNull(v.assigned_to) } : {}),
      };
      if (lead) {
        const { error } = await supabase
          .from("leads")
          .update(payload)
          .eq("id", lead.id)
          .select("id")
          .single();
        if (error) throw error;
        return lead.id;
      }
      const { data, error } = await supabase.from("leads").insert(payload).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      if (!id) return;
      toast.success(lead ? "Lead updated" : "Lead created");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", id] });
      onOpenChange(false);
      if (!lead) nav({ to: "/leads/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const err = form.formState.errors;
  const F = ({
    name,
    label,
    type = "text",
  }: {
    name: keyof FormValues;
    label: string;
    type?: string;
  }) => (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type={type} {...form.register(name)} />
      {err[name] && <p className="text-xs text-destructive">{String(err[name]?.message)}</p>}
    </div>
  );
  const S = ({
    name,
    label,
    options,
    allowEmpty,
  }: {
    name: keyof FormValues;
    label: string;
    options: { value: string; label: string }[];
    allowEmpty?: string;
  }) => (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        {...form.register(name)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit lead" : "Add lead"}</DialogTitle>
        </DialogHeader>
        <form
          id="lead-form"
          onSubmit={form.handleSubmit((v) => save.mutate({ v, force: false }))}
          className="grid gap-4 sm:grid-cols-2"
        >
          <F name="full_name" label="Full name *" />
          <F name="email" label="Email" type="email" />
          <F name="phone" label="Phone" />
          <F name="whatsapp_number" label="WhatsApp number" />
          <F name="college" label="College" />
          <F name="degree" label="Degree" />
          <F name="department" label="Department" />
          <F name="graduation_year" label="Graduation year" />
          <F name="experience_level" label="Experience level" />
          <F name="preferred_batch" label="Preferred batch" />
          <F name="availability" label="Availability" />
          <S
            name="course_id"
            label="Course / internship"
            allowEmpty="— None —"
            options={(ref?.courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <S
            name="eligibility_status"
            label="Eligibility"
            options={[
              { value: "unknown", label: "Unknown" },
              { value: "eligible", label: "Eligible" },
              { value: "not_eligible", label: "Not eligible" },
              { value: "pending_review", label: "Pending review" },
            ]}
          />
          <S
            name="source"
            label="Source"
            options={(ref?.sources ?? []).map((s) => ({ value: s.key, label: s.label }))}
          />
          <S
            name="campaign_id"
            label="Campaign"
            allowEmpty="— None —"
            options={[
              ...(lead?.campaign_id && !ref?.campaigns.some((c) => c.id === lead.campaign_id)
                ? [
                    {
                      value: lead.campaign_id,
                      label: lead.campaign_name_snapshot ?? "Original campaign",
                    },
                  ]
                : []),
              ...(ref?.campaigns ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <S name="stage" label="Stage" options={STAGES} />
          <S name="priority" label="Priority" options={PRIORITIES} />
          {me?.canManage && (
            <S
              name="assigned_to"
              label="Assigned to"
              allowEmpty="Unassigned"
              options={(profiles ?? [])
                .filter((p) => p.is_active)
                .map((p) => ({ value: p.id, label: p.full_name || p.email }))}
            />
          )}
          <S
            name="preferred_channel"
            label="Preferred channel"
            allowEmpty="—"
            options={[
              { value: "call", label: "Call" },
              { value: "email", label: "Email" },
              { value: "whatsapp", label: "WhatsApp" },
              { value: "sms", label: "SMS" },
            ]}
          />
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="skills">Skills</Label>
            <Textarea id="skills" rows={2} {...form.register("skills")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="interest">Interest / notes from enquiry</Label>
            <Textarea id="interest" rows={2} {...form.register("interest")} />
          </div>
          <F name="lost_reason" label="Lost reason" />
        </form>
        {dupes.length > 0 && (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
            <div className="font-medium text-warning">
              Possible duplicates found (same email or phone)
            </div>
            <ul className="mt-2 space-y-1">
              {dupes.map((d) => (
                <li key={d.id}>
                  <a
                    className="text-info hover:underline"
                    href={`/leads/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.full_name}
                  </a>
                  <span className="text-muted-foreground">
                    {" "}
                    · {d.email ?? ""} {d.phone ?? ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              Review them. These may be different people — records are never merged automatically.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {dupes.length > 0 ? (
            <Button
              disabled={save.isPending}
              onClick={form.handleSubmit((v) => save.mutate({ v, force: true }))}
            >
              {lead ? "Save after review" : "Create anyway"}
            </Button>
          ) : (
            <Button type="submit" form="lead-form" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
