import { useEffect, useState } from "react";
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
import { useMe, useProfiles } from "@/hooks/use-auth";
import { FOLLOWUP_TYPES, type FollowupType } from "@/lib/crm";
import type { Tables } from "@/integrations/supabase/types";
import { localDateTime, reminderTime } from "@/lib/followup";
import { requireAffectedRows } from "@/lib/persistence";

export function FollowupDialog({
  open,
  onOpenChange,
  leadId,
  onSaved,
  task,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  onSaved?: () => void;
  task?: Tables<"followups">;
}) {
  const { data: me } = useMe();
  const { data: profiles } = useProfiles();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<FollowupType>("call");
  const [due, setDue] = useState("");
  const [remind, setRemind] = useState("15");
  const [assignee, setAssignee] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const d = new Date(Date.now() + 86400000);
    d.setMinutes(0, 0, 0);
    setTitle(task?.title ?? "");
    setType(task?.followup_type ?? "call");
    setDesc(task?.description ?? "");
    const offset = task?.remind_at
      ? Math.round((Date.parse(task.due_at) - Date.parse(task.remind_at)) / 60000)
      : null;
    setRemind(task ? (offset === null ? "" : String(offset)) : "60");
    setAssignee(task?.assigned_to ?? me?.id ?? "");
    setDue(localDateTime(task?.due_at ?? d.toISOString()));
    return undefined;
  }, [open, me?.id, task]);

  async function save() {
    if (!title.trim()) return toast.error("Title is required");
    if (!due || isNaN(Date.parse(due))) return toast.error("Choose a valid date and time");
    if (!me) return toast.error("Sign in before saving");
    setBusy(true);
    try {
      const patch = {
        title: title.trim(),
        followup_type: type,
        due_at: new Date(due).toISOString(),
        remind_at: reminderTime(due, remind),
        assigned_to: assignee || null,
        description: desc.trim() || null,
      };
      const result = task
        ? await supabase
            .from("followups")
            .update(patch)
            .eq("id", task.id)
            .eq("updated_at", task.updated_at)
            .select("id")
        : await supabase
            .from("followups")
            .insert({ ...patch, lead_id: leadId, created_by: me.id })
            .select("id");
      if (result.error) throw result.error;
      requireAffectedRows(result.data?.length ?? 0);
      toast.success(task ? "Follow-up updated" : "Follow-up scheduled");
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save follow-up");
    } finally {
      setBusy(false);
    }
  }
  const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit follow-up" : "Schedule follow-up"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="fu-title">Title</Label>
            <Input
              id="fu-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="fu-type">Type</Label>
              <select
                id="fu-type"
                className={sel}
                value={type}
                onChange={(e) => setType(e.target.value as FollowupType)}
              >
                {FOLLOWUP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fu-due">Due</Label>
              <Input
                id="fu-due"
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fu-rem">Reminder</Label>
              <select
                id="fu-rem"
                className={sel}
                value={remind}
                onChange={(e) => setRemind(e.target.value)}
              >
                <option value="">None</option>
                <option value="15">15 min before</option>
                <option value="60">1 hour before</option>
                <option value="1440">1 day before</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fu-as">Assign to</Label>
              <select
                id="fu-as"
                className={sel}
                disabled={!!task && !me?.canManage}
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">Unassigned</option>
                {profiles
                  ?.filter(
                    (p) =>
                      p.is_active &&
                      (me?.canManage || p.id === me?.id || p.id === task?.assigned_to),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fu-desc">Notes</Label>
            <Textarea
              id="fu-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={1000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : task ? "Save changes" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
