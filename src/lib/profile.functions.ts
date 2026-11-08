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

const MAX_PHOTO = 180_000;

function cleanPhoto(value: unknown) {
  const photo = text(value).trim();
  if (!photo) return { ok: true as const, photo: "" };
  if (!photo.startsWith("data:image/jpeg;base64,") || photo.length > MAX_PHOTO) {
    return { ok: false as const, error: "Use a photo under about 150 KB. The page will shrink it." };
  }
  return { ok: true as const, photo };
}

export const loadProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; name: string; email: string; photo: string } | { ok: false; error: string }> => {
    const db = await getDb();
    const rows = await db<{ name: string; email: string; photo: string | null; active: unknown }>`
      select u.name, u.email, m.photo, m.active
      from members m
      join "user" u on u.id = m.user_id
      where m.user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row || !flag(row.active)) return { ok: false, error: "This login cannot open a profile." };
    return { ok: true, name: row.name, email: row.email, photo: row.photo ?? "" };
  });

export const saveProfilePhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { photo?: string }) => data)
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const db = await getDb();
    const rows = await db<{ active: unknown }>`
      select active from members where user_id = ${context.userId}
    `;
    if (!rows[0] || !flag(rows[0].active)) return { ok: false, error: "This login cannot update a profile." };
    const photo = cleanPhoto(data?.photo);
    if (!photo.ok) return photo;
    await db`update members set photo = ${photo.photo} where user_id = ${context.userId}`;
    return { ok: true };
  });
