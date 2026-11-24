import { hasFigures, metricsByQuarter, metricsFromGrid, metricsFromText, parseMarketSheet, parsePeriodHistory, parseWideQuarters } from "@/lib/market.excel";
import type { MarketInput } from "@/lib/market.types";

export type UploadRead = {
  rows: MarketInput[];
  note: string;
  dated: boolean;
};

function labelOf(row: MarketInput) {
  return `Q${row.quarter} ${row.year}`;
}

function summary(rows: MarketInput[]) {
  const sorted = [...rows].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const first = sorted[0] ? labelOf(sorted[0]) : "";
  const last = sorted[sorted.length - 1] ? labelOf(sorted[sorted.length - 1]!) : "";
  if (!first) return "";
  if (rows.length === 1 || first === last) return first;
  return `${rows.length} quarters, ${first} through ${last}`;
}

export async function readMarketUpload(file: File): Promise<UploadRead> {
  const buffer = await file.arrayBuffer();
  const pdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  if (pdf) {
    const text = await textFromPdf(buffer);
    const many = metricsByQuarter(text);
    if (many.length >= 2) {
      return { rows: many.map((row) => ({ ...row, source: "pdf" })), dated: true, note: `Found ${summary(many)} in the file.` };
    }
    const parsed = metricsFromText(text);
    if (!parsed || !hasFigures(parsed)) return { rows: [], dated: false, note: "No figures were found in that PDF. Use the Excel template, or type the quarter." };
    const dated = parsed.year >= 1990 && parsed.quarter >= 1 && parsed.quarter <= 4;
    return {
      rows: [{ ...parsed, source: "pdf" }],
      dated,
      note: dated ? `The file is ${labelOf(parsed)}.` : "No quarter was labeled in the file. Choose the year and quarter.",
    };
  }
  const sheet = parseMarketSheet(buffer).rows.filter(hasFigures);
  const history = parsePeriodHistory(buffer);
  const wide = parseWideQuarters(buffer);
  const datedRows = sheet.filter((row) => row.year >= 1990 && row.quarter >= 1 && row.quarter <= 4);
  const periods = new Set(datedRows.map((row) => `${row.year}-${row.quarter}`));
  if (datedRows.length >= 2 || periods.size >= 2) {
    return { rows: datedRows.map((row) => ({ ...row, source: "excel" })), dated: true, note: `Found ${summary(datedRows)} in the file.` };
  }
  if (history.length >= 1 && !datedRows.length) {
    return { rows: history.map((row) => ({ ...row, source: "excel" })), dated: true, note: `Found ${summary(history)} in the file.` };
  }
  if (wide.length >= 2) {
    return { rows: wide.map((row) => ({ ...row, source: "excel" })), dated: true, note: `Found ${summary(wide)} across the columns.` };
  }
  if (datedRows.length === 1) {
    const row = datedRows[0];
    return row
      ? { rows: [{ ...row, source: "excel" }], dated: true, note: `The file is ${labelOf(row)}.` }
      : { rows: [], dated: false, note: "No figures were found in that file." };
  }
  const picked = metricsFromGrid(buffer);
  if (!picked || !hasFigures(picked)) return { rows: [], dated: false, note: "No figures were found in that file." };
  const dated = picked.year >= 1990 && picked.quarter >= 1 && picked.quarter <= 4;
  return {
    rows: [{ ...picked, source: "excel" }],
    dated,
    note: dated ? `The file is ${labelOf(picked)}.` : "No quarter was labeled in the file. Choose the year and quarter.",
  };
}

async function textFromPdf(buffer: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }
  return pages.join("\n");
}
