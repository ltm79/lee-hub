import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  ICON_KEYS,
  type ActionResult,
  type AdminLink,
  type AdminPerson,
  type AdminResponse,
  type Category,
  type DeskLink,
  type LibraryNode,
  type MemberRole,
  type PortalSnapshot,
  type RosterPerson,
} from "@/lib/portal.types";

async function getDb() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function flag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function emailOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return null;
  return email;
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function roleOf(value: unknown): MemberRole | null {
  return value === "admin" || value === "staff" || value === "agent" ? value : null;
}

function officeOf(value: unknown): "LA Central" | "City of Industry" | null {
  return value === "LA Central" || value === "City of Industry" ? value : null;
}

function deskRoleOf(role: MemberRole): "admin" | "staff" | "agent" {
  if (role === "admin") return "admin";
  if (role === "staff") return "staff";
  return "agent";
}

function iconOf(value: unknown): string {
  return typeof value === "string" && (ICON_KEYS as readonly string[]).includes(value)
    ? value
    : "link";
}

type UserRow = { id: string; name: string; email: string };
type MemberRow = { role: string; active: unknown; title: string };

async function readUser(userId: string) {
  const db = await getDb();
  const users = await db<UserRow>`
    select id, name, email from "user" where id = ${userId}
  `;
  return { db, user: users[0] ?? null };
}

/** Office content is shared. Favorites and membership are scoped to the caller. */
async function ensureMember(userId: string): Promise<
  | { status: "missing" }
  | { status: "pending"; name: string; email: string }
  | { status: "disabled"; name: string; email: string }
  | { status: "ready"; name: string; email: string; role: MemberRole; title: string }
> {
  const { db, user } = await readUser(userId);
  if (!user) return { status: "missing" };

  const existing = await db<MemberRow>`
    select role, active, title from members where user_id = ${userId}
  `;
  const member = existing[0];
  if (member) {
    if (!flag(member.active)) {
      return { status: "disabled", name: user.name, email: user.email };
    }
    const role = roleOf(member.role) ?? "agent";
    return {
      status: "ready",
      name: user.name,
      email: user.email,
      role,
      title: member.title ?? "",
    };
  }

  const inserted = await db<{ user_id: string }>`
    insert into members (user_id, role, active, title)
    select ${userId}, 'admin', true, 'Administrator'
    where not exists (select 1 from members)
    returning user_id
  `;
  if (!inserted[0]) return { status: "pending", name: user.name, email: user.email };
  return {
    status: "ready",
    name: user.name,
    email: user.email,
    role: "admin",
    title: "Administrator",
  };
}

async function requireAdmin(userId: string): Promise<
  | { ok: false; error: string }
  | { ok: true; db: Awaited<ReturnType<typeof getDb>> }
> {
  const access = await ensureMember(userId);
  if (access.status !== "ready" || access.role !== "admin") {
    return { ok: false, error: "You need an administrator login to do that." };
  }
  return { ok: true, db: await getDb() };
}

function mapCategory(row: { id: string; name: string; sort_order: unknown }): Category {
  return { id: row.id, name: row.name, sortOrder: num(row.sort_order) };
}

function mapLink(row: {
  id: string;
  category_id: string;
  name: string;
  url: string;
  blurb: string;
  hint: string;
  icon: string;
  sort_order: unknown;
  active?: unknown;
}): AdminLink {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    url: row.url,
    blurb: row.blurb ?? "",
    hint: row.hint ?? "",
    icon: row.icon || "link",
    sortOrder: num(row.sort_order),
    active: row.active === undefined ? true : flag(row.active),
  };
}

export const officeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const db = await getDb();
  const offices = await db<{ name: string }>`
    select name from office where id = 'main'
  `;
  return {
    officeName: offices[0]?.name || "Lee & Associates",
  };
});

