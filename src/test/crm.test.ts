import { describe, expect, it } from "vitest";
import { normalizePhone, safeCell } from "@/lib/crm";

describe("export safety", () => {
  it("prefixes formula-like cells so spreadsheets don't execute them", () => {
    expect(safeCell('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(safeCell("+91 98765")).toBe("'+91 98765");
    expect(safeCell("@cmd")).toBe("'@cmd");
  });
  it("leaves ordinary values untouched", () => {
    expect(safeCell("Priya")).toBe("Priya");
    expect(safeCell(null)).toBe("");
  });
});

describe("duplicate detection", () => {
  it("matches phones on their last 10 digits", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
    expect(normalizePhone("098765 43210")).toBe("9876543210");
  });
});
