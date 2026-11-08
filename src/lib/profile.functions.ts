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
    return { ok: false as const, error: "That photo is too large. Choose another." };
  }
  return { ok: true as const, photo };
}

export const loadMyPhoto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ photo: string }> => {
    try {
      const db = await getDb();
      const rows = await db<{ photo: string | null }>`
        select photo from members where user_id = ${context.userId}
      `;
      const photo = rows[0]?.photo ?? "";
      return { photo: photo.startsWith("data:image/") ? photo : "" };
    } catch {
      return { photo: "" };
    }
  });

export const saveMemberPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { userId?: string; photo?: string }) => data)
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const db = await getDb();
    const admins = await db<{ role: string; active: unknown }>`
      select role, active from members where user_id = ${context.userId}
    `;
    if (!admins[0] || admins[0].role !== "admin" || !flag(admins[0].active)) {
      return { ok: false, error: "An administrator has to set headshots." };
    }
    const userId = text(data?.userId).trim();
    if (!userId) return { ok: false, error: "Choose a login." };
    const photo = cleanPhoto(data?.photo);
    if (!photo.ok) return photo;
    const members = await db<{ user_id: string }>`select user_id from members where user_id = ${userId}`;
    if (!members[0]) return { ok: false, error: "That login is not on the office yet." };
    try {
      await db`update members set photo = ${photo.photo} where user_id = ${userId}`;
    } catch {
      return { ok: false, error: "The headshot could not be saved. Publish the latest update, then try again." };
    }
    return { ok: true };
  });