export const loadPortal = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PortalSnapshot> => {
    const access = await ensureMember(context.userId);
    if (access.status === "missing") throw new Error("Account not found");
    if (access.status !== "ready") {
      return { status: access.status, name: access.name, email: access.email };
    }

    const db = await getDb();
    const offices = await db<{ name: string; city: string; tagline: string }>`
      select name, city, tagline from office where id = 'main'
    `;
    const office = offices[0] ?? {
      name: "Lee & Associates",
      city: "",
      tagline: "Research, deals, and the systems this office runs on.",
    };
    const categories = await db<{ id: string; name: string; sort_order: unknown }>`
      select id, name, sort_order from categories order by sort_order, name
    `;
    const links = await db<{
      id: string;
      category_id: string;
      name: string;
      url: string;
      blurb: string;
      hint: string;
      icon: string;
      sort_order: unknown;
    }>`
      select id, category_id, name, url, blurb, hint, icon, sort_order
      from links
      where active = true
      order by sort_order, name
    `;
    const favorites = await db<{ link_id: string }>`
      select link_id from favorites where user_id = ${context.userId}
    `;
    const people = await db<{
      user_id: string;
      name: string;
      email: string;
      title: string;
      role: string;
    }>`
      select m.user_id, u.name, u.email, m.title, m.role
      from members m
      join "user" u on u.id = m.user_id
      where m.active = true
      order by case when m.role = 'admin' then 0 else 1 end, u.name
    `;

    const roster: RosterPerson[] = people.flatMap((person) => {
      const role = roleOf(person.role);
      if (!role) return [];
      return [
        {
          userId: person.user_id,
          name: person.name,
          email: person.email,
          title: person.title ?? "",
          role,
        },
      ];
    });

    const visible: DeskLink[] = links.map((link) => {
      const mapped = mapLink(link);
      return {
        id: mapped.id,
        categoryId: mapped.categoryId,
        name: mapped.name,
        url: mapped.url,
        blurb: mapped.blurb,
        hint: mapped.hint,
        icon: mapped.icon,
        sortOrder: mapped.sortOrder,
      };
    });

    return {
      status: "ready",
      office: {
        name: office.name,
        city: office.city ?? "",
        tagline: office.tagline ?? "",
      },
      member: {
        role: access.role,
        title: access.title,
        name: access.name,
        email: access.email,
      },
      categories: categories.map(mapCategory),
      links: visible,
      favoriteIds: favorites.map((row) => row.link_id),
      people: roster,
    };
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { linkId?: string }) => data)
  .handler(async ({ context, data }): Promise<ActionResult & { favorite?: boolean }> => {
    const access = await ensureMember(context.userId);
    if (access.status !== "ready") {
      return { ok: false, error: "Your login can't pin services yet." };
    }
    const linkId = clip(text(data?.linkId), 80);
    if (!linkId) return { ok: false, error: "Missing service." };
    const db = await getDb();
    const links = await db<{ id: string }>`
      select id from links where id = ${linkId} and active = true
    `;
    if (!links[0]) return { ok: false, error: "That service is not on the hub." };
    const existing = await db<{ link_id: string }>`
      select link_id from favorites
      where user_id = ${context.userId} and link_id = ${linkId}
    `;
    if (existing[0]) {
      await db`
        delete from favorites
        where user_id = ${context.userId} and link_id = ${linkId}
      `;
      return { ok: true, favorite: false };
    }
    await db`
      insert into favorites (user_id, link_id)
      values (${context.userId}, ${linkId})
    `;
    return { ok: true, favorite: true };
  });

export const loadAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminResponse> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const { db } = gate;
    const people = await db<{
      id: string;
      name: string;
      email: string;
      title: string | null;
      office: string | null;
      role: string | null;
      active: unknown;
      has_password: unknown;
    }>`
      select
        u.id,
        u.name,
        u.email,
        m.title,
        m.office,
        m.role,
        m.active,
        exists (
          select 1 from "account" a
          where a."userId" = u.id and a."providerId" = 'credential'
        ) as has_password
      from "user" u
      left join members m on m.user_id = u.id
      order by
        case when m.role = 'admin' then 0 when m.user_id is null then 2 else 1 end,
        u.name
    `;
    const categories = await db<{ id: string; name: string; sort_order: unknown }>`
      select id, name, sort_order from categories order by sort_order, name
    `;
    const links = await db<{
      id: string;
      category_id: string;
      name: string;
      url: string;
      blurb: string;
      hint: string;
      icon: string;
      sort_order: unknown;
      active: unknown;
    }>`
      select id, category_id, name, url, blurb, hint, icon, sort_order, active
      from links
      order by sort_order, name
    `;
    const roster: AdminPerson[] = people.map((person) => {
      const role = roleOf(person.role);
      const pending = role === null;
      return {
        userId: person.id,
        name: person.name,
        email: person.email,
        title: person.title ?? "",
        office: person.office ?? "",
        role,
        active: pending ? false : flag(person.active),
        pending,
        hasPassword: flag(person.has_password),
      };
    });
    return {
      ok: true,
      data: {
        people: roster,
        categories: categories.map(mapCategory),
        links: links.map(mapLink),
      },
    };
  });

async function writePassword(userId: string, password: string): Promise<string | null> {
  if (password.length < 8 || password.length > 128) {
    return "Use at least 8 characters.";
  }
  const { hashPassword } = await import("better-auth/crypto");
  const hash = await hashPassword(password);
  const db = await getDb();
  const existing = await db<{ id: string }>`
    select id from "account"
    where "userId" = ${userId} and "providerId" = 'credential'
  `;
  if (existing[0]) {
    await db`
      update "account"
      set password = ${hash}, "updatedAt" = now()
      where id = ${existing[0].id}
    `;
  } else {
    const accountId = crypto.randomUUID();
    await db`
      insert into "account" (
        "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
      ) values (
        ${accountId}, ${userId}, 'credential', ${userId}, ${hash}, now(), now()
      )
    `;
  }
  return null;
}

