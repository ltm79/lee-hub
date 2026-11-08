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

function stamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return text(value);
}

export type BoardView = {
  asOf: string;
  asOfLabel: string;
  rangeLabel: string;
  updatedAt: string;
  rows: { rank: number; name: string; gross: number; photo: string }[];
};

type Gate =
  | { ok: false; error: string }
  | { ok: true; admin: boolean; shareholder: boolean; db: Awaited<ReturnType<typeof getDb>> };

async function requireMember(userId: string): Promise<Gate> {
  const db = await getDb();
  const rows = await db<{ role: string; active: unknown; shareholder: unknown }>`
    select role, active, shareholder from members where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row || !flag(row.active)) return { ok: false, error: "This login cannot open the leaderboard." };
  return { ok: true, admin: row.role === "admin", shareholder: flag(row.shareholder), db };
}

function personKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function samePerson(a: string, b: string) {
  const left = personKey(a);
  const right = personKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const aParts = left.split(" ");
  const bParts = right.split(" ");
  return aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1];
}

function photoFor(name: string, faces: { name: string; photo: string }[]) {
  const exact = faces.find((face) => personKey(face.name) === personKey(name));
  if (exact) return exact.photo;
  return faces.find((face) => samePerson(face.name, name))?.photo ?? "";
}
function cleanRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  const rows: { name: string; gross: number }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as { name?: unknown; gross?: unknown };
    const name = text(record.name).trim().slice(0, 120);
    const gross = typeof record.gross === "number" ? record.gross : Number(record.gross);
    if (!name || !Number.isFinite(gross) || gross <= 0 || gross > 1e12) continue;
    rows.push({ name, gross });
    if (rows.length >= 400) break;
  }
  rows.sort((a, b) => b.gross - a.gross || a.name.localeCompare(b.name));
  return rows;
}

export const loadDealBoard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; board: BoardView | null } | { ok: false; error: string }> => {
    const gate = await requireMember(context.userId);
    if (!gate.ok) return gate;
    if (!gate.admin && !gate.shareholder) return { ok: false, error: "The leaderboard is for shareholders." };
    const meta = await gate.db<{ as_of: string; as_of_label: string; range_label: string; uploaded_at: unknown }>`
      select as_of, as_of_label, range_label, uploaded_at from deal_board where id = 'current'
    `;
    const head = meta[0];
    if (!head) return { ok: true, board: null };
    const lines = await gate.db<{ position: number | string; name: string; gross: number | string }>`
      select position, name, gross from deal_board_rows order by position
    `;
    if (!lines.length) return { ok: true, board: null };
    const faces = await gate.db<{ name: string; photo: string }>`
      select u.name, m.photo
      from members m
      join "user" u on u.id = m.user_id
      where m.photo <> ''
    `;
    return {
      ok: true,
      board: {
        asOf: head.as_of ?? "",
        asOfLabel: head.as_of_label ?? "",
        rangeLabel: head.range_label ?? "",
        updatedAt: stamp(head.uploaded_at),
        rows: lines.map((line, index) => ({
          rank: Number(line.position) || index + 1,
          name: line.name,
          gross: Number(line.gross),
          photo: photoFor(line.name, faces),
        })),
      },
    };
  });

export const saveDealBoard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { asOf?: string; asOfLabel?: string; rangeLabel?: string; rows?: { name: string; gross: number }[] }) => data)
  .handler(async ({ context, data }): Promise<{ ok: true; saved: number } | { ok: false; error: string }> => {
    const gate = await requireMember(context.userId);
    if (!gate.ok) return gate;
    if (!gate.admin) return { ok: false, error: "An administrator has to publish the leaderboard." };
    const rows = cleanRows(data?.rows);
    if (!rows.length) return { ok: false, error: "No agents with a broker gross were found." };
    const asOf = text(data?.asOf).slice(0, 40);
    const asOfLabel = text(data?.asOfLabel).slice(0, 80);
    const rangeLabel = text(data?.rangeLabel).slice(0, 120);
    await gate.db`delete from deal_board_rows`;
    await gate.db`
      insert into deal_board (id, as_of, as_of_label, range_label, uploaded_at)
      values ('current', ${asOf}, ${asOfLabel}, ${rangeLabel}, now())
      on conflict (id) do update set
        as_of = excluded.as_of,
        as_of_label = excluded.as_of_label,
        range_label = excluded.range_label,
        uploaded_at = now()
    `;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      await gate.db`
        insert into deal_board_rows (position, name, gross)
        values (${index + 1}, ${row.name}, ${row.gross})
      `;
    }
    return { ok: true, saved: rows.length };
  });
