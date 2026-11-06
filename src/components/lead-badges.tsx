import { Badge } from "@/components/ui/badge";
import { stageLabel } from "@/lib/crm";

export function TempBadge({ t, manual }: { t: string; manual?: boolean }) {
  const v = t === "hot" ? "hot" : t === "warm" ? "warm" : "cold";
  return (
    <Badge variant={v}>
      {t.charAt(0).toUpperCase() + t.slice(1)}
      {manual ? " · manual" : ""}
    </Badge>
  );
}

export function StageBadge({ s }: { s: string }) {
  const v =
    s === "enrolled"
      ? "success"
      : ["lost", "not_interested", "not_eligible"].includes(s)
        ? "muted"
        : "info";
  return <Badge variant={v}>{stageLabel(s)}</Badge>;
}

export function PriorityBadge({ p }: { p: string }) {
  const v = p === "urgent" ? "hot" : p === "high" ? "warm" : "muted";
  return <Badge variant={v}>{p.charAt(0).toUpperCase() + p.slice(1)}</Badge>;
}
