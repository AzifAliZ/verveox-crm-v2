import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand";
import { rotatePassword } from "@/lib/password";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set new password — Verveox CRM" },
      { name: "description", content: "Choose a new password for Verveox CRM." },
      { property: "og:title", content: "Set new password — Verveox CRM" },
      { property: "og:description", content: "Choose a new password for Verveox CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await rotatePassword(supabase.auth, pw);
      toast.success("Password updated; sign in again");
      await nav({ to: "/auth" });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPw("");
      setBusy(false);
    }
  }
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-8">
        <BrandMark />
        <h1 className="text-xl font-semibold">Set a new password</h1>
        <div className="space-y-1.5">
          <Label htmlFor="pw">New password</Label>
          <Input
            id="pw"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
        <Button className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
