import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Answers, Attachment, Kind, Packet, Status } from "@/lib/desk/types";

export type Role = "admin" | "agent" | "staff" | "assistant";

export const OFFICES = ["LA Central", "City of Industry"] as const;
export type Office = (typeof OFFICES)[number];

export type Member = {
  userId: string;
  username: string;
  name: string;
  role: Role;
  office: string;
  active: boolean;
};

export type SubmittedRow = Packet & { agentName: string; username: string; office: string };

const ADMIN_USERNAME = "admin";
const DOMAIN = "desk.local";

const SHORT_NAME = /^[a-z][a-z0-9._-]{1,31}$/;
const EMAIL_NAME = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function loginEmail(username: string): string {
  const value = username.trim().toLowerCase();
  if (value.includes("@")) return value;
  return `${value}@${DOMAIN}`;
}

export function normalizeLogin(value: string): string | null {
  const username = value.trim().toLowerCase();
  if (username.includes("@")) {
    if (!EMAIL_NAME.test(username) || username.length > 180) return null;
    return username;
  }
  if (!SHORT_NAME.test(username)) return null;
  return username;
}

function cleanUsername(value: string): string {
  const username = normalizeLogin(value);
  if (!username) {
    throw new Error("Use a short username, or a full email address.");
  }
  return username;
}

type MemberRow = {
  user_id: string;
  username: string;
  name: string;
  role: string;
  office: string;
  active: boolean;
};

function asMember(row: MemberRow): Member {
  const role: Role =
    row.role === "admin" || row.role === "staff" || row.role === "assistant" ? row.role : "agent";
  return {
    userId: row.user_id,
    username: row.username,
    name: row.name,
    role,
    office: row.office ?? "",
    active: Boolean(row.active),
  };
}

async function ensureAdmin() {
  return;
}

async function linkHubMember(userId: string) {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ role: string; active: boolean; name: string; email: string; office: string }>`
    select m.role, m.active, u.name, u.email, coalesce(m.office, '') as office
    from members m
    join "user" u on u.id = m.user_id
    where m.user_id = ${userId}
  `;
  const row = rows[0];
  if (!row || !row.active || !row.email) return;
  const role =
    row.role === "admin"
      ? "admin"
      : row.role === "staff"
        ? "staff"
        : row.role === "assistant"
          ? "assistant"
          : "agent";
  const office = row.office ?? "";
  const existing = await sql<{ user_id: string }>`
    select user_id from desk_members where user_id = ${userId}
  `;
  if (existing[0]) {
    await sql`
      update desk_members
      set role = ${role}, name = ${row.name}, office = ${office}, active = true
      where user_id = ${userId}
    `;
    return;
  }
  await sql`
    insert into desk_members (user_id, username, name, role, office, active)
    values (${userId}, ${row.email.toLowerCase()}, ${row.name}, ${role}, ${office}, true)
    on conflict (user_id) do update
    set role = ${role}, office = ${office}, active = true
  `;
}

async function caller(userId: string): Promise<Member | null> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<MemberRow>`
    select user_id, username, name, role, office, active from desk_members where user_id = ${userId}
  `;
  return rows[0] ? asMember(rows[0]) : null;
}

async function requireOffice(userId: string, roles: Role[]): Promise<Member> {
  const me = await caller(userId);
  if (!me || !me.active || !roles.includes(me.role)) {
    throw new Error("You cannot do that.");
  }
  return me;
}

export const prepareDesk = createServerFn({ method: "POST" }).handler(async () => {
  await ensureAdmin();
  return { ok: true as const };
});

export const whoAmI = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Member | null> => {
    await linkHubMember(context.userId);
    const me = await caller(context.userId);
    if (!me || !me.active) return null;
    return me;
  });

