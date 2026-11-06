
import { createFileRoute } from "@tanstack/react-router";
import {
  MetaBodyError,
  metaWebhookSchema,
  readMetaBody,
  verifyMetaSignature,
} from "@/lib/meta-security";

// Meta Lead Ads webhook.
// GET = subscription verification.
// POST = signed leadgen notifications.

export const Route = createFileRoute("/api/public/meta-webhook")({
  server: {
    handlers: {
      // ==========================================
      // META WEBHOOK VERIFICATION
      // ==========================================
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const expected = process.env["META_VERIFY_TOKEN"];

        console.info("[META WEBHOOK] GET verification request", {
          timestamp: new Date().toISOString(),
          mode: url.searchParams.get("hub.mode"),
          challengePresent: !!url.searchParams.get("hub.challenge"),
          verifyTokenPresent: !!expected,
        });

        if (!expected) {
          console.error("[META WEBHOOK] Verify token not configured");
          return new Response("Not configured", { status: 503 });
        }

        if (
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") === expected
        ) {
          console.info("[META WEBHOOK] Verification successful");

          return new Response(
            url.searchParams.get("hub.challenge") ?? "",
            { status: 200 },
          );
        }

        console.warn("[META WEBHOOK] Verification failed");

        return new Response("Forbidden", { status: 403 });
      },

      // ==========================================
      // RECEIVE META LEAD EVENTS
      // ==========================================
      POST: async ({ request }) => {
        const requestId = crypto.randomUUID();

        console.info("[META WEBHOOK] POST received", {
          requestId,
          timestamp: new Date().toISOString(),
          signaturePresent: !!request.headers.get(
            "x-hub-signature-256",
          ),
        });

        // 1. Check Meta App Secret
        const secret = process.env["META_APP_SECRET"];

        if (!secret) {
          console.error("[META WEBHOOK] App secret not configured", {
            requestId,
          });

          return new Response("Not configured", { status: 503 });
        }

        // 2. Read request body
        let raw: string;

        try {
          raw = await readMetaBody(request);

          console.info("[META WEBHOOK] Request body received", {
            requestId,
            bodyLength: raw.length,
          });
        } catch (error) {
          console.error("[META WEBHOOK] Body reading failed", {
            requestId,
            error:
              error instanceof Error
                ? error.message
                : "Unknown body error",
          });

          return new Response(
            error instanceof MetaBodyError
              ? error.message
              : "Bad request",
            {
              status:
                error instanceof MetaBodyError
                  ? error.status
                  : 400,
            },
          );
        }

        // 3. Verify Meta signature
        const signature = request.headers.get(
          "x-hub-signature-256",
        );

        const signatureValid = await verifyMetaSignature(
          raw,
          signature,
          secret,
        );

        if (!signatureValid) {
          console.error("[META WEBHOOK] Invalid signature", {
            requestId,
            signaturePresent: !!signature,
          });

          return new Response("Invalid signature", {
            status: 401,
          });
        }

        console.info("[META WEBHOOK] Signature validated", {
          requestId,
        });

        // 4. Parse JSON
        let parsed: unknown;

        try {
          parsed = JSON.parse(raw);
        } catch {
          console.error("[META WEBHOOK] Invalid JSON", {
            requestId,
          });

          return new Response("Bad JSON", {
            status: 400,
          });
        }

        // 5. Validate webhook payload
        const validation = metaWebhookSchema.safeParse(parsed);

        if (!validation.success) {
          console.error("[META WEBHOOK] Payload validation failed", {
            requestId,
            issues: validation.error.issues.map((issue) => ({
              path: issue.path.join("."),
              code: issue.code,
            })),
          });

          return new Response("Invalid event", {
            status: 400,
          });
        }

        const body = validation.data;

        console.info("[META WEBHOOK] Payload validated", {
          requestId,
          object: body.object,
          entries: body.entry?.length ?? 0,
        });

        // 6. Confirm Page object
        if (body.object !== "page") {
          console.info("[META WEBHOOK] Ignoring non-page event", {
            requestId,
            object: body.object,
          });

          return new Response("Ignored", {
            status: 200,
          });
        }

        // 7. Initialize server-side processing
        const { processMetaEvent } = await import(
          "@/lib/meta.server"
        );

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const ids: string[] = [];

        // 8. Store incoming lead events
        for (const entry of body.entry ?? []) {
          for (const ch of entry.changes ?? []) {
            if (
              ch.field !== "leadgen" ||
              !ch.value?.leadgen_id
            ) {
              continue;
            }

            const v = ch.value;

            console.info("[META WEBHOOK] Lead event received", {
              requestId,
              leadgenId: String(v.leadgen_id),
              pageId: v.page_id ?? entry.id,
              formIdPresent: !!v.form_id,
            });

            const { data, error } = await supabaseAdmin
              .from("integration_events")
              .upsert(
                {
                  provider: "meta",
                  external_event_id: String(v.leadgen_id),
                  event_type: "leadgen",
                  payload: {
                    ...v,
                    page_id: v.page_id ?? entry.id,
                  },
                },
                {
                  onConflict: "provider,external_event_id",
                  ignoreDuplicates: true,
                },
              )
              .select("id");

            if (error) {
              console.error(
                "[META WEBHOOK] Event storage failed",
                {
                  requestId,
                  code: error.code,
                  message: error.message,
                  details: error.details,
                  hint: error.hint,
                },
              );

              return new Response(
                "Event storage unavailable",
                { status: 503 },
              );
            }

            if (data?.[0]) {
              ids.push(data[0].id);

              console.info("[META WEBHOOK] Event stored", {
                requestId,
                eventId: data[0].id,
              });
            } else {
              // Event already exists. Check whether it needs processing.
              const existing = await supabaseAdmin
                .from("integration_events")
                .select("id, status")
                .eq("provider", "meta")
                .eq(
                  "external_event_id",
                  String(v.leadgen_id),
                )
                .single();

              if (existing.error) {
                console.error(
                  "[META WEBHOOK] Existing event lookup failed",
                  {
                    requestId,
                    code: existing.error.code,
                    message: existing.error.message,
                  },
                );

                return new Response(
                  "Event storage unavailable",
                  { status: 503 },
                );
              }

              console.info("[META WEBHOOK] Duplicate event found", {
                requestId,
                eventId: existing.data.id,
                status: existing.data.status,
              });

              if (
                ["received", "pending", "failed"].includes(
                  existing.data.status,
                )
              ) {
                ids.push(existing.data.id);
              }
            }
          }
        }

        // 9. Process stored events
        for (const id of ids) {
          try {
            console.info("[META WEBHOOK] Processing event", {
              requestId,
              eventId: id,
            });

            const result = await processMetaEvent(id);

            console.info("[META WEBHOOK] Event processing result", {
              requestId,
              eventId: id,
              status: result.status,
              error: "error" in result ? result.error : undefined,
            });

            if (result.status === "failed") {
              return new Response(
                "Processing temporarily unavailable",
                { status: 503 },
              );
            }
          } catch (error) {
            console.error(
              "[META WEBHOOK] Event processing exception",
              {
                requestId,
                eventId: id,
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown processing error",
              },
            );

            return new Response(
              "Processing temporarily unavailable",
              { status: 503 },
            );
          }
        }

        // 10. Acknowledge successful receipt
        console.info("[META WEBHOOK] Completed successfully", {
          requestId,
          processedEvents: ids.length,
        });

        return new Response("EVENT_RECEIVED", {
          status: 200,
        });
      },
    },
  },
});
