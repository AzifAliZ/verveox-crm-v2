import * as XLSX from "xlsx";
import Papa from "papaparse";
import { safeCell } from "./crm";

export function downloadRows(
  rows: Record<string, unknown>[],
  headers: { key: string; label: string }[],
  name: string,
  format: "csv" | "xlsx",
) {
  const data = rows.map((r) =>
    Object.fromEntries(headers.map((h) => [h.label, safeCell(r[h.key])])),
  );
  if (format === "csv") {
    const csv = Papa.unparse(data, { columns: headers.map((h) => h.label) });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `${name}.csv`);
  } else {
    const ws = XLSX.utils.json_to_sheet(data, { header: headers.map((h) => h.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    triggerDownload(
      new Blob([out], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${name}.xlsx`,
    );
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
