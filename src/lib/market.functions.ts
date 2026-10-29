import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { MarketField, MarketInput, MarketPoint } from "@/lib/market.types";
import { MARKET_FIELDS } from "@/lib/market.types";

async function getDb() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function flag(value: unknown) {
  return value === true || value === "t" || value === "true" || value === 1;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) > 1e15) return null;
  return amount;
}

type Gate =
  | { ok: false; error: string }
  | { ok: true; admin: boolean; db: Awaited<ReturnType<typeof getDb>> };

async function requireMember(userId: string): Promise<Gate> {
  const db = await getDb();
  const rows = await db<{ role: string; active: unknown }>`
    select role, active from members where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row || !flag(row.active)) return { ok: false, error: "This login cannot open Market Insight." };
  return { ok: true, admin: row.role === "admin", db };
}

const COLUMNS: Record<MarketField, string> = {
  inventorySf: "inventory_sf",
  vacancyRate: "vacancy_rate",
  availabilityRate: "availability_rate",
  askingRent: "asking_rent",
  directRent: "direct_rent",
  leasingSf: "leasing_sf",
  absorptionSf: "absorption_sf",
  underConstructionSf: "under_construction_sf",
  completionsSf: "completions_sf",
  salePricePsf: "sale_price_psf",
  capRate: "cap_rate",
  salesVolume: "sales_volume",
  salesSf: "sales_sf",
  transactions: "transactions",
  buildings: "buildings",
  vacantSf: "vacant_sf",
  subletSf: "sublet_sf",
  availableSf: "available_sf",
};

type Row = {
  id: string;
  market: string;
  submarket: string;
  city: string;
  year: number | string;
  quarter: number | string;
  notes: string;
  source: string;
} & Record<string, unknown>;

function mapPoint(row: Row): MarketPoint {
  const point = {
    id: row.id,
    market: row.market,
    submarket: row.submarket,
    city: row.city,
    year: Number(row.year),
    quarter: Number(row.quarter),
    notes: row.notes ?? "",
    source: row.source ?? "",
  } as MarketPoint;
  for (const [field, column] of Object.entries(COLUMNS) as [MarketField, string][]) {
    const value = row[column];
    point[field] = value == null || value === "" ? null : Number(value);
  }
  return point;
}

function cleanInput(data: MarketInput | undefined): { ok: true; value: MarketInput } | { ok: false; error: string } {
  const market = clip(text(data?.market), 80);
  const year = Math.round(Number(data?.year));
  const quarter = Math.round(Number(data?.quarter));
  if (!market) return { ok: false, error: "Name the market." };
  if (year < 1990 || year > 2100 || quarter < 1 || quarter > 4) {
    return { ok: false, error: "Use a year and a quarter from 1 to 4." };
  }
  const value = {
    id: clip(text(data?.id), 80),
    market,
    submarket: clip(text(data?.submarket), 80),
    city: clip(text(data?.city), 80),
    year,
    quarter,
    notes: clip(text(data?.notes), 500),
    source: clip(text(data?.source), 40) || "manual",
  } as MarketInput;
  for (const [field] of MARKET_FIELDS) {
    const amount = optionalNumber(data?.[field]);
    value[field] = field === "transactions" || field === "buildings" ? (amount == null ? null : Math.round(amount)) : amount;
  }
  return { ok: true, value };
}

export const listMarket = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; rows: MarketPoint[] } | { ok: false; error: string }> => {
    const gate = await requireMember(context.userId);
    if (!gate.ok) return gate;
    const rows = await gate.db<Row>`
      select * from market_points
      order by year desc, quarter desc, market, submarket, city
    `;
    return { ok: true, rows: rows.map(mapPoint) };
  });

export const saveMarketPoint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: MarketInput) => data)
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const gate = await requireMember(context.userId);
    if (!gate.ok) return gate;
    if (!gate.admin) return { ok: false, error: "An administrator has to change market figures." };
    const cleaned = cleanInput(data);
    if (!cleaned.ok) return cleaned;
    const point = cleaned.value;
    const taken = await gate.db<{ id: string }>`
      select id from market_points
      where market = ${point.market} and submarket = ${point.submarket} and city = ${point.city}
        and year = ${point.year} and quarter = ${point.quarter}
        and id <> ${point.id || ""}
    `;
    if (taken[0]) return { ok: false, error: "That market, place, and quarter already exists." };
    const id = point.id || crypto.randomUUID();
    await gate.db`
      insert into market_points (
        id, market, submarket, city, year, quarter,
        inventory_sf, vacancy_rate, availability_rate, asking_rent, direct_rent,
        leasing_sf, absorption_sf, under_construction_sf, completions_sf,
        sale_price_psf, cap_rate, sales_volume, sales_sf, transactions, buildings,
        vacant_sf, sublet_sf, available_sf, notes, source, updated_at
      ) values (
        ${id}, ${point.market}, ${point.submarket}, ${point.city}, ${point.year}, ${point.quarter},
        ${point.inventorySf}, ${point.vacancyRate}, ${point.availabilityRate}, ${point.askingRent}, ${point.directRent},
        ${point.leasingSf}, ${point.absorptionSf}, ${point.underConstructionSf}, ${point.completionsSf},
        ${point.salePricePsf}, ${point.capRate}, ${point.salesVolume}, ${point.salesSf}, ${point.transactions}, ${point.buildings},
        ${point.vacantSf}, ${point.subletSf}, ${point.availableSf}, ${point.notes}, ${point.source || "manual"}, now()
      )
      on conflict (id) do update set
        market = excluded.market,
        submarket = excluded.submarket,
        city = excluded.city,
        year = excluded.year,
        quarter = excluded.quarter,
        inventory_sf = excluded.inventory_sf,
        vacancy_rate = excluded.vacancy_rate,
        availability_rate = excluded.availability_rate,
        asking_rent = excluded.asking_rent,
        direct_rent = excluded.direct_rent,
        leasing_sf = excluded.leasing_sf,
        absorption_sf = excluded.absorption_sf,
        under_construction_sf = excluded.under_construction_sf,
        completions_sf = excluded.completions_sf,
        sale_price_psf = excluded.sale_price_psf,
        cap_rate = excluded.cap_rate,
        sales_volume = excluded.sales_volume,
        sales_sf = excluded.sales_sf,
        transactions = excluded.transactions,
        buildings = excluded.buildings,
        vacant_sf = excluded.vacant_sf,
        sublet_sf = excluded.sublet_sf,
        available_sf = excluded.available_sf,
        notes = excluded.notes,
        source = excluded.source,
        updated_at = now()
    `;
    return { ok: true };
  });

export const importMarketPoints = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { rows?: MarketInput[] }) => data)
  .handler(async ({ context, data }): Promise<{ ok: true; saved: number } | { ok: false; error: string }> => {
    const gate = await requireMember(context.userId);
    if (!gate.ok) return gate;
    if (!gate.admin) return { ok: false, error: "An administrator has to import market figures." };
    const incoming = Array.isArray(data?.rows) ? data.rows.slice(0, 2000) : [];
    if (!incoming.length) return { ok: false, error: "Nothing to import." };
    let saved = 0;
    for (const row of incoming) {
      const cleaned = cleanInput({ ...row, source: "excel" });
      if (!cleaned.ok) continue;
      const point = cleaned.value;
      await gate.db`
        insert into market_points (
          id, market, submarket, city, year, quarter,
          inventory_sf, vacancy_rate, availability_rate, asking_rent, direct_rent,
          leasing_sf, absorption_sf, under_construction_sf, completions_sf,
          sale_price_psf, cap_rate, sales_volume, sales_sf, transactions, buildings,
          vacant_sf, sublet_sf, available_sf, notes, source, updated_at
        ) values (
          ${crypto.randomUUID()}, ${point.market}, ${point.submarket}, ${point.city}, ${point.year}, ${point.quarter},
          ${point.inventorySf}, ${point.vacancyRate}, ${point.availabilityRate}, ${point.askingRent}, ${point.directRent},
          ${point.leasingSf}, ${point.absorptionSf}, ${point.underConstructionSf}, ${point.completionsSf},
          ${point.salePricePsf}, ${point.capRate}, ${point.salesVolume}, ${point.salesSf}, ${point.transactions}, ${point.buildings},
          ${point.vacantSf}, ${point.subletSf}, ${point.availableSf}, ${point.notes}, 'excel', now()
        )
        on conflict (market, submarket, city, year, quarter) do update set
          inventory_sf = excluded.inventory_sf,
          vacancy_rate = excluded.vacancy_rate,
          availability_rate = excluded.availability_rate,
          asking_rent = excluded.asking_rent,
          direct_rent = excluded.direct_rent,
          leasing_sf = excluded.leasing_sf,
          absorption_sf = excluded.absorption_sf,
          under_construction_sf = excluded.under_construction_sf,
          completions_sf = excluded.completions_sf,
          sale_price_psf = excluded.sale_price_psf,
          cap_rate = excluded.cap_rate,
          sales_volume = excluded.sales_volume,
          sales_sf = excluded.sales_sf,
          transactions = excluded.transactions,
          buildings = excluded.buildings,
          vacant_sf = excluded.vacant_sf,
          sublet_sf = excluded.sublet_sf,
          available_sf = excluded.available_sf,
          notes = excluded.notes,
          source = 'excel',
          updated_at = now()
      `;
      saved += 1;
    }
    if (!saved) return { ok: false, error: "None of those rows had a market, year, and quarter." };
    return { ok: true, saved };
  });

export const deleteMarketPoint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: string }) => data)
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const gate = await requireMember(context.userId);
    if (!gate.ok) return gate;
    if (!gate.admin) return { ok: false, error: "An administrator has to delete market figures." };
    const id = clip(text(data?.id), 80);
    if (!id) return { ok: false, error: "Missing row." };
    await gate.db`delete from market_points where id = ${id}`;
    return { ok: true };
  });
