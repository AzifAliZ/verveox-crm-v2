import { describe, expect, it } from "vitest";
import { fetchAllPages, requireAffectedRows } from "../lib/persistence";

describe("persistent mutations", () => {
  it("rejects a zero-row save", () => expect(() => requireAffectedRows(0)).toThrow());
  it("rejects a partial bulk save", () => expect(() => requireAffectedRows(24, 25)).toThrow());
  it("accepts the exact affected count", () =>
    expect(() => requireAffectedRows(25, 25)).not.toThrow());
});
describe("complete authorized totals", () => {
  it("counts all 1201 authorized records across API pages", async () => {
    const all = Array.from({ length: 1201 }, (_, id) => ({ id }));
    const rows = await fetchAllPages(async (from, to) => ({
      data: all.slice(from, to + 1),
      error: null,
    }));
    expect(rows.length).toBe(1201);
    expect(rows[1200]?.id).toBe(1200);
  });
  it("does not treat a failed page as an empty dataset", async () => {
    await expect(
      fetchAllPages(async () => ({ data: null, error: { message: "Access denied" } })),
    ).rejects.toThrow("Access denied");
  });
});
