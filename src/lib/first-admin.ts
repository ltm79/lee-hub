import { createServerFn } from "@tanstack/react-start";

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function emailOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return null;
  return email;
}

async function db() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

/** True only while the live database has no logins. */
export const setupStatus = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const rows = await sql<{ n: number | string }>`select count(*)::int as n from "user"`;
  const count = Number(rows[0]?.n ?? 0);
  return { needed: count === 0 };
});

/** Creates the first administrator. Refuses to run once any login exists. */
export const createFirstAdmin = createServerFn({ method: "POST" })
  .validator((data: { name?: string; email?: string; password?: string }) => data)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const name = clip(typeof data?.name === "string" ? data.name : "", 80);
    const email = emailOf(data?.email);
    const password = typeof data?.password === "string" ? data.password : "";
    if (!name) return { ok: false, error: "Add your name." };
    if (!email) return { ok: false, error: "Enter a work email." };
    if (password.length < 8 || password.length > 128) return { ok: false, error: "Use at least 8 characters." };

    const sql = await db();
    const userId = crypto.randomUUID();
    const inserted = await sql<{ id: string }>`
      insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      select ${userId}, ${name}, ${email}, true, now(), now()
      where not exists (select 1 from "user")
      returning id
    `;
    if (!inserted[0]) {
      return { ok: false, error: "An administrator already exists. Sign in instead." };
    }

    const { hashPassword } = await import("better-auth/crypto");
    const hash = await hashPassword(password);
    const accountId = crypto.randomUUID();
    await sql`
      insert into "account" (
        "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
      ) values (
        ${accountId}, ${userId}, 'credential', ${userId}, ${hash}, now(), now()
      )
    `;
    await sql`
      insert into members (user_id, role, active, title)
      values (${userId}, 'admin', true, 'Administrator')
    `;
    return { ok: true };
  });
