import { describe, expect, it } from "vitest";
import { META_MAX_ATTEMPTS, metaFailurePermanent, metaRetryDelay } from "@/lib/meta-retry";
describe("Meta recovery policy", () => {
  it("uses capped exponential backoff", () => {
    expect([1, 2, 3, 4, 5].map(metaRetryDelay)).toEqual([60, 120, 240, 480, 960]);
    expect(metaRetryDelay(10)).toBe(3600);
    expect(META_MAX_ATTEMPTS).toBe(5);
  });
  it("keeps transient Graph errors retryable", () => {
    expect(metaFailurePermanent(400, 4)).toBe(false);
    expect(metaFailurePermanent(429)).toBe(false);
    expect(metaFailurePermanent(503)).toBe(false);
    expect(metaFailurePermanent(403, 190)).toBe(true);
  });
});
