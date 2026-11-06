import { z } from "zod";

export const META_BODY_LIMIT = 1_000_000;
const metaId = z.string().regex(/^\d{1,100}$/);
export const metaWebhookSchema = z.object({
  object: z.string().max(100),
  entry: z
    .array(
      z.object({
        id: metaId,
        changes: z
          .array(
            z.object({
              field: z.string().max(100),
              value: z.object({
                leadgen_id: metaId.optional(),
                page_id: metaId.optional(),
                form_id: metaId.optional(),
                ad_id: metaId.optional(),
                adgroup_id: metaId.optional(),
                campaign_id: metaId.optional(),
              }),
            }),
          )
          .max(100)
          .optional(),
      }),
    )
    .max(100)
    .optional(),
});

export class MetaBodyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Bound unauthenticated bytes before buffering or decoding. */
export async function readMetaBody(request: Request) {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > META_BODY_LIMIT) throw new MetaBodyError("Too large", 413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > META_BODY_LIMIT) {
        await reader.cancel();
        throw new MetaBodyError("Too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new MetaBodyError("Invalid encoding", 400);
  }
}

export async function verifyMetaSignature(raw: string, header: string | null, secret: string) {
  if (!header || !/^sha256=[a-f0-9]{64}$/.test(header)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7);
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
