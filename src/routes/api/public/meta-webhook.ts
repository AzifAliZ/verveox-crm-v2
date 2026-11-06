import { createFileRoute } from "@tanstack/react-router";
import {
  MetaBodyError,
  metaWebhookSchema,
  readMetaBody,
  verifyMetaSignature,
} from "@/lib/meta-security";

// Meta Lead Ads webhook. GET = subscription verification; POST = signed leadgen events.
export const Route = createFileRoute("/api/public/meta-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const expected = process.env["META_VERIFY_TOKEN"];
        if (!expected) return new Response("Not configured", { status: 503 });
        if (
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") === expected
        ) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const secret = process.env["META_APP_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        let raw: string;
        try {
          raw = await readMetaBody(request);
        } catch (error) {
          return new Response(error instanceof MetaBodyError ? error.message : "Bad request", {
            status: error instanceof MetaBodyError ? error.status : 400,
          });
        }
        if (!(await verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret))) {
          return new Response("Invalid signature", { status: 401 });
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const validation = metaWebhookSchema.safeParse(parsed);
        if (!validation.success) return new Response("Invalid event", { status: 400 });
        const body = validation.data;
        if (body.object !== "page") return new Response("Ignored", { status: 200 });
        const { processMetaEvent } = await import("@/lib/meta.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const ids: string[] = [];
        for (const entry of body.entry ?? []) {
          for (const ch of entry.changes ?? []) {
            if (ch.field !== "leadgen" || !ch.value?.leadgen_id) continue;
            const v = ch.value;
            const { data, error } = await supabaseAdmin
              .from("integration_events")
              .upsert(
                {
                  provider: "meta",
                  external_event_id: String(v.leadgen_id),
                  event_type: "leadgen",
                  payload: { ...v, page_id: v.page_id ?? entry.id },
                },
                { onConflict: "provider,external_event_id", ignoreDuplicates: true },
              )
              .select("id");
            if (error) return new Response("Event storage unavailable", { status: 503 });
            if (data?.[0]) ids.push(data[0].id);
            else {
              const existing = await supabaseAdmin
                .from("integration_events")
                .select("id, status")
                .eq("provider", "meta")
                .eq("external_event_id", String(v.leadgen_id))
                .single();
              if (existing.error) return new Response("Event storage unavailable", { status: 503 });
              if (["received", "pending", "failed"].includes(existing.data.status))
                ids.push(existing.data.id);
            }
          }
        }
        for (const id of ids) {
          try {
            const result = await processMetaEvent(id);
            if (result.status === "failed")
              return new Response("Processing temporarily unavailable", { status: 503 });
          } catch {
            return new Response("Processing temporarily unavailable", { status: 503 });
          }
        }
        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});