export const listLinkedAgents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ userId: string; name: string; office: string }[]> => {
    await linkHubMember(context.userId);
    const me = await caller(context.userId);
    if (!me || me.role !== "assistant") return [];
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ user_id: string; name: string; office: string }>`
      select u.id as user_id, u.name, coalesce(m.office, '') as office
      from assistant_links l
      join members m on m.user_id = l.agent_id
      join "user" u on u.id = m.user_id
      where l.assistant_id = ${context.userId}
        and m.active = true
        and m.role = 'agent'
      order by u.name
    `;
    return rows.map((row) => ({ userId: row.user_id, name: row.name, office: row.office ?? "" }));
  });

export type InternalUser = { userId: string; name: string; office: string };

export const listInternalUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<InternalUser[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const allowed = await sql<{ user_id: string }>`
      select user_id from members where user_id = ${context.userId} and active = true
    `;
    if (!allowed[0]) return [];
    const rows = await sql<{ user_id: string; name: string; office: string }>`
      select u.id as user_id, u.name, coalesce(m.office, '') as office
      from members m
      join "user" u on u.id = m.user_id
      where m.active = true and u.name <> ''
      order by u.name
    `;
    return rows.map((row) => ({ userId: row.user_id, name: row.name, office: row.office ?? "" }));
  });

export const listPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Member[]> => {
    await requireOffice(context.userId, ["admin"]);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<MemberRow>`
      select user_id, username, name, role, office, active from desk_members order by role, username
    `;
    return rows.map(asMember);
  });

export type StaffRecipient = {
  userId: string;
  name: string;
  office: string;
  email: string;
};

export const listRecipients = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<StaffRecipient[]> => {
    const me = await caller(context.userId);
    if (!me || !me.active) throw new Error("You cannot do that.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ user_id: string; name: string; office: string; username: string }>`
      select user_id, name, office, username
      from desk_members
      where role = 'staff' and active = true
      order by office, name
    `;
    return rows
      .filter((row) => row.username.includes("@"))
      .map((row) => ({
        userId: row.user_id,
        name: row.name,
        office: row.office ?? "",
        email: row.username,
      }));
  });

export const createPerson = createServerFn({ method: "POST" })
  .validator((input: { username: string; name: string; password: string; role: "agent" | "staff"; office: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireOffice(context.userId, ["admin"]);
    const username = cleanUsername(data.username ?? "");
    const name = (data.name ?? "").trim();
    const password = data.password ?? "";
    if (name.length < 2) throw new Error("Add the person's name.");
    if (password.length < 8) throw new Error("Passwords need at least 8 characters.");
    if (data.role !== "agent" && data.role !== "staff") throw new Error("Choose agent or staff.");
    if (!OFFICES.includes(data.office as Office)) throw new Error("Choose LA Central or City of Industry.");
    if (username === ADMIN_USERNAME) throw new Error("That username is reserved.");
    const { getSql } = await import("@/lib/db");
    const { hashPassword } = await import("better-auth/crypto");
    const sql = await getSql();
    const taken = await sql<{ username: string }>`select username from desk_members where username = ${username}`;
    if (taken[0]) throw new Error("That username is already in use.");
    const email = loginEmail(username);
    const emailTaken = await sql<{ email: string }>`select email from "user" where email = ${email}`;
    if (emailTaken[0]) throw new Error("That email is already in use.");
    const id = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const now = new Date().toISOString();
    const hash = await hashPassword(password);
    await sql`
      insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      values (${id}, ${name.slice(0, 80)}, ${email}, true, ${now}, ${now})
    `;
    await sql`
      insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
      values (${accountId}, ${id}, 'credential', ${id}, ${hash}, ${now}, ${now})
    `;
    await sql`
      insert into desk_members (user_id, username, name, role, office, active)
      values (${id}, ${username}, ${name.slice(0, 80)}, ${data.role}, ${data.office}, true)
    `;
    await sql`
      insert into members (user_id, role, active, title)
      values (${id}, ${data.role}, true, ${data.role === "staff" ? "Accounting" : "Agent"})
      on conflict (user_id) do nothing
    `;
    return { ok: true as const };
  });

export const setPersonActive = createServerFn({ method: "POST" })
  .validator((input: { userId: string; active: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const me = await requireOffice(context.userId, ["admin"]);
    if (data.userId === me.userId) throw new Error("You cannot turn off your own login.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      update desk_members set active = ${Boolean(data.active)}
      where user_id = ${data.userId} and role <> 'admin'
    `;
    await sql`
      update members set active = ${Boolean(data.active)}
      where user_id = ${data.userId} and role <> 'admin'
    `;
    return { ok: true as const };
  });

