import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

const BASE = "https://leeindustry.dealius.com";
const PAGE = 50;
const DEAL_CAP = 800;

export type BoardDeal = {
  dealId: number;
  name: string;
  closed: string;
  gross: number;
  split: number;
};

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
  split: number;
  lines: BoardDeal[];
};

export type BoardOffice = { id: number; name: string };

export type Leaderboard =
  | {
      ok: true;
      from: string;
      to: string;
      capped: boolean;
      partial: boolean;
      note: string;
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
  sawPaidDate: boolean;
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
    split: 0,
    lines: [],
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
    note: "",
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

function yearsBefore(iso: string, years: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${Number(match[1]) - years}-${match[2]}-${match[3]}`;
}

function isPaidDateKey(key: string): boolean {
  const name = key.toLowerCase().replace(/[^a-z]/g, "");
  if (name.includes("estimate")) return false;
  if (name.includes("invoice") && name.includes("paid")) return true;
  return name === "invoicepaiddate" || name === "paiddate" || name === "datepaid" || name === "paymentdate";
}

function invoicePaidDays(value: unknown, depth = 0): string[] {
  if (!value || typeof value !== "object" || depth > 5) return [];
  if (Array.isArray(value)) return value.flatMap((item) => invoicePaidDays(item, depth + 1));
  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isPaidDateKey(key)) {
      const day = calendarDay(child);
      if (day) found.push(day);
    } else if (child && typeof child === "object") {
      found.push(...invoicePaidDays(child, depth + 1));
    }
  }
  return found;
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
    const jobKey = `v5|${data.from}|${data.to}`;
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
      query.set("DateFrom", day(yearsBefore(data.from, 6), false));
      query.set("DateTo", to);
      const deals = await everyPage(`/api/deals?${query.toString()}`, key, DEAL_CAP);
      const capped = deals.length >= DEAL_CAP;
      const seen = new Set<number>();
      const closedDeals = deals.filter((deal) => {
        const id = num(deal.DealID ?? deal.dealID);
        if (!id || seen.has(id)) return false;
        const status = text(deal.DealStatusName);
        if (status && !closedStatus(status)) return false;
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
        sawPaidDate: false,
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
              let paidDays = invoicePaidDays(record);
              if (paidDays.length === 0) {
                const payments = await dealiusGet(`/api/deals/payments?dealId=${id}`, key);
                paidDays = invoicePaidDays(payments);
              }
              if (paidDays.length > 0) job.sawPaidDate = true;
              const paidDay = paidDays.filter((day) => day >= data.from && day <= data.to).sort().at(-1);
              if (!paidDay) return;
              const people = (Array.isArray(record.InternalBrokers) ? record.InternalBrokers : []).filter(
                (person): person is Record<string, unknown> => Boolean(person) && typeof person === "object",
              );
              const shares = people
                .map((broker) => ({ broker, contactId: num(broker.ContactID), gross: num(broker.CommissionGrossAmount) }))
                .filter((share) => share.contactId > 0);
              const counted = new Set<number>();
              for (const share of shares) {
                if (counted.has(share.contactId)) continue;
                counted.add(share.contactId);
                const split = num(share.broker.CommissionSplitAmount);
                const row = ensure(job, share.contactId, text(share.broker.FirstName), text(share.broker.LastName));
                row.deals += 1;
                row.gross += share.gross;
                row.split += split;
                row.lines.push({
                  dealId: id,
                  name: text(record.DealName) || `Deal ${id}`,
                  closed: paidDay,
                  gross: share.gross,
                  split,
                });
              }
            } catch {
              job.missed += 1;
            }
          }),
        );
      }
      const result = boardOf(job);
      if (result.ok && !result.partial && !job.sawPaidDate) {
        result.note = "Dealius did not return an invoice paid date on these deals.";
      }
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

export type ClosedDeal = {
  id: number;
  address: string;
  squareFeet: number;
  dealType: string;
  closed: string;
  paid: string;
  commission: number;
};

export type MyDeals =
  | { ok: true; from: string; to: string; partial: boolean; note: string; rows: ClosedDeal[] }
  | { ok: false; error: string };

type MineJob = {
  at: number;
  busy: boolean;
  deals: Record<string, unknown>[];
  cursor: number;
  rows: ClosedDeal[];
  sizes: Map<number, number>;
  sawPaid: boolean;
  brokerIds: number[];
};

const mineJobs = new Map<string, MineJob>();

function squareFeetOf(record: Record<string, unknown>): number {
  for (const key of ["SquareFeet", "SquareFootage", "LeasedSquareFeet", "SizeSf", "LeaseCurrentSquareFeetOccupied"]) {
    const size = num(record[key]);
    if (size > 0) return size;
  }
  return 0;
}

export const dealiusMyDeals = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { from?: string; to?: string }) => ({
    from: typeof data?.from === "string" ? data.from.slice(0, 10) : "",
    to: typeof data?.to === "string" ? data.to.slice(0, 10) : "",
  }))
  .handler(async ({ data, context }): Promise<MyDeals> => {
    const key = process.env.DEALIUS_API_KEY?.trim();
    if (!key) return { ok: false, error: "Dealius is not connected yet. Add DEALIUS_API_KEY in Vercel." };
    const from = day(data.from, false);
    const to = day(data.to, true);
    if (!from || !to) return { ok: false, error: "Choose a start and end date." };
    const db = await getSql();
    const users = await db<{ email: string }>`select email from "user" where id = ${context.userId} limit 1`;
    const email = text(users[0]?.email).toLowerCase();
    if (!email) return { ok: false, error: "This login has no email to match in Dealius." };
    const jobKey = `mine|${email}|${data.from}|${data.to}`;
    try {
      let job = mineJobs.get(jobKey);
      if (job && Date.now() - job.at > 10 * 60 * 1000) {
        mineJobs.delete(jobKey);
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
        const brokers = await everyPage("/api/brokers", key, 500);
        const brokerIds = brokers
          .filter((broker) => text(broker.Email).toLowerCase() === email)
          .map((broker) => num(broker.ContactID))
          .filter((id) => id > 0);
        if (brokerIds.length === 0) {
          return {
            ok: true,
            from: data.from,
            to: data.to,
            partial: false,
            note: `No Dealius broker uses ${email}.`,
            rows: [],
          };
        }
        const query = new URLSearchParams();
        query.set("DealRelevance", String(closedId));
        query.set("DateFrom", from);
        query.set("DateTo", to);
        query.set("DealMembersEmails", email);
        const deals = await everyPage(`/api/deals?${query.toString()}`, key, 300);
        const seen = new Set<number>();
        job = {
          at: Date.now(),
          busy: false,
          deals: deals.filter((deal) => {
            const id = num(deal.DealID ?? deal.dealID);
            if (!id || seen.has(id)) return false;
            const status = text(deal.DealStatusName);
            if (status && !closedStatus(status)) return false;
            seen.add(id);
            return true;
          }),
          cursor: 0,
          rows: [],
          sizes: new Map(),
          sawPaid: false,
          brokerIds,
        };
        mineJobs.set(jobKey, job);
      }
      if (job.busy) {
        return {
          ok: true,
          from: data.from,
          to: data.to,
          partial: job.cursor < job.deals.length,
          note: "",
          rows: job.rows,
        };
      }
      job.busy = true;
      job.at = Date.now();
      try {
        const deadline = Date.now() + 7000;
        while (job.cursor < job.deals.length && Date.now() < deadline) {
          const batch = job.deals.slice(job.cursor, job.cursor + 6);
          job.cursor += batch.length;
          await Promise.all(
            batch.map(async (deal) => {
              const id = num(deal.DealID ?? deal.dealID);
              if (!id) return;
              try {
                const detail = await dealiusGet(`/api/deals/${id}`, key);
                const record = detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {};
                if (!closedStatus(record.DealStatusName) && !closedStatus(deal.DealStatusName)) return;
                const closedDay = calendarDay(record.ActualCloseDate) || calendarDay(deal.ActualCloseDate);
                if (!closedDay || closedDay < data.from || closedDay > data.to) return;
                const people = (Array.isArray(record.InternalBrokers) ? record.InternalBrokers : []).filter(
                  (person): person is Record<string, unknown> => Boolean(person) && typeof person === "object",
                );
                const mine = people.find(
                  (person) => job.brokerIds.includes(num(person.ContactID)) || text(person.Email).toLowerCase() === email,
                );
                if (!mine) return;
                const paid = invoicePaidDays(record)
                  .filter((paidDay) => paidDay >= data.from && paidDay <= data.to)
                  .sort()
                  .at(-1) ?? "";
                if (paid) job.sawPaid = true;
                let squareFeet = squareFeetOf(record);
                const propertyId = num(record.PropertyID ?? deal.PropertyID);
                if (!squareFeet && propertyId) {
                  if (!job.sizes.has(propertyId)) {
                    try {
                      const property = await dealiusGet(`/api/properties/${propertyId}`, key);
                      const info = property && typeof property === "object" ? (property as Record<string, unknown>) : {};
                      job.sizes.set(propertyId, num(info.SquareFootage) || num(info.BuildingSizeSf));
                    } catch {
                      job.sizes.set(propertyId, 0);
                    }
                  }
                  squareFeet = job.sizes.get(propertyId) ?? 0;
                }
                job.rows.push({
                  id,
                  address: text(deal.PropertyAddress) || text(record.DealName) || `Deal ${id}`,
                  squareFeet,
                  dealType: text(deal.DealTypeText) || text(record.DealTypeName) || text(record.DealTypeText),
                  closed: closedDay,
                  paid,
                  commission: num(mine.CommissionGrossAmount),
                });
              } catch {
                return;
              }
            }),
          );
        }
      } finally {
        job.busy = false;
      }
      const rows = [...job.rows].sort((a, b) => b.closed.localeCompare(a.closed) || a.address.localeCompare(b.address));
      const partial = job.cursor < job.deals.length;
      if (!partial) mineJobs.delete(jobKey);
      return {
        ok: true,
        from: data.from,
        to: data.to,
        partial,
        note: job.sawPaid
          ? ""
          : "Dealius does not send the invoice paid date. These are closed deals, the date is the close date, and commission is your broker gross on the whole deal.",
        rows,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dealius could not be reached.";
      return { ok: false, error: message };
    }
  });
