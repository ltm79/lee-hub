import {
  asQuarterTotal,
  chooseUploadRow,
  metricsFromGrid,
  metricsFromText,
  parseMarketSheet,
} from "@/lib/market.excel";
import type { MarketInput } from "@/lib/market.types";

export type UploadPlace = {
  submarket: string;
  city: string;
  year: number;
  quarter: number;
};

export type UploadRead = {
  row: MarketInput | null;
  note: string;
};

function filePeriod(row: MarketInput | null) {
  if (!row || row.year < 1990 || row.quarter < 1 || row.quarter > 4) return "";
  return `${row.year} Q${row.quarter}`;
}

function chosen(place: UploadPlace) {
  return `${place.year} Q${place.quarter}`;
}

export async function readMarketUpload(file: File, place: UploadPlace): Promise<UploadRead> {
  const buffer = await file.arrayBuffer();
  const pdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  if (pdf) {
    const text = await textFromPdf(buffer);
    const parsed = metricsFromText(text);
    if (!parsed) return { row: null, note: "No figures were found in that PDF. Use the Excel template, or type the quarter." };
    const seen = filePeriod(parsed);
    const row = asQuarterTotal(parsed, place, "pdf");
    const note = seen && seen !== chosen(place) ? `The PDF looks like ${seen}. This will replace ${chosen(place)}.` : "";
    return { row, note };
  }
  const sheet = parseMarketSheet(buffer);
  const picked = chooseUploadRow(sheet.rows, place.submarket) ?? metricsFromGrid(buffer);
  if (!picked) return { row: null, note: sheet.errors[0] ?? "No figures were found in that file." };
  const seen = filePeriod(picked);
  const row = asQuarterTotal(picked, place, "excel");
  const note = seen && seen !== chosen(place) ? `The file looks like ${seen}. This will replace ${chosen(place)}.` : sheet.errors[0] ?? "";
  return { row, note };
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