export const createLogin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: {
      name?: string;
      email?: string;
      password?: string;
      title?: string;
      role?: string;
      office?: string;
    }) => data,
  )
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const name = clip(text(data?.name), 80);
    const email = emailOf(data?.email);
    const password = text(data?.password);
    const title = clip(text(data?.title), 80);
    const role = roleOf(data?.role) ?? "agent";
    const office = officeOf(data?.office);
    if (!name) return { ok: false, error: "Add the person's name." };
    if (!email) return { ok: false, error: "Enter a work email." };
    if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };
    if (!office) return { ok: false, error: "Choose LA Central or City of Industry." };

    const { db } = gate;
    const existing = await db<{ id: string }>`
      select id from "user" where lower(email) = ${email}
    `;
    let userId = existing[0]?.id;
    if (!userId) {
      userId = crypto.randomUUID();
      try {
        await db`
          insert into "user" (
            "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
          ) values (
            ${userId}, ${name}, ${email}, true, now(), now()
          )
        `;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.toLowerCase().includes("unique") || message.includes("duplicate")) {
          return { ok: false, error: "That email already has a login." };
        }
        throw error;
      }
    } else {
      await db`
        update "user" set name = ${name}, "updatedAt" = now() where id = ${userId}
      `;
    }

    const passwordError = await writePassword(userId, password);
    if (passwordError) return { ok: false, error: passwordError };

    await db`
      insert into members (user_id, role, active, title, office)
      values (${userId}, ${role}, true, ${title}, ${office})
      on conflict (user_id) do update
      set role = ${role}, active = true, title = ${title}, office = ${office}
    `;
    await db`
      update desk_members
      set role = ${deskRoleOf(role)}, office = ${office}, active = true
      where user_id = ${userId}
    `;
    return { ok: true };
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: { userId?: string; role?: string; active?: boolean; title?: string; office?: string; email?: string }) => data,
  )
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const userId = clip(text(data?.userId), 80);
    const role = roleOf(data?.role);
    const active = Boolean(data?.active);
    const title = clip(text(data?.title), 80);
    const office = officeOf(data?.office);
    if (!userId || !role) return { ok: false, error: "Choose a person and a role." };

    const { db } = gate;
    if (userId === context.userId && (!active || role !== "admin")) {
      return { ok: false, error: "You can't remove your own administrator access." };
    }
    if (!active || role !== "admin") {
      const others = await db<{ n: unknown }>`
        select count(*)::int as n from members
        where role = 'admin' and active = true and user_id <> ${userId}
      `;
      const current = await db<{ role: string; active: unknown }>`
        select role, active from members where user_id = ${userId}
      `;
      const isActiveAdmin =
        current[0] && current[0].role === "admin" && flag(current[0].active);
      if (isActiveAdmin && num(others[0]?.n) === 0) {
        return { ok: false, error: "Keep at least one active administrator." };
      }
    }

    const users = await db<{ id: string; email: string }>`select id, email from "user" where id = ${userId}`;
    const account = users[0];
    if (!account) return { ok: false, error: "That person no longer exists." };

    const email = emailOf(data?.email);
    if (data?.email !== undefined && !email) return { ok: false, error: "Enter a work email." };
    if (email && email !== account.email.toLowerCase()) {
      const taken = await db<{ id: string }>`
        select id from "user" where lower(email) = ${email} and id <> ${userId}
      `;
      if (taken[0]) return { ok: false, error: "That email already has a login." };
      const deskTaken = await db<{ user_id: string }>`
        select user_id from desk_members where lower(username) = ${email} and user_id <> ${userId}
      `;
      if (deskTaken[0]) return { ok: false, error: "That email already has a login." };
      await db`
        update "user" set email = ${email}, "updatedAt" = now() where id = ${userId}
      `;
      await db`
        update desk_members set username = ${email} where user_id = ${userId}
      `;
    }

    if (office) {
      await db`
        insert into members (user_id, role, active, title, office)
        values (${userId}, ${role}, ${active}, ${title}, ${office})
        on conflict (user_id) do update
        set role = ${role}, active = ${active}, title = ${title}, office = ${office}
      `;
      await db`
        update desk_members
        set role = ${deskRoleOf(role)}, active = ${active}, office = ${office}
        where user_id = ${userId}
      `;
    } else {
      await db`
        insert into members (user_id, role, active, title)
        values (${userId}, ${role}, ${active}, ${title})
        on conflict (user_id) do update
        set role = ${role}, active = ${active}, title = ${title}
      `;
      await db`
        update desk_members
        set role = ${deskRoleOf(role)}, active = ${active}
        where user_id = ${userId}
      `;
    }
    if (!active) {
      await db`delete from "session" where "userId" = ${userId}`;
    }
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { userId?: string; password?: string }) => data)
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const userId = clip(text(data?.userId), 80);
    const password = text(data?.password);
    if (!userId) return { ok: false, error: "Choose a person." };
    const { db } = gate;
    const users = await db<{ id: string }>`select id from "user" where id = ${userId}`;
    if (!users[0]) return { ok: false, error: "That person no longer exists." };
    const passwordError = await writePassword(userId, password);
    if (passwordError) return { ok: false, error: passwordError };
    if (userId !== context.userId) {
      await db`delete from "session" where "userId" = ${userId}`;
    }
    return { ok: true };
  });

