import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useMe, useRefData } from "@/hooks/use-auth";
import { validPoints, validThresholds } from "@/lib/pipeline";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Verveox CRM" },
      { name: "description", content: "Company, scoring, courses, sources and tags." },
      { property: "og:title", content: "Settings — Verveox CRM" },
      { property: "og:description", content: "Company, scoring, courses, sources and tags." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [saving, setSaving] = useState(false);
  const { data: ref } = useRefData();
  const s = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const [a, r] = await Promise.all([
        supabase.from("app_settings").select("*").eq("id", 1).single(),
        supabase.from("scoring_rules").select("*").order("sort_order"),
      ]);
      if (a.error) throw a.error;
      if (r.error) throw r.error;
      return { app: a.data, rules: r.data };
    },
  });
  const [app, setApp] = useState({
    company_name: "",
    hot_threshold: 70,
    warm_threshold: 35,
    retention_days: "",
  });
  useEffect(() => {
    if (s.data)
      setApp({
        company_name: s.data.app.company_name,
        hot_threshold: s.data.app.hot_threshold,
        warm_threshold: s.data.app.warm_threshold,
        retention_days: s.data.app.retention_days?.toString() ?? "",
      });
  }, [s.data]);
  const refreshRef = () => qc.invalidateQueries({ queryKey: ["refdata"] });
  async function q(
    p: PromiseLike<{ error: { message: string } | null }>,
    ok: string,
    after?: () => void,
  ) {
    setSaving(true);
    try {
      const { error } = await p;
      if (error) throw new Error(error.message);
      toast.success(ok);
      after?.();
      for (const prefix of ["lead", "leads", "pipeline", "dashboard", "reports"])
        qc.invalidateQueries({ queryKey: [prefix] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      {s.error && (
        <p role="alert" className="text-destructive">
          Could not load settings: {s.error.message}
        </p>
      )}
      <fieldset
        disabled={!me?.isAdmin || saving || s.isLoading}
        className="space-y-6 disabled:opacity-70"
      >
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Company & classification</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm">
              Company name
              <Input
                value={app.company_name}
                onChange={(e) => setApp({ ...app, company_name: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Hot from score
              <Input
                type="number"
                min={1}
                max={100}
                value={app.hot_threshold}
                onChange={(e) => setApp({ ...app, hot_threshold: Number(e.target.value) })}
              />
            </label>
            <label className="text-sm">
              Warm from score
              <Input
                type="number"
                min={0}
                max={99}
                value={app.warm_threshold}
                onChange={(e) => setApp({ ...app, warm_threshold: Number(e.target.value) })}
              />
            </label>
            <label className="text-sm">
              Data retention (days, blank = keep)
              <Input
                type="number"
                min={30}
                value={app.retention_days}
                onChange={(e) => setApp({ ...app, retention_days: e.target.value })}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Below warm = Cold. Changing thresholds recalculates every lead; manual overrides are
            kept. Scores are guides, not conversion predictions.
          </p>
          <Button
            className="mt-3"
            onClick={() => {
              if (!validThresholds(app.warm_threshold, app.hot_threshold))
                return toast.error(
                  "Use whole-number thresholds between 0 and 100, with Warm below Hot",
                );
              q(
                supabase
                  .from("app_settings")
                  .update({
                    company_name: app.company_name.trim() || "Verveox Technologies",
                    hot_threshold: app.hot_threshold,
                    warm_threshold: app.warm_threshold,
                    retention_days: app.retention_days ? Number(app.retention_days) : null,
                  })
                  .eq("id", 1)
                  .select("id")
                  .single(),
                "Settings saved",
                () => s.refetch(),
              );
            }}
          >
            Save
          </Button>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Lead scoring rules</h3>
          <div className="space-y-2">
            {s.data?.rules.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center gap-3 text-sm">
                <Switch
                  checked={r.is_active}
                  onCheckedChange={(v) =>
                    q(
                      supabase
                        .from("scoring_rules")
                        .update({ is_active: v })
                        .eq("key", r.key)
                        .select("key")
                        .single(),
                      "Rule updated",
                      () => s.refetch(),
                    )
                  }
                  aria-label={`Toggle ${r.label}`}
                />
                <span className="flex-1">{r.label}</span>
                <Input
                  key={`${r.key}-${r.points}`}
                  aria-label={`Points for ${r.label}`}
                  type="number"
                  defaultValue={r.points}
                  min={-100}
                  max={100}
                  step={1}
                  className="h-8 w-20"
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!e.target.value.trim() || !validPoints(v)) {
                      e.target.value = String(r.points);
                      return toast.error("Points must be whole numbers from -100 to 100");
                    }
                    if (v !== r.points)
                      q(
                        supabase
                          .from("scoring_rules")
                          .update({ points: v })
                          .eq("key", r.key)
                          .select("key")
                          .single(),
                        "Points updated",
                        () => s.refetch(),
                      );
                  }}
                />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              const label = prompt("Rule description");
              if (!label?.trim()) return;
              const raw = prompt("Points (-100 to 100)", "10");
              if (raw === null) return;
              const pts = Number(raw);
              if (!raw.trim() || !validPoints(pts))
                return toast.error("Points must be whole numbers from -100 to 100");
              const key =
                label
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "_")
                  .replace(/^_|_$/g, "")
                  .slice(0, 40) || "rule";
              q(
                supabase
                  .from("scoring_rules")
                  .insert({ key, label: label.trim(), points: pts, sort_order: 100 }),
                "Rule added",
                () => s.refetch(),
              );
            }}
          >
            Add rule
          </Button>
        </Card>

        <div className="grid gap-6 md:grid-cols-3">
          <ListEditor
            title="Courses & internships"
            items={
              ref?.courses.map((c) => ({
                id: c.id,
                label: `${c.name} (${c.kind})`,
                active: c.is_active,
              })) ?? []
            }
            onAdd={() => {
              const n = prompt("Course or internship name");
              if (!n?.trim()) return;
              const k =
                prompt("Type: course, internship or training", "course")?.trim() || "course";
              q(
                supabase.from("courses").insert({
                  name: n.trim(),
                  kind: ["course", "internship", "training"].includes(k) ? k : "course",
                }),
                "Added",
                refreshRef,
              );
            }}
            onToggle={(id, v) =>
              q(
                supabase
                  .from("courses")
                  .update({ is_active: v })
                  .eq("id", id)
                  .select("id")
                  .single(),
                "Updated",
                refreshRef,
              )
            }
          />
          <ListEditor
            title="Lead sources"
            items={
              ref?.sources.map((c) => ({
                id: c.id,
                label: `${c.label} (${c.key})`,
                active: c.is_active,
              })) ?? []
            }
            onAdd={() => {
              const l = prompt("Source label");
              if (!l?.trim()) return;
              q(
                supabase.from("lead_sources").insert({
                  label: l.trim(),
                  key: l
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "_")
                    .slice(0, 40),
                }),
                "Added",
                refreshRef,
              );
            }}
            onToggle={(id, v) =>
              q(
                supabase
                  .from("lead_sources")
                  .update({ is_active: v })
                  .eq("id", id)
                  .select("id")
                  .single(),
                "Updated",
                refreshRef,
              )
            }
          />
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Tags</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const n = prompt("Tag name");
                  if (n?.trim())
                    q(
                      supabase.from("tags").insert({ name: n.trim().slice(0, 50) }),
                      "Tag added",
                      refreshRef,
                    );
                }}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ref?.tags.map((t) => (
                <Badge key={t.id} variant="info">
                  {t.name}
                  <button
                    className="ml-1"
                    aria-label={`Delete ${t.name}`}
                    onClick={() =>
                      confirm(`Delete tag "${t.name}"? It will be removed from all leads.`) &&
                      q(
                        supabase.from("tags").delete().eq("id", t.id).select("id").single(),
                        "Tag deleted",
                        refreshRef,
                      )
                    }
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground">
          Pipeline stages are fixed to keep reporting consistent. Meta integration lives under
          Integrations; team and role management under Team Members.
        </p>
      </fieldset>
    </div>
  );
}

function ListEditor({
  title,
  items,
  onAdd,
  onToggle,
}: {
  title: string;
  items: { id: string; label: string; active: boolean }[];
  onAdd: () => void;
  onToggle: (id: string, v: boolean) => void;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <Button size="sm" variant="outline" onClick={onAdd}>
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((i) => (
          <label key={i.id} className="flex items-center justify-between text-sm">
            <span className={i.active ? "" : "text-muted-foreground line-through"}>{i.label}</span>
            <Switch checked={i.active} onCheckedChange={(v) => onToggle(i.id, v)} />
          </label>
        ))}
        {!items.length && <p className="text-sm text-muted-foreground">None yet.</p>}
      </div>
    </Card>
  );
}
