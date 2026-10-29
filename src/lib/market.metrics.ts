import type { MarketField, MarketPoint } from "@/lib/market.types";

export function periodKey(year: number, quarter: number) {
  return year * 10 + quarter;
}

export function periodLabel(year: number, quarter: number) {
  return `Q${quarter} ${year}`;
}

export function quarterName(quarter: number) {
  return ["", "1st", "2nd", "3rd", "4th"][quarter] ?? `${quarter}`;
}

export function priorPeriod(year: number, quarter: number, back: number) {
  const index = year * 4 + (quarter - 1) - back;
  const quarterIndex = ((index % 4) + 4) % 4;
  return { year: Math.floor(index / 4), quarter: quarterIndex + 1 };
}

function sumOf(rows: MarketPoint[], key: MarketField): number | null {
  let total = 0;
  let any = false;
  for (const row of rows) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
      any = true;
    }
  }
  return any ? total : null;
}

function weighted(rows: MarketPoint[], rate: MarketField, weight: MarketField): number | null {
  let weightedTotal = 0;
  let weightTotal = 0;
  for (const row of rows) {
    const value = row[rate];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const basis = row[weight];
    const share = typeof basis === "number" && basis > 0 ? basis : 1;
    weightedTotal += value * share;
    weightTotal += share;
  }
  return weightTotal ? weightedTotal / weightTotal : null;
}

export function combine(rows: MarketPoint[], market: string, submarket: string, city: string, year: number, quarter: number): MarketPoint {
  const point: MarketPoint = {
    id: "",
    market,
    submarket,
    city,
    year,
    quarter,
    inventorySf: sumOf(rows, "inventorySf"),
    vacancyRate: weighted(rows, "vacancyRate", "inventorySf"),
    availabilityRate: weighted(rows, "availabilityRate", "inventorySf"),
    askingRent: weighted(rows, "askingRent", "inventorySf"),
    directRent: weighted(rows, "directRent", "inventorySf"),
    leasingSf: sumOf(rows, "leasingSf"),
    absorptionSf: sumOf(rows, "absorptionSf"),
    underConstructionSf: sumOf(rows, "underConstructionSf"),
    completionsSf: sumOf(rows, "completionsSf"),
    salePricePsf: weighted(rows, "salePricePsf", "salesSf"),
    capRate: weighted(rows, "capRate", "salesVolume"),
    salesVolume: sumOf(rows, "salesVolume"),
    salesSf: sumOf(rows, "salesSf"),
    transactions: sumOf(rows, "transactions"),
    buildings: sumOf(rows, "buildings"),
    vacantSf: sumOf(rows, "vacantSf"),
    subletSf: sumOf(rows, "subletSf"),
    availableSf: sumOf(rows, "availableSf"),
    notes: "",
    source: "rollup",
  };
  if (point.vacancyRate == null && point.vacantSf != null && point.inventorySf) {
    point.vacancyRate = (point.vacantSf / point.inventorySf) * 100;
  }
  if (point.availabilityRate == null && point.availableSf != null && point.inventorySf) {
    point.availabilityRate = (point.availableSf / point.inventorySf) * 100;
  }
  return point;
}

function childrenOf(rows: MarketPoint[], market: string, submarket: string, year: number, quarter: number) {
  const period = rows.filter((row) => row.market === market && row.year === year && row.quarter === quarter);
  if (submarket) return period.filter((row) => row.submarket === submarket && row.city);
  const cities = period.filter((row) => row.city);
  if (cities.length) return cities;
  return period.filter((row) => row.submarket && !row.city);
}

export function resolveSeries(rows: MarketPoint[], market: string, submarket: string, city: string) {
  const scoped = rows.filter((row) => row.market === market);
  const keys = new Set<number>();
  for (const row of scoped) {
    if (city && (row.submarket !== submarket || row.city !== city)) continue;
    if (!city && submarket && row.submarket !== submarket) continue;
    keys.add(periodKey(row.year, row.quarter));
  }
  const points: MarketPoint[] = [];
  let rolled = false;
  for (const key of [...keys].sort((a, b) => a - b)) {
    const year = Math.floor(key / 10);
    const quarter = key % 10;
    const exact = scoped.find(
      (row) => row.year === year && row.quarter === quarter && row.submarket === submarket && row.city === city,
    );
    if (exact) {
      points.push(exact);
      continue;
    }
    const kids = childrenOf(scoped, market, submarket, year, quarter);
    if (!kids.length) continue;
    rolled = true;
    points.push(combine(kids, market, submarket, city, year, quarter));
  }
  return { points, rolled };
}

export function findPoint(points: MarketPoint[], year: number, quarter: number) {
  return points.find((point) => point.year === year && point.quarter === quarter) ?? null;
}

export function change(current: number | null, prior: number | null) {
  if (current == null || prior == null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export function placesFor(rows: MarketPoint[], market: string, submarket: string, year: number, quarter: number) {
  const period = rows.filter((row) => row.market === market && row.year === year && row.quarter === quarter);
  const list = submarket
    ? period.filter((row) => row.submarket === submarket && row.city)
    : period.filter((row) => row.submarket && !row.city);
  const cities = list.length || submarket ? list : period.filter((row) => row.city);
  return [...cities].sort((a, b) => (b.inventorySf ?? 0) - (a.inventorySf ?? 0));
}

export function placeName(point: MarketPoint) {
  return point.city || point.submarket || point.market;
}

export function compactSf(value: number | null) {
  if (value == null) return "—";
  const sign = value < 0 ? "-" : "";
  const size = Math.abs(value);
  if (size >= 1_000_000) {
    const millions = size / 1_000_000;
    const digits = millions >= 100 ? 0 : 1;
    return `${sign}${millions.toFixed(digits)}M SF`;
  }
  if (size >= 1_000) return `${sign}${Math.round(size / 1_000)}K SF`;
  return `${sign}${Math.round(size)} SF`;
}

export function fullSf(value: number | null) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} SF`;
}

export function percent(value: number | null, digits = 1) {
  if (value == null) return "—";
  return `${value.toFixed(digits)}%`;
}

export function rent(value: number | null) {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

export function price(value: number | null) {
  if (value == null) return "—";
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: value >= 20 ? 0 : 2 }).format(value)}`;
}

export function dollars(value: number | null) {
  if (value == null) return "—";
  const sign = value < 0 ? "-" : "";
  const size = Math.abs(value);
  if (size >= 1_000_000_000) return `${sign}$${(size / 1_000_000_000).toFixed(1)}B`;
  if (size >= 1_000_000) return `${sign}$${(size / 1_000_000).toFixed(1)}M`;
  if (size >= 1_000) return `${sign}$${Math.round(size / 1_000)}K`;
  return `${sign}$${Math.round(size)}`;
}

export function deltaText(value: number | null) {
  if (value == null) return "";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const UP_IS_GOOD = new Set<MarketField>([
  "askingRent",
  "directRent",
  "leasingSf",
  "absorptionSf",
  "salesVolume",
  "salesSf",
  "salePricePsf",
  "transactions",
]);

export function deltaTone(field: MarketField, value: number | null) {
  if (value == null || Math.abs(value) < 0.05) return "text-muted";
  const good = UP_IS_GOOD.has(field) ? value > 0 : value < 0;
  return good ? "text-teal" : "text-deep";
}