export const saveLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: {
      id?: string;
      categoryId?: string;
      name?: string;
      url?: string;
      blurb?: string;
      hint?: string;
      icon?: string;
      active?: boolean;
    }) => data,
  )
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const name = clip(text(data?.name), 80);
    const url = normalizeUrl(text(data?.url));
    const blurb = clip(text(data?.blurb), 180);
    const hint = clip(text(data?.hint), 180);
    const icon = iconOf(data?.icon);
    const categoryId = clip(text(data?.categoryId), 80);
    const active = data?.active !== false;
    const id = clip(text(data?.id), 80);
    if (!name) return { ok: false, error: "Name the service." };
    if (!url) return { ok: false, error: "Add a web address, like https://costar.com." };
    if (!categoryId) return { ok: false, error: "Choose a group." };

    const { db } = gate;
    const categories = await db<{ id: string }>`
      select id from categories where id = ${categoryId}
    `;
    if (!categories[0]) return { ok: false, error: "That group no longer exists." };

    if (id) {
      const updated = await db<{ id: string }>`
        update links
        set category_id = ${categoryId},
            name = ${name},
            url = ${url},
            blurb = ${blurb},
            hint = ${hint},
            icon = ${icon},
            active = ${active}
        where id = ${id}
        returning id
      `;
      if (!updated[0]) return { ok: false, error: "That service no longer exists." };
      return { ok: true };
    }

    const next = await db<{ n: unknown }>`
      select coalesce(max(sort_order), 0)::int as n from links where category_id = ${categoryId}
    `;
    const linkId = crypto.randomUUID();
    await db`
      insert into links (
        id, category_id, name, url, blurb, hint, icon, sort_order, active
      ) values (
        ${linkId}, ${categoryId}, ${name}, ${url}, ${blurb}, ${hint}, ${icon},
        ${num(next[0]?.n) + 10}, ${active}
      )
    `;
    return { ok: true };
  });

export const moveLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: string; direction?: string }) => data)
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const id = clip(text(data?.id), 80);
    const direction = data?.direction === "up" ? "up" : data?.direction === "down" ? "down" : null;
    if (!id || !direction) return { ok: false, error: "Couldn't reorder that service." };
    const { db } = gate;
    const current = await db<{ id: string; category_id: string; sort_order: unknown }>`
      select id, category_id, sort_order from links where id = ${id}
    `;
    const link = current[0];
    if (!link) return { ok: false, error: "That service no longer exists." };
    const siblings = await db<{ id: string; sort_order: unknown }>`
      select id, sort_order from links
      where category_id = ${link.category_id}
      order by sort_order, name
    `;
    const index = siblings.findIndex((row) => row.id === id);
    const swapWith = siblings[direction === "up" ? index - 1 : index + 1];
    if (!swapWith) return { ok: true };
    const a = num(link.sort_order);
    const b = num(swapWith.sort_order);
    const nextA = a === b ? (direction === "up" ? b - 1 : b + 1) : b;
    const nextB = a === b ? a : a;
    await db`update links set sort_order = ${nextA} where id = ${id}`;
    await db`update links set sort_order = ${nextB} where id = ${swapWith.id}`;
    return { ok: true };
  });

export const moveCategory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: string; direction?: string }) => data)
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const id = clip(text(data?.id), 80);
    const direction = data?.direction === "up" ? "up" : data?.direction === "down" ? "down" : null;
    if (!id || !direction) return { ok: false, error: "Couldn't reorder that group." };
    const { db } = gate;
    const rows = await db<{ id: string; sort_order: unknown }>`
      select id, sort_order from categories order by sort_order, name
    `;
    const index = rows.findIndex((row) => row.id === id);
    const current = rows[index];
    const swapWith = rows[direction === "up" ? index - 1 : index + 1];
    if (!current || !swapWith) return { ok: true };
    const a = num(current.sort_order);
    const b = num(swapWith.sort_order);
    const nextA = a === b ? (direction === "up" ? b - 1 : b + 1) : b;
    const nextB = a === b ? a : a;
    await db`update categories set sort_order = ${nextA} where id = ${id}`;
    await db`update categories set sort_order = ${nextB} where id = ${swapWith.id}`;
    return { ok: true };
  });

