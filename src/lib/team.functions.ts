import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(
  supabase: {
    rpc: (fn: "is_admin", args: { _uid: string }) => PromiseLike<{ data: boolean | null }>;
  },
  userId: string,
) {
  const { data } = await supabase.rpc("is_admin", { _uid: userId });
  if (!data) throw new Error("Only Super Admins can manage users");
}

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email().max(255),
        full_name: z.string().trim().min(1).max(100),
        role: z.enum(["manager", "employee"]),
        redirectTo: z.string().url(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.full_name },
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error(error.message);
    const uid = inv.user.id;
    const roleResult = await context.supabase.rpc("admin_set_user_role", {
      _user_id: uid,
      _role: data.role,
    });
    if (roleResult.error)
      throw new Error(`Invitation created, but authorization failed: ${roleResult.error.message}`);
    const profileResult = await supabaseAdmin
      .from("profiles")
      .update({ is_active: true, full_name: data.full_name })
      .eq("id", uid)
      .select("id")
      .single();
    if (profileResult.error)
      throw new Error(`Invitation created, but activation failed: ${profileResult.error.message}`);
    const auditResult = await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "invite",
      entity_type: "user",
      entity_id: uid,
      metadata: { email: data.email, role: data.role },
    });
    if (auditResult.error) throw new Error(auditResult.error.message);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ userId: z.string().uuid(), role: z.enum(["super_admin", "manager", "employee"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot change your own role");
    const { error } = await context.supabase.rpc("admin_set_user_role", {
      _user_id: data.userId,
      _role: data.role,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot deactivate yourself");
    const { error } = await context.supabase
      .from("profiles")
      .update({ is_active: data.active })
      .eq("id", data.userId)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const metaIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);

    const processEnv =
      typeof process !== "undefined" ? process.env : undefined;

    const keys = [
      "META_VERIFY_TOKEN",
      "META_APP_SECRET",
      "META_PAGE_ACCESS_TOKEN",
    ] as const;

    const check = (source: Record<string, unknown> | undefined) =>
      Object.fromEntries(
        keys.map((key) => [
          key,
          typeof source?.[key] === "string" &&
            (source[key] as string).trim().length > 0,
        ]),
      );

    return {
      processEnv: check(processEnv),
      runtime: {
        processExists: typeof process !== "undefined",
        processEnvExists: !!processEnv,
      },
    };
  });
  
export const reprocessMetaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);
    const queued = await context.supabase.rpc("requeue_meta_event", { _id: data.eventId });
    if (queued.error) throw new Error(queued.error.message);
    const { processMetaEvent } = await import("./meta.server");
    return processMetaEvent(data.eventId);
  });

export const testMetaIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);
    const { testMetaConnection } = await import("./meta.server");
    return JSON.parse(JSON.stringify(await testMetaConnection(context.userId))) as {
      ok: boolean;
      error: string | null;
      details: {
        missing?: string[];
        page?: { id: string; name: string };
        forms?: { id: string; name: string; status: string }[];
      };
    };
  });

export const retryFailedMetaEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);
    const { runMaintenance } = await import("./maintenance.server");
    return runMaintenance("meta");
  });
