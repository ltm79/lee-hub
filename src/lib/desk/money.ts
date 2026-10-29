import type { Answers } from "@/lib/desk/types";

export function num(value: string | undefined): number {
  if (!value) return Number.NaN;
  const n = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function money(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function groupNumber(value: string, decimals = 2): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  const whole = (dot >= 0 ? cleaned.slice(0, dot) : cleaned).replace(/^0+(?=\d)/, "");
  const frac = dot >= 0 ? cleaned.slice(dot + 1).replace(/\./g, "").slice(0, decimals) : undefined;
  const grouped = (whole || (frac !== undefined ? "0" : "")).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}

export function finishMoney(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const n = Number(trimmed.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? `$${money(n)}` : trimmed;
}

export function finishComma(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const n = Number(trimmed.replace(/[,\s]/g, ""));
  if (!Number.isFinite(n)) return trimmed;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function groupPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length < 3) return `(${digits}`;
  const area = digits.slice(0, 3);
  const rest = digits.slice(3);
  if (rest.length <= 3) return `(${area})${rest}`;
  return `(${area})${rest.slice(0, 3)}-${rest.slice(3)}`;
}

export function finishPercent(value: string): string {
  const trimmed = value.trim().replace(/%/g, "").trim();
  if (!trimmed) return "";
  const n = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(n)) return value.trim();
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export function dollars(value: number): string {
  const formatted = money(value);
  return formatted ? `$${formatted}` : "";
}

export type RentRow = {
  active: boolean;
  subtotal: number;
  commission: number;
};

export function leaseMath(answers: Answers): {
  rows: RentRow[];
  consideration: number;
  commission: number;
  any: boolean;
} {
  const rows: RentRow[] = [];
  for (let i = 1; i <= 10; i += 1) {
    const rent = num(answers[`row${i}Rent`]);
    const months = num(answers[`row${i}Months`]);
    const pct = num(answers[`row${i}Pct`]);
    const active = [answers[`row${i}From`], answers[`row${i}To`], answers[`row${i}Rent`], answers[`row${i}Months`], answers[`row${i}Pct`]].some(
      (value) => Boolean(value?.trim()),
    );
    const subtotal = rent * months;
    const commission = (subtotal * pct) / 100;
    rows.push({
      active,
      subtotal: active && Number.isFinite(subtotal) ? subtotal : Number.NaN,
      commission: active && Number.isFinite(subtotal) && Number.isFinite(pct) ? commission : Number.NaN,
    });
  }
  const consideration = rows.reduce((sum, row) => sum + (Number.isFinite(row.subtotal) ? row.subtotal : 0), 0);
  const commission = rows.reduce((sum, row) => sum + (Number.isFinite(row.commission) ? row.commission : 0), 0);
  return { rows, consideration, commission, any: rows.some((row) => row.active) };
}

export function splitNet(gross: string | undefined, pct: string | undefined): string {
  const base = num(gross);
  const rate = num(pct);
  if (!pct?.trim() || !Number.isFinite(base) || !Number.isFinite(rate)) return "";
  return money((base * rate) / 100);
}

export function splitPercentTotal(answers: Answers): number {
  let total = 0;
  let any = false;
  for (let i = 1; i <= 4; i += 1) {
    const rate = num(answers[`split${i}Pct`]);
    if (Number.isFinite(rate) && answers[`split${i}Pct`]?.trim()) {
      total += rate;
      any = true;
    }
  }
  return any ? total : Number.NaN;
}

export function saleCommission(answers: Answers): { line: number; base: number; ready: boolean } {
  const base = num(answers.saleBase || answers.price);
  const pct = num(answers.salePct);
  if (!Number.isFinite(base) || !Number.isFinite(pct)) {
    return { line: Number.NaN, base, ready: false };
  }
  return { line: (base * pct) / 100, base, ready: true };
}

export function pdfText(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x0A\x20-\x7E]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function wrapLines(value: string | undefined, count: number, width = 90): string[] {
  const clean = pdfText(value);
  if (!clean) return Array.from({ length: count }, () => "");
  const lines: string[] = [];
  for (const piece of clean.split(/\n/)) {
    let rest = piece.trim();
    if (!rest) {
      lines.push("");
      continue;
    }
    while (rest.length > width) {
      let cut = rest.lastIndexOf(" ", width);
      if (cut < 12) cut = width;
      lines.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    lines.push(rest);
  }
  return Array.from({ length: count }, (_, index) => lines[index] ?? "");
}

function parseDay(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function stamp(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${date.getFullYear()}`;
}

/** Whole months from a start date through an inclusive end date. */
export function termMonths(from: string, through: string): string {
  const start = parseDay(from);
  const end = parseDay(through);
  if (!start || !end || end < start) return "";
  const close = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  let months = (close.getFullYear() - start.getFullYear()) * 12 + (close.getMonth() - start.getMonth());
  if (close.getDate() < start.getDate()) months -= 1;
  const anchor = new Date(start.getFullYear(), start.getMonth() + months, start.getDate());
  const extra = Math.round((close.getTime() - anchor.getTime()) / 86_400_000);
  if (extra >= 15) months += 1;
  return months > 0 ? String(months) : "";
}

export function parseLeaseRange(value: string): { from: string; through: string; months: string } {
  const match = value
    .trim()
    .match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:–|—|-|to)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})$/i);
  if (!match) return { from: "", through: "", months: "" };
  const start = parseDay(match[1]);
  const end = parseDay(match[2]);
  if (!start || !end) return { from: "", through: "", months: "" };
  const from = stamp(start);
  const through = stamp(end);
  return { from, through, months: termMonths(from, through) };
}

