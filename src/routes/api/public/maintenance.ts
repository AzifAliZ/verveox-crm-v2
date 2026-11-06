import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { z } from "zod";

export const Route = createFileRoute("/api/public/maintenance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const body = z
          .object({ kind: z.enum(["meta", "cleanup"]) })
          .strict()
          .safeParse(await request.json().catch(() => null));
        if (!body.success) return new Response("Invalid request", { status: 400 });
        try {
          const { runMaintenance } = await import("@/lib/maintenance.server");
          return Response.json(await runMaintenance(body.data.kind));
        } catch {
          return new Response("Processing unavailable", { status: 503 });
        }
      },
    },
  },
});
