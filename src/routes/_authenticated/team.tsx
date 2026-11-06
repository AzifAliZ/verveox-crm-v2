import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useMe } from "@/hooks/use-auth";
import { ROLE_LABEL, type AppRole } from "@/lib/crm";
import { fetchAllPages } from "@/lib/persistence";
import { inviteUser, setUserActive, setUserRole } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team — Verveox CRM" },
      { name: "description", content: "Manage employees, roles and performance." },
      { property: "og:title", content: "Team — Verveox CRM" },
      { property: "og:description", content: "Manage employees, roles and performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Team,
});

function Team() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const invite = useServerFn(inviteUser);
  const setRole = useServerFn(setUserRole);
  const setActive = useServerFn(setUserActive);
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    role: "employee" as "employee" | "manager",
  });
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [p, r, t, l] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("teams").select("*").order("name"),
        fetchAllPages((from, to) =>
          supabase
            .from("leads")
            .select("assigned_to, stage")
            .is("archived_at", null)
            .order("id")
            .range(from, to),
        ),
      ]);
      for (const x of [p, r, t]) if (x.error) throw x.error;
      const stats = new Map<string, { total: number; enrolled: number }>();
      l.forEach((x) => {
        if (!x.assigned_to) return;
        const s = stats.get(x.assigned_to) ?? { total: 0, enrolled: 0 };
        s.total++;
        if (x.stage === "enrolled") s.enrolled++;
        stats.set(x.assigned_to, s);
      });
      return { profiles: p.data!, roles: r.data!, teams: t.data!, stats };
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["team"] });
    qc.invalidateQueries({ queryKey: ["profiles"] });
  };
  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      toast.success(msg);
      refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }
  const roleOf = (id: string) => q.data?.roles.find((r) => r.user_id === id)?.role ?? "employee";
  const sel = "h-8 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div>
      <PageHeader
        title="Team Members"
        description="Employees see assigned and shared leads. Managers see their team's leads. Leads counted are active (non-archived)."
      />
      {me?.isAdmin && (
        <Card className="mb-6 p-4">
          <h3 className="mb-3 text-sm font-semibold">Invite a team member</h3>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const sent = await run(
                () =>
                  invite({
                    data: { ...form, redirectTo: `${window.location.origin}/reset-password` },
                  }),
                `Invitation sent to ${form.email}`,
              );
              if (sent) setForm({ email: "", full_name: "", role: "employee" });
              setBusy(false);
            }}
          >
            <Input
              required
              placeholder="Full name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="h-9 w-48"
            />
            <Input
              required
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="h-9 w-64"
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as "employee" })}
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
            </select>
            <Button disabled={busy}>{busy ? "Sending…" : "Send invite"}</Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Teams:</span>
            {q.data?.teams.map((t) => (
              <Badge key={t.id} variant="muted">
                {t.name}
              </Badge>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const n = prompt("Team name");
                if (n?.trim()) {
                  const { error } = await supabase
                    .from("teams")
                    .insert({ name: n.trim().slice(0, 100) });
                  if (error) {
                    toast.error(error.message);
                  } else {
                    refresh();
                  }
                }
              }}
            >
              + Add team
            </Button>
          </div>
        </Card>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Role</th>
              <th className="p-3">Team</th>
              <th className="p-3">Status</th>
              <th className="p-3">Leads</th>
              <th className="p-3">Enrolled</th>
              <th className="p-3">Conv. rate</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.profiles.map((p) => {
              const s = q.data.stats.get(p.id) ?? { total: 0, enrolled: 0 };
              const self = p.id === me?.id;
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-3">
                    <div className="font-medium">{p.full_name}</div>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                  </td>
                  <td className="p-3">
                    {me?.isAdmin && !self ? (
                      <select
                        className={sel}
                        value={roleOf(p.id)}
                        onChange={(e) =>
                          run(
                            () =>
                              setRole({ data: { userId: p.id, role: e.target.value as AppRole } }),
                            "Role updated",
                          )
                        }
                      >
                        {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABEL[roleOf(p.id)]
                    )}
                  </td>
                  <td className="p-3">
                    {me?.isAdmin ? (
                      <select
                        className={sel}
                        value={p.team_id ?? ""}
                        onChange={async (e) => {
                          const { error } = await supabase
                            .from("profiles")
                            .update({ team_id: e.target.value || null })
                            .eq("id", p.id)
                            .select("id")
                            .single();
                          if (error) {
                            toast.error(error.message);
                          } else {
                            refresh();
                          }
                        }}
                      >
                        <option value="">No team</option>
                        {q.data.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (q.data.teams.find((t) => t.id === p.team_id)?.name ?? "—")
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant={p.is_active ? "success" : "muted"}>
                      {p.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {me?.isAdmin && !self && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run(
                            () => setActive({ data: { userId: p.id, active: !p.is_active } }),
                            p.is_active ? "Deactivated" : "Activated",
                          )
                        }
                      >
                        {p.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </td>
                  <td className="p-3 tabular-nums">{s.total}</td>
                  <td className="p-3 tabular-nums">{s.enrolled}</td>
                  <td className="p-3 tabular-nums">
                    {s.total ? `${Math.round((s.enrolled / s.total) * 100)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {q.error && <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>}
      </div>
    </div>
  );
}
