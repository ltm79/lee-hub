import * as XLSX from "xlsx";

export type BoardDraft = {
  asOf: string;
  asOfLabel: string;
  rangeLabel: string;
  rows: { name: string; gross: number }[];
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function headerKey(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function numberOf(value: unknown): number | null {
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

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dated(year: number, month: number, day: number) {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {
    iso: `${year}-${pad(month)}-${pad(day)}`,
    label: `${MONTHS[month - 1]} ${day}, ${year}`,
  };
}

function parseLooseDate(value: unknown) {
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return dated(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const yearFirst = /^(\d{4})[/. -](\d{1,2})[/. -](\d{1,2})/.exec(text);
  if (yearFirst) return dated(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
  const monthFirst = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})/.exec(text);
  if (!monthFirst) return null;
  let year = Number(monthFirst[3]);
  if (year < 100) year += 2000;
  return dated(year, Number(monthFirst[1]), Number(monthFirst[2]));
}

function rangeLabel(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const parts = text.split(/\s*[–—-]\s*/);
  if (parts.length < 2) return text.slice(0, 80);
  const start = parseLooseDate(parts[0]);
  const end = parseLooseDate(parts.slice(1).join("-"));
  if (!start || !end) return text.slice(0, 80);
  if (start.label.slice(-4) === end.label.slice(-4)) {
    return `${start.label.replace(/, \d{4}$/, "")} – ${end.label}`;
  }
  return `${start.label} – ${end.label}`;
}

function grossColumn(headers: string[]) {
  const exact = headers.findIndex((key) => key === "brokergross");
  if (exact >= 0) return exact;
  const plain = headers.findIndex((key) => key === "gross");
  if (plain >= 0) return plain;
  return headers.findIndex((key) => key.includes("gross") && !key.includes("net") && !key.includes("forecast"));
}

export function parseLeaderboardSheet(buffer: ArrayBuffer): { draft: BoardDraft | null; error: string } {
  const book = XLSX.read(buffer, { type: "array" });
  const name = book.SheetNames[0];
  if (!name) return { draft: null, error: "The workbook has no sheets." };
  const sheet = book.Sheets[name];
  if (!sheet) return { draft: null, error: "The first sheet is empty." };
  const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  let asOf = "";
  let asOfLabel = "";
  let range = "";
  let headerIndex = -1;
  for (let index = 0; index < grid.length && index < 40; index += 1) {
    const line = grid[index] ?? [];
    const keys = line.map((cell) => headerKey(cell));
    if (keys.includes("name") && grossColumn(keys) >= 0) {
      headerIndex = index;
      break;
    }
    const label = keys.findIndex((key) => key === "leaderboard" || key === "asof" || key === "updated");
    if (label >= 0 && !asOf) {
      for (const cell of line) {
        const found = parseLooseDate(cell);
        if (found) {
          asOf = found.iso;
          asOfLabel = found.label;
          break;
        }
      }
    }
    const rangeCell = keys.findIndex((key) => key === "range" || key === "daterange");
    if (rangeCell >= 0 && !range) {
      const value = line.slice(rangeCell + 1).find((cell) => String(cell ?? "").trim());
      range = rangeLabel(value);
    }
  }
  if (headerIndex < 0) {
    return { draft: null, error: "The sheet needs a Name column and a Broker Gross column." };
  }

  const headers = (grid[headerIndex] ?? []).map((cell) => headerKey(cell));
  const nameIndex = headers.findIndex((key) => key === "name" || key === "agent" || key === "broker");
  const grossIndex = grossColumn(headers);
  const rows: { name: string; gross: number }[] = [];
  for (let index = headerIndex + 1; index < grid.length && rows.length < 400; index += 1) {
    const line = grid[index] ?? [];
    const agent = String(line[nameIndex] ?? "").trim().slice(0, 120);
    if (!agent || headerKey(agent) === "name") continue;
    const gross = numberOf(line[grossIndex]);
    if (gross == null || gross <= 0 || gross > 1e12) continue;
    rows.push({ name: agent, gross });
  }
  rows.sort((a, b) => b.gross - a.gross || a.name.localeCompare(b.name));
  if (!rows.length) return { draft: null, error: "No agents with a broker gross were found." };
  return { draft: { asOf, asOfLabel, rangeLabel: range, rows }, error: "" };
}
