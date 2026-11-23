import { chooseUploadRow, metricsFromGrid, metricsFromText, parseMarketSheet } from "@/lib/market.excel";
import type { MarketInput } from "@/lib/market.types";

export type UploadRead = {
  row: MarketInput | null;
  note: string;
};

function filePeriod(row: MarketInput | null) {
  if (!row || row.year < 1990 || row.quarter < 1 || row.quarter > 4) return "";
  return `${row.year} Q${row.quarter}`;
}

export async function readMarketUpload(file: File): Promise<UploadRead> {
  const buffer = await file.arrayBuffer();
  const pdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  if (pdf) {
    const text = await textFromPdf(buffer);
    const parsed = metricsFromText(text);
    if (!parsed) return { row: null, note: "No figures were found in that PDF. Use the Excel template, or type the quarter." };
    const seen = filePeriod(parsed);
    return { row: { ...parsed, source: "pdf" }, note: seen ? `The file looks like ${seen}. Choose the quarter to save.` : "Choose the submarket, year, and quarter for this file." };
  }
  const sheet = parseMarketSheet(buffer);
  const picked = chooseUploadRow(sheet.rows, "") ?? metricsFromGrid(buffer);
  if (!picked) return { row: null, note: sheet.errors[0] ?? "No figures were found in that file." };
  const seen = filePeriod(picked);
  return { row: { ...picked, source: "excel" }, note: seen ? `The file looks like ${seen}. Choose the quarter to save.` : "Choose the submarket, year, and quarter for this file." };
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