export const setPersonOffice = createServerFn({ method: "POST" })
  .validator((input: { userId: string; office: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireOffice(context.userId, ["admin"]);
    if (!OFFICES.includes(data.office as Office)) throw new Error("Choose LA Central or City of Industry.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      update desk_members set office = ${data.office}
      where user_id = ${data.userId} and role <> 'admin'
    `;
    return { ok: true as const };
  });

export const deletePerson = createServerFn({ method: "POST" })
  .validator((userId: string) => userId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: userId }) => {
    const me = await requireOffice(context.userId, ["admin"]);
    if (userId === me.userId) throw new Error("You cannot delete your own login.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ role: string }>`select role from desk_members where user_id = ${userId}`;
    if (!rows[0]) throw new Error("That person is already gone.");
    if (rows[0].role === "admin") throw new Error("The admin login cannot be deleted.");
    await sql`delete from desk_files where user_id = ${userId}`;
    await sql`delete from desk_packets where user_id = ${userId}`;
    await sql`delete from desk_settings where user_id = ${userId}`;
    await sql`delete from desk_members where user_id = ${userId}`;
    await sql`delete from "user" where id = ${userId}`;
    return { ok: true as const };
  });

export const resetPersonPassword = createServerFn({ method: "POST" })
  .validator((input: { userId: string; password: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireOffice(context.userId, ["admin"]);
    if ((data.password ?? "").length < 8) throw new Error("Passwords need at least 8 characters.");
    const { getSql } = await import("@/lib/db");
    const { hashPassword } = await import("better-auth/crypto");
    const sql = await getSql();
    const hash = await hashPassword(data.password);
    const now = new Date().toISOString();
    await sql`
      update "account"
      set password = ${hash}, "updatedAt" = ${now}
      where "userId" = ${data.userId} and "providerId" = 'credential'
    `;
    return { ok: true as const };
  });

type PacketRow = {
  id: string;
  kind: Kind;
  status: Status;
  answers: Answers;
  files: Attachment[] | null;
  created_at: number;
  updated_at: number;
  submitted_at: number | null;
  agent_name: string;
  username: string;
  office: string;
};

function toSubmitted(row: PacketRow): SubmittedRow {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    submittedAt: row.submitted_at == null ? undefined : Number(row.submitted_at),
    answers: row.answers ?? {},
    files: Array.isArray(row.files) ? row.files : [],
    agentName: row.agent_name,
    username: row.username,
    office: row.office ?? "",
  };
}

export const listSubmitted = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SubmittedRow[]> => {
    await requireOffice(context.userId, ["admin", "staff"]);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<PacketRow>`
      select p.id, p.kind, p.status, p.answers, p.files, p.created_at, p.updated_at, p.submitted_at,
             m.name as agent_name, m.username, m.office
      from desk_packets p
      join desk_members m on m.user_id = p.user_id
      where p.status = 'submitted'
      order by p.submitted_at desc nulls last, p.updated_at desc
    `;
    return rows.map(toSubmitted);
  });

export const getSubmitted = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }): Promise<SubmittedRow | null> => {
    await requireOffice(context.userId, ["admin", "staff"]);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<PacketRow>`
      select p.id, p.kind, p.status, p.answers, p.files, p.created_at, p.updated_at, p.submitted_at,
             m.name as agent_name, m.username, m.office
      from desk_packets p
      join desk_members m on m.user_id = p.user_id
      where p.id = ${id} and p.status = 'submitted'
    `;
    return rows[0] ? toSubmitted(rows[0]) : null;
  });
