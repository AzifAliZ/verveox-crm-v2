import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Lead } from "@/lib/crm";

export function MergeLeadDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const matches = useQuery({
    queryKey: ["merge-candidates", lead.id, search],
    enabled: open && search.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, email, phone, source, campaign_name_snapshot")
        .neq("id", lead.id)
        .is("archived_at", null)
        .ilike("full_name", `%${search.trim()}%`)
        .order("id")
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
  const chosen = matches.data?.find((candidate) => candidate.id === source);
  async function merge() {
    if (!chosen) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("merge_leads", { _target: lead.id, _source: chosen.id });
      if (error) throw error;
      await qc.invalidateQueries();
      toast.success("Candidates merged; original records and attribution retained");
      onOpenChange(false);
      setSource("");
      setSearch("");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge into {lead.full_name}</DialogTitle>
        </DialogHeader>
        <Input
          aria-label="Find candidate to merge"
          placeholder="Search candidate name"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSource("");
          }}
        />
        {matches.error && (
          <p role="alert" className="text-sm text-destructive">
            {matches.error.message}
          </p>
        )}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {matches.data?.map((candidate) => (
            <label key={candidate.id} className="flex items-start gap-2 border-b py-2 text-sm">
              <input
                type="radio"
                name="merge-source"
                checked={source === candidate.id}
                onChange={() => setSource(candidate.id)}
              />
              <span>
                {candidate.full_name}
                <span className="block text-xs text-muted-foreground">
                  {candidate.email || candidate.phone} · {candidate.source} ·{" "}
                  {candidate.campaign_name_snapshot || "No campaign"}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Confirm these are the same person. This profile keeps its existing details and campaign
          attribution; only missing contact and education details are filled. Tags are combined. The
          other candidate is archived with its original attribution, activities and follow-ups
          preserved. Marketing opt-out is retained.
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!chosen || busy} onClick={merge}>
            {busy ? "Merging…" : "Confirm merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
