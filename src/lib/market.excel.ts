import * as XLSX from "xlsx";
import type { MarketInput } from "@/lib/market.types";

const HEADERS: Record<string, keyof MarketInput | "period"> = {
  market: "market",
  submarket: "submarket",
  city: "city",
  year: "year",
  quarter: "quarter",
  qtr: "quarter",
  period: "period",
  quarterlabel: "period",
  inventorysf: "inventorySf",
  totalinventorysf: "inventorySf",
  inventory: "inventorySf",
  vacancyrate: "vacancyRate",
  overallvacancy: "vacancyRate",
  vacancy: "vacancyRate",
  availabilityrate: "availabilityRate",
  overallavailability: "availabilityRate",
  availability: "availabilityRate",
  askingrent: "askingRent",
  askingrentnnn: "askingRent",
  overallaskingleaserate: "askingRent",
  overallaskingleaseratennn: "askingRent",
  leaserate: "askingRent",
  directrent: "directRent",
  leasingactivitysf: "leasingSf",
  leasingsf: "leasingSf",
  leasingactivity: "leasingSf",
  netabsorptionsf: "absorptionSf",
  absorptionsf: "absorptionSf",
  netabsorption: "absorptionSf",
  underconstructionsf: "underConstructionSf",
  underconstruction: "underConstructionSf",
  completionssf: "completionsSf",
  deliveries: "completionsSf",
  deliveredsf: "completionsSf",
  completions: "completionsSf",
  salepricepsf: "salePricePsf",
  saleprice: "salePricePsf",
  avgsalepricepsf: "salePricePsf",
  marketsalepricepsf: "salePricePsf",
  caprate: "capRate",
  marketcaprate: "capRate",
  salesvolume: "salesVolume",
  salessf: "salesSf",
  salesactivitysf: "salesSf",
  salesactivity: "salesSf",
  transactions: "transactions",
  salescount: "transactions",
  buildings: "buildings",
  existingbuildings: "buildings",
  vacantsf: "vacantSf",
  subletsf: "subletSf",
  availablesf: "availableSf",
  availablesftotal: "availableSf",
  notes: "notes",
};

function headerKey(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function numberOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return null;
  let text = String(value).trim();
  if (!text || text === "-" || text === "—") return null;
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/[$,%\s]/g, "").replace(/[(),]/g, "");
  const amount = Number(text);
  if (!Number.isFinite(amount)) return null;
  return negative ? -amount : amount;
}

function periodOf(value: unknown): { year: number; quarter: number } | null {
  const text = String(value ?? "").trim();
  const yearFirst = /^(\d{4})\s*[- ]?\s*q([1-4])$/i.exec(text);
  if (yearFirst) return { year: Number(yearFirst[1]), quarter: Number(yearFirst[2]) };
  const quarterFirst = /^q([1-4])\s*[- ]?\s*(\d{4})$/i.exec(text);
  if (quarterFirst) return { year: Number(quarterFirst[2]), quarter: Number(quarterFirst[1]) };
  const compact = /^([1-4])q\s*(\d{4})$/i.exec(text);
  if (compact) return { year: Number(compact[2]), quarter: Number(compact[1]) };
  return null;
}

function assignCell(draft: MarketInput, field: keyof MarketInput, value: unknown) {
  if (field === "market" || field === "submarket" || field === "city" || field === "notes") {
    draft[field] = String(value ?? "").trim();
    return;
  }
  if (field === "id" || field === "source") return;
  const amount = numberOf(value);
  if (field === "year" || field === "quarter") {
    draft[field] = amount == null ? 0 : Math.round(amount);
    return;
  }
  if (field === "transactions" || field === "buildings") {
    draft[field] = amount == null ? null : Math.round(amount);
    return;
  }
  draft[field] = amount;
}

