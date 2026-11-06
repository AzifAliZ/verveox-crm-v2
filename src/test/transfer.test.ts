import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseUpload, checkRows, exportBytes, mappingSchema } from "@/lib/transfer";
import { safeCell } from "@/lib/crm";
const csv = (s: string) => new TextEncoder().encode(s);
describe("secure transfers", () => {
  it("rejects empty, wrong-format, malformed and duplicate-header uploads", () => {
    expect(() => parseUpload("a.csv", csv(""))).toThrow();
    expect(() => parseUpload("a.exe", csv("name,email\nA,a@b.com"))).toThrow();
    expect(() => parseUpload("a.xlsx", csv("not excel"))).toThrow();
    expect(() => parseUpload("a.csv", csv('name,email\n"broken,email'))).toThrow();
    expect(() => parseUpload("a.csv", csv("name,name\nA,B"))).toThrow();
  });
  it("enforces row and file bounds", () => {
    expect(() => parseUpload("a.csv", new Uint8Array(5 * 1024 * 1024 + 1))).toThrow();
    expect(() =>
      parseUpload("a.csv", csv("name,email\n" + Array(5001).fill("A,a@b.com").join("\n"))),
    ).toThrow();
  });
  it("requires unique mapping and full name", () => {
    expect(mappingSchema.safeParse({ email: "Email" }).success).toBe(false);
    expect(mappingSchema.safeParse({ full_name: "Name", email: "Name" }).success).toBe(false);
  });
  it("flags invalid email and repeated normalized contacts without writing", () => {
    const rows = checkRows(
      [
        { Name: "A", Email: "A@b.com", Phone: "+91 9876543210" },
        { Name: "B", Email: "a@b.com", Phone: "9876543210" },
        { Name: "C", Email: "bad", Phone: "" },
      ],
      { full_name: "Name", email: "Email", phone: "Phone" },
    );
    expect(rows[0].error).toBeUndefined();
    expect(rows[1].error).toContain("Repeated");
    expect(rows[2].error).toContain("email");
  });
  it("preserves quoted CSV values and supports Excel values", () => {
    expect(parseUpload("a.csv", csv('Name,Email\n"A, B",a@b.com')).rows[0].Name).toBe("A, B");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Name", "Email"],
        ["A", "a@b.com"],
      ]),
      "Data",
    );
    expect(
      parseUpload("a.xlsx", new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })))
        .rows.length,
    ).toBe(1);
  });
  it("rejects spreadsheet formulas", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Name", "Email"],
      ["A", "a@b.com"],
    ]);
    ws.A2 = { t: "n", f: "1+1", v: 2 };
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    expect(() =>
      parseUpload("a.xlsx", new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }))),
    ).toThrow("Formula");
  });
  it("neutralizes whitespace-prefixed injection in CSV and Excel", () => {
    expect(safeCell("  =1+1")).toBe("'  =1+1");
    const bytes = exportBytes([{ full_name: "  =1+1" }], ["full_name"], "xlsx");
    const wb = XLSX.read(bytes, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws.A2.t).toBe("s");
    expect(ws.A2.f).toBeUndefined();
    expect(ws.A2.v).toBe("'  =1+1");
    expect(
      new TextDecoder().decode(exportBytes([{ full_name: "@cmd" }], ["full_name"], "csv")),
    ).toContain("'@cmd");
    expect(() => exportBytes([], ["score", "secret"], "csv")).toThrow();
  });
});