export const deleteLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: string }) => data)
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const id = clip(text(data?.id), 80);
    if (!id) return { ok: false, error: "Missing service." };
    await gate.db`delete from links where id = ${id}`;
    return { ok: true };
  });

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: string; name?: string }) => data)
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const name = clip(text(data?.name), 60);
    const id = clip(text(data?.id), 80);
    if (!name) return { ok: false, error: "Name the group." };
    const { db } = gate;
    if (id) {
      const updated = await db<{ id: string }>`
        update categories set name = ${name} where id = ${id} returning id
      `;
      if (!updated[0]) return { ok: false, error: "That group no longer exists." };
      return { ok: true };
    }
    const next = await db<{ n: unknown }>`
      select coalesce(max(sort_order), 0)::int as n from categories
    `;
    const categoryId = crypto.randomUUID();
    await db`
      insert into categories (id, name, sort_order)
      values (${categoryId}, ${name}, ${num(next[0]?.n) + 10})
    `;
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: string }) => data)
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const id = clip(text(data?.id), 80);
    if (!id) return { ok: false, error: "Missing group." };
    await gate.db`delete from categories where id = ${id}`;
    return { ok: true };
  });

export const saveOffice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { name?: string; city?: string; tagline?: string }) => data)
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const name = clip(text(data?.name), 80);
    const city = clip(text(data?.city), 80);
    const tagline = clip(text(data?.tagline), 180);
    if (!name) return { ok: false, error: "Name the office." };
    await gate.db`
      insert into office (id, name, city, tagline)
      values ('main', ${name}, ${city}, ${tagline})
      on conflict (id) do update
      set name = ${name}, city = ${city}, tagline = ${tagline}
    `;
    return { ok: true };
  });

export type WeatherReport =
  | { ok: true; place: string; temp: number; condition: string; high: number; low: number }
  | { ok: false };

const COMMERCE = { latitude: 34.0006, longitude: -118.1598, label: "Commerce, CA" };
const WEATHER_TTL_MS = 15 * 60 * 1000;
const weatherCache = new Map<string, { at: number; report: Extract<WeatherReport, { ok: true }> }>();

async function readWeatherJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json, application/json",
      "User-Agent": "LeeHub/1.0 (Lee & Associates office intranet)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`weather ${response.status}`);
  return response.json();
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function locateOffice(city: string): Promise<{ latitude: number; longitude: number; label: string } | null> {
  const query = city.trim();
  if (!query) return COMMERCE;
  const payload = (await readWeatherJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json&countryCode=US`,
  )) as { results?: unknown };
  if (!Array.isArray(payload.results)) return null;
  const spots = payload.results.flatMap((item) => {
    const row = item as { name?: unknown; admin1?: unknown; latitude?: unknown; longitude?: unknown };
    const latitude = finite(row.latitude);
    const longitude = finite(row.longitude);
    if (latitude === null || longitude === null || typeof row.name !== "string") return [];
    return [{ latitude, longitude, name: row.name, region: typeof row.admin1 === "string" ? row.admin1 : "" }];
  });
  if (spots.length === 0) return null;
  const wanted = query.split(",")[0]?.trim().toLowerCase() ?? "";
  const named = spots.filter((spot) => spot.name.toLowerCase() === wanted);
  const pool = named.length > 0 ? named : spots;
  const chosen = query.includes(",") ? pool[0] : (pool.find((spot) => spot.region === "California") ?? pool[0]);
  return { latitude: chosen.latitude, longitude: chosen.longitude, label: chosen.name };
}

function forecastPeriods(payload: unknown) {
  const periods = (payload as { properties?: { periods?: unknown } }).properties?.periods;
  if (!Array.isArray(periods)) return [];
  return periods.flatMap((item) => {
    const row = item as { temperature?: unknown; isDaytime?: unknown; shortForecast?: unknown };
    const temperature = finite(row.temperature);
    if (temperature === null) return [];
    return [
      {
        temperature,
        isDaytime: row.isDaytime === true,
        shortForecast: typeof row.shortForecast === "string" ? row.shortForecast : "",
      },
    ];
  });
}

function placeLabel(points: unknown, fallback: string) {
  const rel = (points as { properties?: { relativeLocation?: { properties?: { city?: unknown; state?: unknown } } } })
    .properties?.relativeLocation?.properties;
  if (typeof rel?.city === "string" && typeof rel.state === "string" && rel.city && rel.state) {
    return `${rel.city}, ${rel.state}`;
  }
  return fallback;
}

export const localWeather = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((data: { city?: string } | undefined) => ({
    city: typeof data?.city === "string" ? data.city.slice(0, 80) : "",
  }))
  .handler(async ({ data }): Promise<WeatherReport> => {
    const key = data.city.trim().toLowerCase() || "commerce, ca";
    const hit = weatherCache.get(key);
    if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.report;
    try {
      const spot = await locateOffice(data.city);
      if (!spot) return { ok: false };
      const points = await readWeatherJson(
        `https://api.weather.gov/points/${spot.latitude.toFixed(4)},${spot.longitude.toFixed(4)}`,
      );
      const links = (points as { properties?: { forecast?: unknown; forecastHourly?: unknown } }).properties;
      if (typeof links?.forecast !== "string" || typeof links.forecastHourly !== "string") return { ok: false };
      const [daily, hourly] = await Promise.all([
        readWeatherJson(links.forecast),
        readWeatherJson(links.forecastHourly),
      ]);
      const days = forecastPeriods(daily);
      const now = forecastPeriods(hourly)[0] ?? days[0];
      if (!now) return { ok: false };
      const report: Extract<WeatherReport, { ok: true }> = {
        ok: true,
        place: placeLabel(points, spot.label),
        temp: now.temperature,
        condition: (now.shortForecast.split(" then ")[0] ?? "").trim().slice(0, 42) || "Current",
        high: days.find((period) => period.isDaytime)?.temperature ?? now.temperature,
        low: days.find((period) => !period.isDaytime)?.temperature ?? now.temperature,
      };
      weatherCache.set(key, { at: Date.now(), report });
      return report;
    } catch {
      return { ok: false };
    }
  });