function blank(): MarketInput {
  return {
    market: "",
    submarket: "",
    city: "",
    year: 0,
    quarter: 0,
    inventorySf: null,
    vacancyRate: null,
    availabilityRate: null,
    askingRent: null,
    directRent: null,
    leasingSf: null,
    absorptionSf: null,
    underConstructionSf: null,
    completionsSf: null,
    salePricePsf: null,
    capRate: null,
    salesVolume: null,
    salesSf: null,
    transactions: null,
    buildings: null,
    vacantSf: null,
    subletSf: null,
    availableSf: null,
    notes: "",
  };
}

export function parseMarketSheet(buffer: ArrayBuffer): { rows: MarketInput[]; errors: string[] } {
  const book = XLSX.read(buffer, { type: "array" });
  const name = book.SheetNames[0];
  if (!name) return { rows: [], errors: ["The workbook has no sheets."] };
  const sheet = book.Sheets[name];
  if (!sheet) return { rows: [], errors: ["The first sheet is empty."] };
  const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: true, defval: null });
  const headerIndex = grid.findIndex((row) => row.some((cell) => headerKey(cell) === "market"));
  if (headerIndex < 0) return { rows: [], errors: ["Add a header row with a Market column."] };
  const headers = (grid[headerIndex] ?? []).map((cell) => HEADERS[headerKey(cell)] ?? "");
  const rows: MarketInput[] = [];
  const errors: string[] = [];
  for (let index = headerIndex + 1; index < grid.length && rows.length < 2000; index += 1) {
    const line = grid[index] ?? [];
    if (line.every((cell) => cell == null || String(cell).trim() === "")) continue;
    const draft = blank();
    const found: { period: { year: number; quarter: number } | null } = { period: null };
    headers.forEach((field, column) => {
      if (!field) return;
      const value = line[column];
      if (field === "period") {
        found.period = periodOf(value);
        return;
      }
      assignCell(draft, field, value);
    });
    if (found.period) {
      draft.year = found.period.year;
      draft.quarter = found.period.quarter;
    }
    if (!draft.market && !draft.year) continue;
    if (!draft.market) {
      errors.push(`Row ${index + 1} needs a market.`);
      continue;
    }
    if (draft.quarter < 1 || draft.quarter > 4 || draft.year < 1990 || draft.year > 2100) {
      errors.push(`Row ${index + 1} needs a year and quarter, like 2026 and 3, or a period like 2026 Q3.`);
      continue;
    }
    rows.push(draft);
  }
  if (!rows.length && !errors.length) errors.push("No data rows were found under the header.");
  return { rows, errors: errors.slice(0, 8) };
}

export const MARKET_TEMPLATE = [
  "Market,Submarket,City,Year,Quarter,Inventory SF,Vacancy Rate,Availability Rate,Asking Rent,Direct Rent,Leasing Activity SF,Net Absorption SF,Under Construction SF,Completions SF,Sale Price PSF,Cap Rate,Sales Volume,Sales SF,Transactions,Buildings,Vacant SF,Sublet SF,Available SF,Notes",
  "San Gabriel Valley,,,2026,3,175268454,5.8,6.7,1.40,,1790763,-290936,446944,,,,1946053,,,,,Quarter total. Leave City blank. A later upload does not replace this unless you choose replace.",
].join("\n");

const METRIC_LABELS: { field: keyof MarketInput; pattern: RegExp }[] = [
  { field: "inventorySf", pattern: /(?:total\s+)?inventory(?:\s+sf)?/i },
  { field: "vacancyRate", pattern: /(?:overall\s+)?vacancy(?:\s+rate)?/i },
  { field: "availabilityRate", pattern: /(?:overall\s+)?availability(?:\s+rate)?/i },
  { field: "askingRent", pattern: /(?:overall\s+)?asking(?:\s+lease)?\s+rate(?:\s+nnn)?|asking\s+rent(?:\s+nnn)?/i },
  { field: "directRent", pattern: /direct\s+rent/i },
  { field: "leasingSf", pattern: /leasing\s+activity(?:\s+sf)?/i },
  { field: "absorptionSf", pattern: /net\s+absorption(?:\s+sf)?/i },
  { field: "underConstructionSf", pattern: /under\s+construction(?:\s+sf)?/i },
  { field: "completionsSf", pattern: /completions(?:\s+sf)?|deliveries(?:\s+sf)?/i },
  { field: "salePricePsf", pattern: /(?:avg(?:erage)?\s+)?sale\s+price(?:\s*\/\s*sf|\s+psf)?/i },
  { field: "capRate", pattern: /cap\s+rate/i },
  { field: "salesVolume", pattern: /sales\s+volume/i },
  { field: "salesSf", pattern: /sales\s+activity(?:\s+sf)?|sales\s+sf/i },
  { field: "transactions", pattern: /transactions|sales\s+count/i },
  { field: "buildings", pattern: /(?:existing\s+)?buildings/i },
  { field: "vacantSf", pattern: /vacant\s+sf/i },
  { field: "subletSf", pattern: /sublet\s+sf/i },
  { field: "availableSf", pattern: /available\s+sf/i },
];

