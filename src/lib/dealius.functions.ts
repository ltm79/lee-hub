import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

const BASE = "https://leeindustry.dealius.com";
const PAGE = 50;
const DEAL_CAP = 800;

export type BoardRow = {
  id: number;
  name: string;
  title: string;
  officeId: number;
  officeName: string;
  photo: string;
  deals: number;
  volume: number;
  gross: number;
};

export type BoardOffice = { id: number; name: string };

export type Leaderboard =
  | {
      ok: true;
      from: string;
      to: string;
      capped: boolean;
      partial: boolean;
      offices: BoardOffice[];
      rows: BoardRow[];
    }
  | { ok: false; error: string };

type CacheSlot = { at: number; data: Leaderboard };
const cache = new Map<string, CacheSlot>();

type BoardJob = {
  at: number;
  busy: boolean;
  from: string;
  to: string;
  deals: Record<string, unknown>[];
  cursor: number;
  totals: Map<number, BoardRow>;
  brokerById: Map<number, Record<string, unknown>>;
  offices: BoardOffice[];
  capped: boolean;
  missed: number;
};
const jobs = new Map<string, BoardJob>();

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rowsOf(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { Data?: unknown; data?: unknown }).Data ?? (payload as { data?: unknown }).data;
  return Array.isArray(data) ? (data.filter((item) => item && typeof item === "object") as Record<string, unknown>[]) : [];
}

function pagesOf(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 1;
  const total = num((payload as { PagesTotal?: unknown }).PagesTotal);
  return total > 0 ? total : 1;
}

function photoOf(value: string): string {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return `${BASE}${value}`;
  return value;
}

async function dealiusGet(path: string, key: string): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `ApiKey ${key}`, Accept: "application/json" },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Dealius did not accept the API key.");
  }
  if (!response.ok) throw new Error("Dealius did not return the leaderboard.");
  return response.json();
}

async function everyPage(path: string, key: string, cap: number): Promise<Record<string, unknown>[]> {
  const first = await dealiusGet(`${path}${path.includes("?") ? "&" : "?"}Page=1&PageSize=${PAGE}`, key);
  const pages = Math.min(pagesOf(first), Math.ceil(cap / PAGE));
  const all = rowsOf(first);
  for (let page = 2; page <= pages && all.length < cap; page += 1) {
    const next = await dealiusGet(`${path}${path.includes("?") ? "&" : "?"}Page=${page}&PageSize=${PAGE}`, key);
    all.push(...rowsOf(next));
  }
  return all.slice(0, cap);
}