const FILE_EXTENSIONS = new Set([
  "pdf",
  "csv",
  "xls",
  "xlsx",
  "xlsm",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "txt",
  "zip",
]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_CHUNK_CHARS = 3_000_000;

function libraryName(value: unknown, fallback = ""): string | null {
  if (typeof value !== "string") return fallback ? fallback : null;
  const base = value.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback ? fallback : null;
  return cleaned;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function decodeChunk(value: unknown, allowPadding: boolean): string | null {
  if (typeof value !== "string") return null;
  const content = value.replace(/\s/g, "");
  if (!content || content.length > MAX_CHUNK_CHARS) return null;
  if (allowPadding) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content)) return null;
  } else if (!/^[A-Za-z0-9+/]+$/.test(content) || content.length % 4 !== 0) {
    return null;
  }
  return content;
}

function base64Size(content: string): number {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return Math.floor((content.length * 3) / 4) - padding;
}

async function requireReady(userId: string) {
  const access = await ensureMember(userId);
  if (access.status !== "ready") {
    return { ok: false as const, error: "Sign in with an active office login." };
  }
  return { ok: true as const, db: await getDb() };
}

async function folderParent(db: Awaited<ReturnType<typeof getDb>>, parentId: string) {
  if (!parentId) return { ok: true as const, parentId: null as string | null };
  const rows = await db<{ kind: string }>`
    select kind from library_nodes where id = ${parentId}
  `;
  if (rows[0]?.kind !== "folder") return { ok: false as const, error: "That folder is not there." };
  return { ok: true as const, parentId };
}

async function nameTaken(
  db: Awaited<ReturnType<typeof getDb>>,
  parentId: string | null,
  name: string,
) {
  const rows = await db<{ id: string }>`
    select id from library_nodes
    where parent_id is not distinct from ${parentId}
      and lower(name) = lower(${name})
  `;
  return rows.length > 0;
}

function mapNode(row: { id: string; kind: string; name: string; size_bytes: unknown }): LibraryNode | null {
  if (row.kind !== "folder" && row.kind !== "file") return null;
  return { id: row.id, kind: row.kind, name: row.name, sizeBytes: num(row.size_bytes) };
}

export const listLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((data: { parentId?: string } | undefined) => ({
    parentId: typeof data?.parentId === "string" ? data.parentId.trim().slice(0, 80) : "",
  }))
  .handler(async ({ context, data }): Promise<{ ok: true; nodes: LibraryNode[] } | { ok: false; error: string }> => {
    const gate = await requireReady(context.userId);
    if (!gate.ok) return gate;
    const parent = await folderParent(gate.db, data.parentId);
    if (!parent.ok) return parent;
    const rows = await gate.db<{ id: string; kind: string; name: string; size_bytes: unknown }>`
      select id, kind, name, size_bytes from library_nodes
      where parent_id is not distinct from ${parent.parentId}
        and (kind = 'folder' or coalesce(size_bytes, 0) > 0)
      order by case when kind = 'folder' then 0 else 1 end, lower(name)
    `;
    return { ok: true, nodes: rows.flatMap((row) => {
      const node = mapNode(row);
      return node ? [node] : [];
    }) };
  });

