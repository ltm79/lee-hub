import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Answers, Attachment, Kind, Packet, Status } from "@/lib/desk/types";

const KINDS = new Set<Kind>(["lease", "sale", "consult", "additional"]);
const STATUSES = new Set<Status>(["draft", "submitted"]);

type PacketRow = {
  id: string;
  kind: Kind;
  status: Status;
  answers: Answers;
  files: Attachment[];
  created_at: number;
  updated_at: number;
  submitted_at: number | null;
};

export type DeskSnapshot = {
  packets: Packet[];
  defaultEmail: string;
};

export type FilePayload = {
  packetId: string;
  id: string;
  name: string;
  mime: string;
  slot: string;
  contentBase64: string;
};

export type FileDownload = {
  name: string;
  mime: string;
  contentBase64: string;
};

function cleanAnswers(raw: Answers | undefined): Answers {
  const answers: Answers = {};
  if (!raw || typeof raw !== "object") return answers;
  for (const [key, value] of Object.entries(raw)) {
    if (key.length > 40 || typeof value !== "string" || value.length > 4000 || !value) continue;
    answers[key] = value;
    if (Object.keys(answers).length >= 400) break;
  }
  return answers;
}

function cleanFiles(raw: Attachment[] | undefined): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const files: Attachment[] = [];
  for (const file of raw) {
    if (!file || typeof file.id !== "string" || typeof file.name !== "string") continue;
    files.push({
      id: file.id.slice(0, 80),
      slot: String(file.slot ?? "other").slice(0, 40),
      name: file.name.slice(0, 180),
      type: String(file.type ?? "application/octet-stream").slice(0, 120),
      size: Number.isFinite(file.size) ? Math.max(0, Math.round(file.size)) : 0,
      addedAt: Number.isFinite(file.addedAt) ? file.addedAt : Date.now(),
    });
    if (files.length >= 40) break;
  }
  return files;
}

function cleanPacket(input: Packet): Packet {
  if (!input || typeof input.id !== "string" || !/^[0-9a-f-]{16,80}$/i.test(input.id)) {
    throw new Error("That voucher cannot be saved.");
  }
  if (!KINDS.has(input.kind) || !STATUSES.has(input.status)) {
    throw new Error("That voucher cannot be saved.");
  }
  return {
    id: input.id,
    kind: input.kind,
    status: input.status,
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : Date.now(),
    updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now(),
    submittedAt: input.submittedAt,
    answers: cleanAnswers(input.answers),
    files: cleanFiles(input.files),
  };
}

function toPacket(row: PacketRow): Packet {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    submittedAt: row.submitted_at == null ? undefined : Number(row.submitted_at),
    answers: row.answers ?? {},
    files: Array.isArray(row.files) ? row.files : [],
  };
}

export const listDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DeskSnapshot> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<PacketRow>`
      select id, kind, status, answers, files, created_at, updated_at, submitted_at
      from desk_packets
      where user_id = ${context.userId}
      order by updated_at desc
    `;
    const settings = await sql<{ default_email: string }>`
      select default_email from desk_settings where user_id = ${context.userId}
    `;
    return {
      packets: rows.map(toPacket),
      defaultEmail: settings[0]?.default_email ?? "",
    };
  });

export const saveDeskPacket = createServerFn({ method: "POST" })
  .validator((input: Packet) => cleanPacket(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const owned = await sql<{ user_id: string }>`
      select user_id from desk_packets where id = ${data.id}
    `;
    if (owned[0] && owned[0].user_id !== context.userId) {
      throw new Error("That voucher is not on your account.");
    }
    const answers = JSON.stringify(data.answers);
    const files = JSON.stringify(data.files ?? []);
    await sql`
      insert into desk_packets (id, user_id, kind, status, answers, files, created_at, updated_at, submitted_at)
      values (
        ${data.id},
        ${context.userId},
        ${data.kind},
        ${data.status},
        ${answers}::jsonb,
        ${files}::jsonb,
        ${data.createdAt},
        ${data.updatedAt},
        ${data.submittedAt ?? null}
      )
      on conflict (id) do update set
        kind = excluded.kind,
        status = excluded.status,
        answers = excluded.answers,
        files = excluded.files,
        updated_at = excluded.updated_at,
        submitted_at = excluded.submitted_at
      where desk_packets.user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const deleteDeskPacket = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from desk_files where packet_id = ${id} and user_id = ${context.userId}`;
    await sql`delete from desk_packets where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const saveDeskEmail = createServerFn({ method: "POST" })
  .validator((email: string) => email.trim().slice(0, 180))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into desk_settings (user_id, default_email)
      values (${context.userId}, ${data})
      on conflict (user_id) do update set default_email = excluded.default_email
    `;
    return { ok: true as const };
  });

export const saveDeskFile = createServerFn({ method: "POST" })
  .validator((input: FilePayload) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    if (!data?.id || !data.packetId || !data.contentBase64) {
      throw new Error("That file cannot be saved.");
    }
    if (data.contentBase64.length > 16_000_000) {
      throw new Error(`${data.name || "A file"} is too large to keep on the account.`);
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const packet = await sql<{ id: string }>`
      select id from desk_packets where id = ${data.packetId} and user_id = ${context.userId}
    `;
    if (!packet[0]) throw new Error("Save the voucher before its files.");
    const owned = await sql<{ user_id: string }>`select user_id from desk_files where id = ${data.id}`;
    if (owned[0] && owned[0].user_id !== context.userId) {
      throw new Error("That file is not on your account.");
    }
    await sql`
      insert into desk_files (id, packet_id, user_id, name, mime, slot, bytes)
      values (
        ${data.id.slice(0, 80)},
        ${data.packetId},
        ${context.userId},
        ${data.name.slice(0, 180)},
        ${(data.mime || "application/octet-stream").slice(0, 120)},
        ${(data.slot || "other").slice(0, 40)},
        decode(${data.contentBase64}, 'base64')
      )
      on conflict (id) do update set
        name = excluded.name,
        mime = excluded.mime,
        slot = excluded.slot,
        bytes = excluded.bytes
      where desk_files.user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const deleteDeskFile = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from desk_files where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const fetchDeskFile = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }): Promise<FileDownload | null> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ name: string; mime: string; content: string }>`
      select f.name, f.mime, encode(f.bytes, 'base64') as content
      from desk_files f
      left join desk_packets p on p.id = f.packet_id
      left join desk_members me on me.user_id = ${context.userId}
      where f.id = ${id}
        and (
          f.user_id = ${context.userId}
          or (me.active and me.role in ('staff', 'admin') and p.status = 'submitted')
        )
    `;
    const row = rows[0];
    if (!row) return null;
    return { name: row.name, mime: row.mime, contentBase64: row.content };
  });