async function pool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await run(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

function ensure(job: BoardJob, id: number, first: string, last: string): BoardRow {
  const existing = job.totals.get(id);
  if (existing) return existing;
  const broker = job.brokerById.get(id);
  const name = text(broker?.FullName) || [first, last].filter(Boolean).join(" ") || "Broker";
  const row: BoardRow = {
    id,
    name,
    title: text(broker?.Title),
    officeId: num(broker?.OfficeID),
    officeName: text(broker?.OfficeName),
    photo: photoOf(text(broker?.ThumbnailUrl)),
    deals: 0,
    volume: 0,
    gross: 0,
  };
  job.totals.set(id, row);
  return row;
}

function boardOf(job: BoardJob): Leaderboard {
  return {
    ok: true,
    from: job.from,
    to: job.to,
    capped: job.capped || job.missed > 0,
    partial: job.cursor < job.deals.length,
    offices: job.offices,
    rows: [...job.totals.values()].sort((a, b) => b.gross - a.gross || a.name.localeCompare(b.name)),
  };
}

function calendarDay(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function closedStatus(value: unknown): boolean {
  return text(value).toLowerCase() === "closed";
}

function day(value: string, end: boolean): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}T${end ? "23:59:59" : "00:00:00"}Z`;
}

export const dealiusLeaderboard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { from?: string; to?: string }) => ({
    from: typeof data?.from === "string" ? data.from.slice(0, 10) : "",
    to: typeof data?.to === "string" ? data.to.slice(0, 10) : "",
  }))
  .handler(async ({ data }): Promise<Leaderboard> => {
    const key = process.env.DEALIUS_API_KEY?.trim();
    if (!key) return { ok: false, error: "Dealius is not connected yet. Add DEALIUS_API_KEY in Vercel." };
    const from = day(data.from, false);
    const to = day(data.to, true);
    if (!from || !to) return { ok: false, error: "Choose a start and end date." };
    const jobKey = `v3|${data.from}|${data.to}`;
    const cached = cache.get(jobKey);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;

    try {
      let job = jobs.get(jobKey);
      if (job && Date.now() - job.at > 10 * 60 * 1000) {
        jobs.delete(jobKey);
        job = undefined;
      }
      if (!job) {
      const relevance = rowsOf(await dealiusGet("/api/lookup/dealrelevancetypes", key));
      const closed =
        relevance.find((item) => text(item.Text ?? item.text).toLowerCase() === "closed") ??
        relevance.find((item) => {
          const name = text(item.Text ?? item.text).toLowerCase();
          return name.includes("closed") && !name.includes("pending") && !name.includes("dead");
        });
      const closedId = num(closed?.ID ?? closed?.Id ?? closed?.id);
      if (!closedId) return { ok: false, error: "Dealius did not return a Closed deal list." };
      const offices = rowsOf(await dealiusGet("/api/lookup/offices", key))
        .map((item) => ({ id: num(item.ID ?? item.Id ?? item.id), name: text(item.Text ?? item.text) }))
        .filter((item) => item.id && item.name);
      const brokers = await everyPage("/api/brokers", key, 500);
      const brokerById = new Map<number, Record<string, unknown>>();
      for (const broker of brokers) {
        const id = num(broker.ContactID ?? broker.contactID);
        if (id) brokerById.set(id, broker);
      }
      const query = new URLSearchParams();
      if (closedId) query.set("DealRelevance", String(closedId));
      query.set("DateFrom", from);
      query.set("DateTo", to);
      const deals = await everyPage(`/api/deals?${query.toString()}`, key, DEAL_CAP);
      const capped = deals.length >= DEAL_CAP;
      const seen = new Set<number>();
      const closedDeals = deals.filter((deal) => {
        const id = num(deal.DealID ?? deal.dealID);
        if (!id || seen.has(id)) return false;
        const status = text(deal.DealStatusName);
        if (status && !closedStatus(status)) return false;
        const closedDay = calendarDay(deal.ActualCloseDate);
        if (!closedDay || closedDay < data.from || closedDay > data.to) return false;
        seen.add(id);
        return true;
      });
      job = {
        at: Date.now(),
        busy: false,
        from: data.from,
        to: data.to,
        deals: closedDeals,
        cursor: 0,
        totals: new Map(),
        brokerById,
        offices,
        capped,
        missed: 0,
      };
      jobs.set(jobKey, job);
    }

    if (job.busy) return boardOf(job);
    job.busy = true;
    job.at = Date.now();
    try {
      const deadline = Date.now() + 7000;
      while (job.cursor < job.deals.length && Date.now() < deadline) {
        const batch = job.deals.slice(job.cursor, job.cursor + 8);
        job.cursor += batch.length;
        await Promise.all(
          batch.map(async (deal) => {
            const id = num(deal.DealID ?? deal.dealID);
            if (!id) return;
            try {
              const detail = await dealiusGet(`/api/deals/${id}`, key);
              const record = detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {};
              if (!closedStatus(record.DealStatusName)) return;
              const closedDay = calendarDay(record.ActualCloseDate) || calendarDay(deal.ActualCloseDate);
              if (!closedDay || closedDay < data.from || closedDay > data.to) return;
              const people = (Array.isArray(record.InternalBrokers) ? record.InternalBrokers : []).filter(
                (person): person is Record<string, unknown> => Boolean(person) && typeof person === "object",
              );
              const shares = people
                .map((broker) => ({ broker, contactId: num(broker.ContactID), gross: num(broker.CommissionGrossAmount) }))
                .filter((share) => share.contactId > 0);
              const stated = shares.reduce((sum, share) => sum + share.gross, 0);
              const dealGross = num(record.InternalBrokersGrossCommissionAmount);
              const overweight = dealGross > 0 && stated > dealGross * 1.01;
              const weight = shares.reduce((sum, share) => sum + num(share.broker.CommissionValue), 0);
              const counted = new Set<number>();
              for (const share of shares) {
                if (counted.has(share.contactId)) continue;
                counted.add(share.contactId);
                const portion = overweight
                  ? (dealGross * (weight > 0 ? num(share.broker.CommissionValue) / weight : 1 / shares.length))
                  : share.gross;
                const row = ensure(job, share.contactId, text(share.broker.FirstName), text(share.broker.LastName));
                row.deals += 1;
                row.gross += portion;
              }
            } catch {
              job.missed += 1;
            }
          }),
        );
      }
      const result = boardOf(job);
      if (result.ok && !result.partial && job.missed === 0) {
        cache.set(jobKey, { at: Date.now(), data: result });
        jobs.delete(jobKey);
      }
      return result;
    } finally {
      job.busy = false;
    }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dealius could not be reached.";
      return { ok: false, error: message };
    }
  });