export const createLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { parentId?: string; name?: string }) => data)
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const name = libraryName(data?.name);
    if (!name) return { ok: false, error: "Name the folder." };
    const parent = await folderParent(gate.db, typeof data?.parentId === "string" ? data.parentId.trim().slice(0, 80) : "");
    if (!parent.ok) return parent;
    if (await nameTaken(gate.db, parent.parentId, name)) {
      return { ok: false, error: "Something in this folder already uses that name." };
    }
    await gate.db`
      insert into library_nodes (id, parent_id, kind, name)
      values (${crypto.randomUUID()}, ${parent.parentId}, 'folder', ${name})
    `;
    return { ok: true };
  });

export const uploadLibraryFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: {
      id?: string;
      parentId?: string;
      name?: string;
      content?: string;
      offset?: number;
      done?: boolean;
    }) => data,
  )
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const name = libraryName(data?.name);
    if (!name) return { ok: false, error: "Choose a file." };
    const extension = fileExtension(name);
    if (!FILE_EXTENSIONS.has(extension)) {
      return { ok: false, error: "Use a PDF, spreadsheet, document, image, or zip." };
    }
    const offset = Number(data?.offset);
    if (!Number.isInteger(offset) || offset < 0) return { ok: false, error: "That file could not be saved." };
    const done = data?.done === true;
    const chunk = decodeChunk(data?.content, done);
    if (!chunk) return { ok: false, error: "That file could not be saved." };
    const id = typeof data?.id === "string" ? data.id.trim().slice(0, 80) : "";
    if (!id) return { ok: false, error: "That file could not be saved." };
    const parent = await folderParent(gate.db, typeof data?.parentId === "string" ? data.parentId.trim().slice(0, 80) : "");
    if (!parent.ok) return parent;

    if (offset === 0) {
      await gate.db`
        delete from library_nodes
        where parent_id is not distinct from ${parent.parentId}
          and kind = 'file'
          and lower(name) = lower(${name})
          and coalesce(size_bytes, 0) = 0
      `;
      if (await nameTaken(gate.db, parent.parentId, name)) {
        return { ok: false, error: "Something in this folder already uses that name." };
      }
      await gate.db`
        insert into library_nodes (id, parent_id, kind, name, mime, size_bytes, content)
        values (${id}, ${parent.parentId}, 'file', ${name}, ${extension}, 0, ${chunk})
      `;
    } else {
      const updated = await gate.db<{ id: string }>`
        update library_nodes
        set content = content || ${chunk}
        where id = ${id}
          and kind = 'file'
          and coalesce(size_bytes, 0) = 0
          and length(content) = ${offset}
        returning id
      `;
      if (!updated[0]) return { ok: false, error: "That upload was interrupted. Try the file again." };
    }

    if (!done) return { ok: true };

    const stored = await gate.db<{ content: string | null }>`
      select content from library_nodes where id = ${id} and kind = 'file'
    `;
    const content = stored[0]?.content ?? "";
    const sizeBytes = base64Size(content);
    if (sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) {
      await gate.db`delete from library_nodes where id = ${id} and coalesce(size_bytes, 0) = 0`;
      return { ok: false, error: "That file is empty or over 20 MB." };
    }
    await gate.db`
      update library_nodes set size_bytes = ${sizeBytes} where id = ${id}
    `;
    return { ok: true };
  });

export const deleteLibraryNode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: string }) => data)
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const gate = await requireAdmin(context.userId);
    if (!gate.ok) return gate;
    const id = typeof data?.id === "string" ? data.id.trim().slice(0, 80) : "";
    if (!id) return { ok: false, error: "Missing item." };
    await gate.db`delete from library_nodes where id = ${id}`;
    return { ok: true };
  });

export const downloadLibraryFile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((data: { id?: string; offset?: number } | undefined) => ({
    id: typeof data?.id === "string" ? data.id.trim().slice(0, 80) : "",
    offset: typeof data?.offset === "number" && Number.isFinite(data.offset) ? Math.max(0, Math.floor(data.offset)) : 0,
  }))
  .handler(
    async ({
      context,
      data,
    }): Promise<
      { ok: true; name: string; content: string; offset: number; total: number } | { ok: false; error: string }
    > => {
      const gate = await requireReady(context.userId);
      if (!gate.ok) return gate;
      if (!data.id) return { ok: false, error: "Missing file." };
      const rows = await gate.db<{ name: string; content: string | null; total: unknown }>`
        select
          name,
          substring(content from ${data.offset + 1} for ${MAX_CHUNK_CHARS}) as content,
          length(content)::int as total
        from library_nodes
        where id = ${data.id} and kind = 'file' and coalesce(size_bytes, 0) > 0
      `;
      const row = rows[0];
      if (!row?.content && data.offset === 0) return { ok: false, error: "That file is not there." };
      return {
        ok: true,
        name: row?.name ?? "file",
        content: row?.content ?? "",
        offset: data.offset,
        total: num(row?.total),
      };
    },
  );

