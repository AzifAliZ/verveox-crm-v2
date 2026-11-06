import { describe, expect, it } from "vitest";
import {
  META_BODY_LIMIT,
  metaWebhookSchema,
  readMetaBody,
  verifyMetaSignature,
} from "@/lib/meta-security";

describe("Meta webhook security", () => {
  it("accepts only a signature for the unchanged body and correct key", async () => {
    const raw = '{"object":"page"}';
    const fixtureKey = "unit-test-only-not-a-deployed-secret";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(fixtureKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
    );
    const header = "sha256=" + [...signature].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await verifyMetaSignature(raw, header, fixtureKey)).toBe(true);
    expect(await verifyMetaSignature(raw + " ", header, fixtureKey)).toBe(false);
    expect(await verifyMetaSignature(raw, header, "wrong-test-key")).toBe(false);
    expect(await verifyMetaSignature(raw, null, fixtureKey)).toBe(false);
    expect(await verifyMetaSignature(raw, "sha256=invalid", fixtureKey)).toBe(false);
  });
  it("rejects declared oversized requests before reading", async () => {
    const request = new Request("https://test.invalid", {
      method: "POST",
      headers: { "content-length": String(META_BODY_LIMIT + 1) },
      body: "small",
    });
    await expect(readMetaBody(request)).rejects.toMatchObject({ status: 413 });
    expect(request.bodyUsed).toBe(false);
  });
  it("cancels oversized streamed requests even without content-length", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(600_000));
        c.enqueue(new Uint8Array(400_001));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("https://test.invalid", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(readMetaBody(request)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
  });
  it("reads valid UTF-8 and rejects invalid encoding", async () => {
    expect(
      await readMetaBody(new Request("https://test.invalid", { method: "POST", body: "valid" })),
    ).toBe("valid");
    await expect(
      readMetaBody(
        new Request("https://test.invalid", { method: "POST", body: new Uint8Array([255]) }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("validates nested event identifiers and collection bounds", () => {
    const entry = {
      id: "123",
      changes: [{ field: "leadgen", value: { leadgen_id: "456", created_time: 123 } }],
    };
    expect(metaWebhookSchema.safeParse({ object: "page", entry: [entry] }).success).toBe(true);
    expect(metaWebhookSchema.safeParse({ object: "page", entry: "bad" }).success).toBe(false);
    expect(
      metaWebhookSchema.safeParse({
        object: "page",
        entry: [{ id: "123", changes: [{ field: "leadgen", value: { leadgen_id: {} } }] }],
      }).success,
    ).toBe(false);
    expect(
      metaWebhookSchema.safeParse({ object: "page", entry: Array(101).fill(entry) }).success,
    ).toBe(false);
  });
});
