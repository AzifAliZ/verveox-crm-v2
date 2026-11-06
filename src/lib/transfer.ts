import Papa from "papaparse";
import * as XLSX from "xlsx";
import { unzipSync } from "fflate";
import { z } from "zod";
import { normalizePhone, EXPORT_COLUMNS, safeCell } from "./crm";

export const IMPORT_FIELDS = [
  ["full_name", "Full name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["whatsapp_number", "WhatsApp"],
  ["college", "College"],
  ["degree", "Degree"],
  ["department", "Department"],
  ["graduation_year", "Graduation year"],
  ["skills", "Skills"],
  ["interest", "Interest"],
  ["source", "Source"],
  ["utm_source", "UTM source"],
  ["utm_campaign", "UTM campaign"],
] as const;
export const mappingSchema = z
  .record(z.string().max(120), z.string().max(120))
  .superRefine((m, ctx) => {
    if (
      !m.full_name ||
      Object.keys(m).some((k) => !IMPORT_FIELDS.some(([f]) => f === k)) ||
      new Set(Object.values(m).filter(Boolean)).size !== Object.values(m).filter(Boolean).length
    )
      ctx.addIssue({ code: "custom", message: "Map Full name and use each column only once" });
  });
const text = (n: number) => z.string().trim().min(1).max(n).optional();
export const candidateSchema = z
  .object({
    full_name: z.string().trim().min(1).max(150),
    email: z.string().trim().email().max(255).optional(),
    phone: text(30),
    whatsapp_number: text(30),
    college: text(500),
    degree: text(500),
    department: text(500),
    graduation_year: z.coerce.number().int().min(1970).max(2100).optional(),
    skills: text(2000),
    interest: text(2000),
    source: text(100),
    utm_source: text(500),
    utm_campaign: text(500),
  })
  .strict()
  .refine(
    (d) => !!d.email || normalizePhone(d.phone).length >= 7,
    "An email or valid phone is required",
  );
export type CheckedRow = {
  row: number;
  data: Record<string, string | number>;
  error?: string;
  duplicate?: boolean;
};

export function parseUpload(name: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new Error("File must contain data and be at most 5 MB");
  const ext = name.split(".").pop()?.toLowerCase();
  let table: string[][];
  if (ext === "csv") {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (value.includes("\u0000")) throw new Error("Invalid CSV content");
    const result = Papa.parse<string[]>(value, { skipEmptyLines: "greedy" });
    if (result.errors.length) throw new Error("Malformed CSV: " + result.errors[0]?.message);
    table = result.data;
  } else if (ext === "xlsx" || ext === "xls") {
    if (ext === "xlsx") {
      if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error("Invalid Excel file");
      // Check declared archive sizes before allocating inflated entries.
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let total = 0;
      for (let i = 0; i + 46 <= bytes.length; i++)
        if (dv.getUint32(i, true) === 0x02014b50) total += dv.getUint32(i + 24, true);
      if (total > 20 * 1024 * 1024 || total === 0)
        throw new Error("Excel archive exceeds the 20 MB expanded limit");
      let expanded = 0;
      const entries = unzipSync(bytes, {
        filter: (entry) => {
          expanded += entry.originalSize;
          if (expanded > 20 * 1024 * 1024)
            throw new Error("Excel archive exceeds the 20 MB expanded limit");
          return true;
        },
      });
      if (Object.keys(entries).some((k) => /vbaProject|externalLinks/i.test(k)))
        throw new Error("Macros and external links are not accepted");
    } else if (bytes[0] !== 0xd0 || bytes[1] !== 0xcf) throw new Error("Invalid legacy Excel file");
    const wb = XLSX.read(bytes, { type: "array", sheetRows: 5002, cellFormula: true });
    if (wb.SheetNames.length !== 1) throw new Error("Upload a workbook containing one sheet");
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
    if (!sheet) throw new Error("No worksheet found");
    if (Object.values(sheet).some((c) => c && typeof c === "object" && "f" in c))
      throw new Error("Formula cells are not accepted; upload values only");
    table = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
  } else throw new Error("Upload a CSV, XLSX or XLS file");
  const headers = table.shift()?.map((h) => String(h).trim()) ?? [];
  if (
    !headers.length ||
    headers.length > 50 ||
    headers.some((h) => !h || h.length > 120) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("Headers must be unique, non-empty and at most 50 columns");
  if (!table.length || table.length > 5000) throw new Error("Upload between 1 and 5,000 rows");
  if (table.some((r) => r.length > headers.length || r.some((c) => String(c).length > 2000)))
    throw new Error("Extra columns or oversized cells found");
  const rows = table.map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "")])));
  return { headers, rows };
}

export function checkRows(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): CheckedRow[] {
  mappingSchema.parse(mapping);
  const seen = new Set<string>();
  return rows.map((row, i) => {
    const data = Object.fromEntries(
      Object.entries(mapping)
        .filter(([, h]) => h && row[h]?.trim())
        .map(([k, h]) => [k, row[h]?.trim()]),
    );
    const result = candidateSchema.safeParse(data);
    if (!result.success)
      return {
        row: i + 2,
        data: data as Record<string, string>,
        error: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      };
    const keys = [
      result.data.email ? `e:${result.data.email.toLowerCase()}` : "",
      normalizePhone(result.data.phone).length >= 7 ? `p:${normalizePhone(result.data.phone)}` : "",
    ].filter(Boolean);
    const repeated = keys.some((k) => seen.has(k));
    keys.forEach((k) => seen.add(k));
    return {
      row: i + 2,
      data: result.data,
      ...(repeated ? { error: "Repeated email or phone within this file" } : {}),
    };
  });
}

export function exportBytes(
  rows: Record<string, unknown>[],
  columns: string[],
  format: "csv" | "xlsx",
) {
  const headers = EXPORT_COLUMNS.filter((c) => columns.includes(c.key));
  if (!headers.length || headers.length !== columns.length)
    throw new Error("Invalid export columns");
  const data = rows.map((r) =>
    Object.fromEntries(headers.map((h) => [h.label, safeCell(r[h.key])])),
  );
  if (format === "csv")
    return new TextEncoder().encode(
      "\ufeff" + Papa.unparse(data, { columns: headers.map((h) => h.label) }),
    );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(data, { header: headers.map((h) => h.label) }),
    "Leads",
  );
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
