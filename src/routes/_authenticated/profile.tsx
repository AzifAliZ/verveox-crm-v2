import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-auth";
import { ROLE_LABEL } from "@/lib/crm";
import { rotatePassword } from "@/lib/password";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Verveox CRM" },
      { name: "description", content: "Your account details." },
      { property: "og:title", content: "My profile — Verveox CRM" },
      { property: "og:description", content: "Your account details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (me) setName(me.full_name);
  }, [me]);
  return (
    <div className="max-w-lg space-y-6">
      <PageHeader
        title="My profile"
        description={`${me?.email} · ${me?.roles.map((r) => ROLE_LABEL[r]).join(", ")}`}
      />
      <Card className="space-y-3 p-5">
        <Label htmlFor="n">Full name</Label>
        <Input id="n" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <Button
          onClick={async () => {
            const { error } = await supabase
              .from("profiles")
              .update({ full_name: name.trim() })
              .eq("id", me?.id ?? "")
              .select("id")
              .single();
            if (error) toast.error(error.message);
            else {
              toast.success("Saved");
              qc.invalidateQueries({ queryKey: ["me"] });
            }
          }}
        >
          Save
        </Button>
      </Card>
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Change password</h3>
        <Input
          aria-label="Current password"
          type="password"
          autoComplete="current-password"
          placeholder="Current password"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
        />
        <Input
          aria-label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="New password (12–128 characters)"
          minLength={12}
          maxLength={128}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <Input
          aria-label="Confirm new password"
          type="password"
          autoComplete="new-password"
          placeholder="Confirm new password"
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button
          disabled={busy || !cur || pw.length < 12 || pw !== confirm}
          onClick={async () => {
            setBusy(true);
            try {
              await rotatePassword(supabase.auth, pw, cur);
              qc.clear();
              toast.success("Password changed; sign in again");
              await navigate({ to: "/auth" });
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setPw("");
              setCur("");
              setConfirm("");
              setBusy(false);
            }
          }}
        >
          {busy ? "Updating…" : "Update password"}
        </Button>
      </Card>
    </div>
  );
}