function numberAfter(text: string, index: number) {
  const slice = text.slice(index, index + 64);
  const re = /-?\(?\$?\s*\d[\d,]*(?:\.\d+)?%?\)?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(slice))) {
    const amount = numberOf(match[0]);
    if (amount == null) continue;
    if (amount >= 1990 && amount <= 2100 && !match[0].includes(".")) continue;
    return amount;
  }
  return null;
}

export function metricsFromText(text: string): MarketInput | null {
  const draft = blank();
  let found = 0;
  for (const label of METRIC_LABELS) {
    const match = label.pattern.exec(text);
    if (!match) continue;
    const amount = numberAfter(text, match.index + match[0].length);
    if (amount == null) continue;
    assignCell(draft, label.field, amount);
    found += 1;
  }
  const period = periodOf(text) ?? quarterInText(text);
  if (period) {
    draft.year = period.year;
    draft.quarter = period.quarter;
  }
  return found ? draft : null;
}

function quarterInText(text: string) {
  const yearFirst = /(20\d{2})\s*q([1-4])/i.exec(text);
  if (yearFirst) return { year: Number(yearFirst[1]), quarter: Number(yearFirst[2]) };
  const quarterFirst = /q([1-4])\s*(20\d{2})/i.exec(text);
  if (quarterFirst) return { year: Number(quarterFirst[2]), quarter: Number(quarterFirst[1]) };
  return null;
}

export function metricsFromGrid(buffer: ArrayBuffer): MarketInput | null {
  const book = XLSX.read(buffer, { type: "array" });
  const name = book.SheetNames[0];
  if (!name) return null;
  const sheet = book.Sheets[name];
  if (!sheet) return null;
  const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: true, defval: null });
  const draft = blank();
  let found = 0;
  for (const line of grid) {
    const cells = (line ?? []).filter((cell) => cell != null && String(cell).trim() !== "");
    if (cells.length < 2) continue;
    const field = HEADERS[headerKey(cells[0])];
    if (!field || field === "market" || field === "submarket" || field === "city") continue;
    if (field === "period") {
      const period = periodOf(cells[1]);
      if (period) {
        draft.year = period.year;
        draft.quarter = period.quarter;
      }
      continue;
    }
    assignCell(draft, field, cells[1]);
    found += 1;
  }
  if (!found) {
    const text = grid.map((line) => (line ?? []).map((cell) => String(cell ?? "")).join(" ")).join("\n");
    return metricsFromText(text);
  }
  return draft;
}

export function chooseUploadRow(rows: MarketInput[], submarket: string) {
  if (!rows.length) return null;
  const name = submarket.trim().toLowerCase();
  return (
    rows.find((row) => row.market.trim().toLowerCase() === name && !row.submarket && !row.city) ??
    rows.find((row) => `${row.market} ${row.submarket}`.toLowerCase().includes(name) && !row.city) ??
    rows.find((row) => !row.city) ??
    rows[0] ??
    null
  );
}

export function asQuarterTotal(
  row: MarketInput,
  place: { submarket: string; city: string; year: number; quarter: number },
  source: string,
): MarketInput {
  return {
    ...row,
    market: place.submarket,
    submarket: "",
    city: place.city.trim(),
    year: place.year,
    quarter: place.quarter,
    source,
  };
}

