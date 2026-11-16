import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

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

const REQUEST_KINDS = ["ooo", "late", "conference"] as const;
const OFFICE_KINDS = ["holiday", "meeting"] as const;
type Kind = (typeof REQUEST_KINDS)[number] | (typeof OFFICE_KINDS)[number];

function kindOf(value: unknown, office = false): Kind | null {
  const kind = text(value);
  if (office) return (OFFICE_KINDS as readonly string[]).includes(kind) ? (kind as Kind) : null;
  return (REQUEST_KINDS as readonly string[]).includes(kind) ? (kind as Kind) : null;
}

function dayOf(value: unknown) {
  const day = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function spanDays(start: string, end: string) {
  const from = Date.parse(`${start}T00:00:00`);
  const to = Date.parse(`${end}T00:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return -1;
  return Math.round((to - from) / 86_400_000);
}

export type CalendarEvent = {
  id: string;
  kind: string;
  title: string;
  note: string;
  personName: string;
  userId: string;
  start: string;
  end: string;
  status: string;
  reviewerName: string;
  reviewNote: string;
  createdAt: string;
  reviewedAt: string;
};

type Row = {
  id: string;
  kind: string;
  title: string;
  note: string;
  person_name: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status: string;
  reviewer_name: string;
  review_note: string;
  created_at: unknown;
  reviewed_at: unknown;
};

function stamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return text(value);
}

function mapEvent(row: Row): CalendarEvent {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    note: row.note ?? "",
    personName: row.person_name ?? "",
    userId: row.user_id ?? "",
    start: String(row.start_date).slice(0, 10),
    end: String(row.end_date).slice(0, 10),
    status: row.status,
    reviewerName: row.reviewer_name ?? "",
    reviewNote: row.review_note ?? "",
    createdAt: stamp(row.created_at),
    reviewedAt: stamp(row.reviewed_at),
  };
}

async function memberOf(userId: string) {
  const db = await getDb();
  const rows = await db<{ role: string; active: unknown; operations: unknown; name: string; email: string }>`
    select m.role, m.active, m.operations, u.name, u.email
    from members m
    join "user" u on u.id = m.user_id
    where m.user_id = ${userId}
  `;
  const row = rows[0];
  if (!row || !flag(row.active)) return null;
  const role = row.role === "admin" || row.role === "staff" || row.role === "assistant" ? row.role : "agent";
  return {
    db,
    role,
    name: row.name,
    email: row.email,
    canRequest: role === "staff" || role === "admin",
    canReview: role === "admin" || (role === "staff" && flag(row.operations)),
  };
}

async function mail(fromEmail: string, fromName: string, to: string[], subject: string, body: string) {
  const key = process.env.SMTP2GO_API_KEY?.trim();
  const from = fromEmail ? (fromName ? `${fromName} <${fromEmail}>` : fromEmail) : "";
  if (!key || !from || to.length === 0) return false;
  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      "X-Smtp2go-Api-Key": key,
    },
    body: JSON.stringify({
      sender: from,
      to,
      subject,
      text_body: body,
      custom_headers: [{ header: "Reply-To", value: fromEmail }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  return response.ok;
}

async function reviewers(db: Awaited<ReturnType<typeof getDb>>, exceptId: string) {
  const oms = await db<{ email: string }>`
    select u.email
    from members m
    join "user" u on u.id = m.user_id
    where m.active = true and m.role = 'staff' and m.operations = true and m.user_id <> ${exceptId} and u.email <> ''
  `;
  const emails = oms.map((row) => row.email.trim()).filter(Boolean);
  if (emails.length > 0) return [...new Set(emails)];
  const admins = await db<{ email: string }>`
    select u.email
    from members m
    join "user" u on u.id = m.user_id
    where m.active = true and m.role = 'admin' and m.user_id <> ${exceptId} and u.email <> ''
  `;
  return [...new Set(admins.map((row) => row.email.trim()).filter(Boolean))];
}

export const loadCalendar = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<
    | { ok: true; events: CalendarEvent[]; mine: CalendarEvent[]; pending: CalendarEvent[]; canRequest: boolean; canReview: boolean }
    | { ok: false; error: string }
  > => {
    const member = await memberOf(context.userId);
    if (!member) return { ok: false, error: "This login cannot open the calendar." };
    const approved = await member.db<Row>`
      select id, kind, title, note, person_name, user_id, start_date, end_date, status, reviewer_name, review_note, created_at, reviewed_at
      from calendar_events
      where status = 'approved'
      order by start_date, person_name
    `;
    const mine = await member.db<Row>`
      select id, kind, title, note, person_name, user_id, start_date, end_date, status, reviewer_name, review_note, created_at, reviewed_at
      from calendar_events
      where user_id = ${context.userId}
      order by created_at desc
      limit 40
    `;
    const pending = member.canReview
      ? await member.db<Row>`
          select id, kind, title, note, person_name, user_id, start_date, end_date, status, reviewer_name, review_note, created_at, reviewed_at
          from calendar_events
          where status = 'pending'
          order by created_at
        `
      : [];
    return {
      ok: true,
      events: approved.map(mapEvent),
      mine: mine.map(mapEvent),
      pending: pending.map(mapEvent),
      canRequest: member.canRequest,
      canReview: member.canReview,
    };
  });

export const submitCalendarRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { kind?: string; title?: string; note?: string; start?: string; end?: string }) => data)
  .handler(async ({ context, data }): Promise<{ ok: true; mailed: boolean } | { ok: false; error: string }> => {
    const member = await memberOf(context.userId);
    if (!member) return { ok: false, error: "This login cannot open the calendar." };
    if (!member.canRequest) return { ok: false, error: "Agents can view the calendar, but only staff can submit a request." };
    const kind = kindOf(data?.kind);
    const title = clip(text(data?.title), 80);
    const note = clip(text(data?.note), 500);
    const start = dayOf(data?.start);
    const end = dayOf(data?.end);
    if (!kind) return { ok: false, error: "Choose what kind of request this is." };
    if (!title) return { ok: false, error: "Say what the calendar should show." };
    if (!start || !end) return { ok: false, error: "Choose a start and end date." };
    const days = spanDays(start, end);
    if (days < 0) return { ok: false, error: "The end date has to be on or after the start." };
    if (days > 62) return { ok: false, error: "A request can cover up to 62 days." };
    const id = crypto.randomUUID();
    await member.db`
      insert into calendar_events (id, kind, title, note, person_name, user_id, start_date, end_date, status)
      values (${id}, ${kind}, ${title}, ${note}, ${member.name}, ${context.userId}, ${start}, ${end}, 'pending')
    `;
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const link = host ? `${proto}://${host}/calendar` : "/calendar";
    const to = await reviewers(member.db, context.userId);
    let mailed = false;
    try {
      mailed = await mail(
        member.email,
        member.name,
        to,
        `Calendar request — ${member.name}`,
        [`${member.name} submitted a staff calendar request.`, "", `${title}`, `${start} through ${end}`, note, "", "Open Lee Hub to approve or decline it:", link].filter(Boolean).join("\n"),
      );
    } catch {
      mailed = false;
    }
    return { ok: true, mailed };
  });

export const reviewCalendarRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: string; decision?: string; note?: string }) => data)
  .handler(async ({ context, data }): Promise<{ ok: true; mailed: boolean } | { ok: false; error: string }> => {
    const member = await memberOf(context.userId);
    if (!member?.canReview) return { ok: false, error: "An operations manager has to review calendar requests." };
    const id = clip(text(data?.id), 80);
    const decision = data?.decision === "approved" || data?.decision === "denied" ? data.decision : "";
    const note = clip(text(data?.note), 300);
    if (!id || !decision) return { ok: false, error: "Choose approve or decline." };
    const rows = await member.db<Row>`
      select id, kind, title, note, person_name, user_id, start_date, end_date, status, reviewer_name, review_note, created_at, reviewed_at
      from calendar_events where id = ${id}
    `;
    const event = rows[0];
    if (!event || event.status !== "pending") return { ok: false, error: "That request is no longer waiting." };
    if (event.user_id === context.userId) return { ok: false, error: "Someone else has to review your own request." };
    await member.db`
      update calendar_events
      set status = ${decision}, reviewer_name = ${member.name}, review_note = ${note}, reviewed_at = now()
      where id = ${id}
    `;
    const people = await member.db<{ email: string }>`select email from "user" where id = ${event.user_id}`;
    const to = people[0]?.email?.trim() ? [people[0].email.trim()] : [];
    const mailed = await mail(
      member.email,
      member.name,
      to,
      decision === "approved" ? `Approved — ${event.title}` : `Not approved — ${event.title}`,
      [
        decision === "approved"
          ? `${member.name} approved your calendar request. It is on the staff calendar.`
          : `${member.name} did not approve your calendar request.`,
        "",
        event.title,
        `${String(event.start_date).slice(0, 10)} through ${String(event.end_date).slice(0, 10)}`,
        note ? `Note: ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return { ok: true, mailed };
  });

export const postOfficeEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { kind?: string; title?: string; start?: string; end?: string }) => data)
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const member = await memberOf(context.userId);
    if (!member?.canReview) return { ok: false, error: "An operations manager adds office dates." };
    const kind = kindOf(data?.kind, true);
    const title = clip(text(data?.title), 80);
    const start = dayOf(data?.start);
    const end = dayOf(data?.end);
    if (!kind) return { ok: false, error: "Choose a holiday or a staff meeting." };
    if (!title) return { ok: false, error: "Name the date." };
    if (!start || !end) return { ok: false, error: "Choose a start and end date." };
    const days = spanDays(start, end);
    if (days < 0) return { ok: false, error: "The end date has to be on or after the start." };
    if (days > 21) return { ok: false, error: "An office date can cover up to 21 days." };
    await member.db`
      insert into calendar_events (
        id, kind, title, person_name, user_id, start_date, end_date, status, reviewer_name, reviewed_at
      ) values (
        ${crypto.randomUUID()}, ${kind}, ${title}, ${""}, ${context.userId}, ${start}, ${end}, 'approved', ${member.name}, now()
      )
    `;
    return { ok: true };
  });

export const removeCalendarEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: string }) => data)
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const member = await memberOf(context.userId);
    if (!member?.canReview) return { ok: false, error: "An operations manager can remove a calendar item." };
    const id = clip(text(data?.id), 80);
    if (!id) return { ok: false, error: "Choose an item." };
    await member.db`delete from calendar_events where id = ${id}`;
    return { ok: true };
  });
