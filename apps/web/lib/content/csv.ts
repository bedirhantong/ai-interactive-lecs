import type { DatasetRow } from "./schema";

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

/** Convert CSV text into typed rows; numeric-looking cells become numbers. */
export function csvToRows(text: string, idColumn: string): DatasetRow[] {
  const [header, ...body] = parseCsv(text);
  return body.map((cells) => {
    const row: Record<string, string | number> = {};
    header.forEach((key, i) => {
      const raw = cells[i] ?? "";
      const num = Number(raw);
      row[key] = raw.trim() !== "" && Number.isFinite(num) ? num : raw;
    });
    const id = Number(row[idColumn]);
    if (!Number.isInteger(id)) throw new Error(`Geçersiz satır kimliği: ${row[idColumn]}`);
    return { ...row, id } as DatasetRow;
  });
}