export type EconomyItem = {
  label: string;
  value: string;
  note: string;
};

export type EconomyReport = { ok: true; items: EconomyItem[] } | { ok: false };

const ECONOMY_TTL_MS = 15 * 60 * 1000;
let economyCache: { at: number; report: Extract<EconomyReport, { ok: true }> } | null = null;

const MONTHS: Record<string, string> = {
  january: "Jan",
  february: "Feb",
  march: "Mar",
  april: "Apr",
  may: "May",
  june: "Jun",
  july: "Jul",
  august: "Aug",
  september: "Sep",
  october: "Oct",
  november: "Nov",
  december: "Dec",
};

async function publicJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; LeeHub/1.0; office intranet)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`economy ${response.status}`);
  return response.json();
}

function quoteOf(payload: unknown): { price: number; change: number } | null {
  const result = (
    payload as {
      chart?: {
        result?: {
          meta?: Record<string, unknown>;
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    }
  ).chart?.result?.[0];
  const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  const live = finite(result?.meta?.regularMarketPrice);
  const last = closes.at(-1) ?? null;
  const earlier = closes.length >= 2 ? closes[closes.length - 2] : null;
  const price = live ?? last;
  const sameSession = live !== null && last !== null && Math.abs(live - last) / last < 0.0005;
  const prev = sameSession ? earlier : (last ?? finite(result?.meta?.previousClose));
  if (price === null || prev === null || prev === 0) return null;
  return { price, change: ((price - prev) / prev) * 100 };
}

function signedPct(change: number) {
  const rounded = Math.round(change * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

function shortPeriod(raw: string) {
  const match = raw.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!match) return raw.slice(0, 24);
  const month = MONTHS[match[1].toLowerCase()] ?? match[1].slice(0, 3);
  return `${month} ${match[2]}`;
}

function wikiStat(wikitext: string, field: string): { value: string; note: string } | null {
  const block = wikitext.match(new RegExp(`\\|\\s*${field}\\s*=([\\s\\S]*?)\\n\\|`))?.[1] ?? "";
  const rate = block.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!rate) return null;
  const when = block.match(/\(([^)]+)\)/)?.[1] ?? "";
  return { value: `${rate[1]}%`, note: shortPeriod(when) };
}

async function macroStats(): Promise<EconomyItem[]> {
  const payload = (await publicJson(
    "https://en.wikipedia.org/w/api.php?action=parse&page=Economy_of_the_United_States&prop=wikitext&format=json&section=0",
  )) as { parse?: { wikitext?: Record<string, string> } };
  const text = payload.parse?.wikitext?.["*"] ?? "";
  const unemployment = wikiStat(text, "unemployment");
  const inflation = wikiStat(text, "inflation");
  const items: EconomyItem[] = [];
  if (unemployment) items.push({ label: "Unemployment", ...unemployment });
  if (inflation) items.push({ label: "CPI", value: inflation.value, note: `${inflation.note} YoY` });
  return items;
}

async function marketStat(symbol: string, label: string, oil: boolean): Promise<EconomyItem | null> {
  const payload = await publicJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
  );
  const quote = quoteOf(payload);
  if (!quote) return null;
  const value = oil
    ? `$${quote.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : quote.price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return { label, value, note: signedPct(quote.change) };
}

export const economySnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<EconomyReport> => {
    if (economyCache && Date.now() - economyCache.at < ECONOMY_TTL_MS) return economyCache.report;
    try {
      const [macro, oil, spx, dow, nasdaq] = await Promise.all([
        macroStats().catch(() => [] as EconomyItem[]),
        marketStat("CL=F", "WTI oil", true).catch(() => null),
        marketStat("^GSPC", "S&P 500", false).catch(() => null),
        marketStat("^DJI", "Dow", false).catch(() => null),
        marketStat("^IXIC", "Nasdaq", false).catch(() => null),
      ]);
      const items = [...macro, oil, spx, dow, nasdaq].filter((item): item is EconomyItem => item !== null);
      if (items.length < 3) return { ok: false };
      const report: Extract<EconomyReport, { ok: true }> = { ok: true, items };
      economyCache = { at: Date.now(), report };
      return report;
    } catch {
      return { ok: false };
    }
  });


