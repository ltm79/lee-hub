import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { KIND_META, packetTitle, type Kind, type Packet } from "@/lib/desk/types";

type Notice = {
  mode: "sent" | "draft";
  to: string[];
  subject: string;
  body: string;
};

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))].slice(0, 20);
}

export const notifyStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { packetId?: string; staffIds?: string[] }) => ({
    packetId: typeof input?.packetId === "string" ? input.packetId : "",
    staffIds: cleanIds(input?.staffIds),
  }))
  .handler(async ({ context, data }): Promise<Notice> => {
    if (!data.packetId) throw new Error("That voucher cannot be found.");
    if (data.staffIds.length === 0) throw new Error("Choose at least one staff member.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const packets = await sql<{ user_id: string; kind: Kind; answers: Packet["answers"] }>`
      select user_id, kind, answers from desk_packets where id = ${data.packetId}
    `;
    const packet = packets[0];
    if (!packet) throw new Error("Save the voucher before notifying staff.");
    const allowed = await sql<{ ok: boolean }>`
      select true as ok
      where ${packet.user_id} = ${context.userId}
        or exists (
          select 1 from assistant_links
          where assistant_id = ${context.userId} and agent_id = ${packet.user_id}
        )
    `;
    if (!allowed[0]) throw new Error("That voucher is not on your account.");
    const staff = await sql<{ email: string; name: string }>`
      select u.email, u.name
      from members m
      join "user" u on u.id = m.user_id
      where m.user_id = any(${data.staffIds}::text[])
        and m.role = 'staff'
        and m.active = true
        and u.email <> ''
    `;
    const to = [...new Set(staff.map((person) => person.email.trim()).filter(Boolean))];
    if (to.length === 0) throw new Error("Those staff logins do not have an email address.");
    const agent = await sql<{ name: string }>`select name from "user" where id = ${packet.user_id}`;
    const now = Date.now();
    await sql`
      update desk_packets
      set status = 'submitted',
          submitted_at = coalesce(submitted_at, ${now}),
          updated_at = ${now}
      where id = ${data.packetId}
    `;
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const link = host ? `${proto}://${host}/vouchers/${data.packetId}` : `/vouchers/${data.packetId}`;
    const title = packetTitle({ id: data.packetId, kind: packet.kind, status: "submitted", createdAt: now, updatedAt: now, answers: packet.answers ?? {} });
    const kind = KIND_META[packet.kind]?.title ?? "Voucher";
    const city = packet.answers?.city?.trim();
    const subject = `${kind} ready — ${title}`;
    const body = [
      `${agent[0]?.name || "An agent"} submitted a ${kind.toLowerCase()} in Lee Hub.`,
      "",
      [title, city].filter(Boolean).join(", "),
      "",
      "The voucher file is not attached. Open it in the portal to review and manage it:",
      link,
    ].join("\n");
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (key && from) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text: body }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail.slice(0, 180) || "The notice could not be emailed.");
      }
      return { mode: "sent", to, subject, body };
    }
    return { mode: "draft", to, subject, body };
  });
