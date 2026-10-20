import { getBlob } from "@/lib/desk/blobs";
import { packetFiles, slotLabel } from "@/lib/desk/docs";
import { renderVoucher, voucherFilename } from "@/lib/desk/fill";
import { voucherLetter } from "@/lib/desk/letter";
import { KIND_META, packetTitle, type Packet } from "@/lib/desk/types";
import { bytesBlob, saveBlob, zipStore, type ZipEntry } from "@/lib/desk/zip";
import { safeFileName } from "@/lib/desk/intake";

function uniquePath(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const slash = name.lastIndexOf("/");
  const dir = slash >= 0 ? name.slice(0, slash + 1) : "";
  const file = slash >= 0 ? name.slice(slash + 1) : name;
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  let next = name;
  let n = 2;
  while (used.has(next)) {
    next = `${dir}${stem}-${n}${ext}`;
    n += 1;
  }
  used.add(next);
  return next;
}

export function packetZipName(packet: Packet): string {
  return voucherFilename(packet).replace(/\.pdf$/, "-voucher.zip");
}

export function mailSubject(packet: Packet): string {
  return `${KIND_META[packet.kind].title} — ${packetTitle(packet)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function foldBase64(value: string): string {
  return value.replace(/.{1,76}/g, (line) => `${line}\r\n`).trimEnd();
}

function utf8Base64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

function headerValue(value: string): string {
  if (/^[\t\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${utf8Base64(value)}?=`;
}

function asciiName(name: string): string {
  const cleaned = name.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "");
  return cleaned || "file";
}

export async function emailPacket(packet: Packet, to: string): Promise<{ missing: number }> {
  const recipients = to
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (recipients.length === 0) throw new Error("Choose at least one staff member.");

  const pdf = await renderVoucher(packet);
  const pdfName = voucherFilename(packet);
  const attachments: { filename: string; mimeType: string; contentBase64: string }[] = [
    { filename: pdfName, mimeType: "application/pdf", contentBase64: bytesToBase64(pdf) },
  ];
  const names = [pdfName];
  let missing = 0;

  for (const file of packetFiles(packet)) {
    const blob = await getBlob(file.id);
    if (!blob) {
      missing += 1;
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    attachments.push({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      contentBase64: bytesToBase64(bytes),
    });
    names.push(file.name);
  }

  const boundary = `----=_DealDesk_${crypto.randomUUID().replace(/-/g, "")}`;
  const parts = [
    `To: ${recipients.join(", ")}`,
    `Subject: ${headerValue(mailSubject(packet))}`,
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    foldBase64(utf8Base64(voucherLetter(packet, names))),
  ];
  for (const file of attachments) {
    const filename = asciiName(file.filename);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${file.mimeType}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      foldBase64(file.contentBase64),
    );
  }
  parts.push(`--${boundary}--`, "");
  const eml = parts.join("\r\n");
  saveBlob(new Blob([eml], { type: "message/rfc822" }), pdfName.replace(/\.pdf$/i, ".eml"));
  return { missing };
}

export async function buildPacket(packet: Packet): Promise<{ blob: Blob; filename: string; missing: number }> {
  const pdf = await renderVoucher(packet);
  const pdfName = voucherFilename(packet);
  const filename = packetZipName(packet);
  const used = new Set<string>([pdfName, "readme.txt"]);
  const entries: ZipEntry[] = [{ name: pdfName, data: pdf }];
  const included = [pdfName];
  const missing: string[] = [];

  for (const file of packetFiles(packet)) {
    const blob = await getBlob(file.id);
    const label = slotLabel(packet.kind, file.slot);
    if (!blob) {
      missing.push(`${label} (${file.name})`);
      continue;
    }
    const path = uniquePath(used, `files/${safeFileName(label)}--${safeFileName(file.name)}`);
    entries.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
    included.push(path);
  }

  const readme = [
    "Lee & Associates voucher",
    KIND_META[packet.kind].title,
    packetTitle(packet),
    packet.answers.city?.trim() ?? "",
    packet.status === "submitted" ? "Status: Submitted" : "Status: Draft",
    "",
    "Included",
    ...included.map((name) => `- ${name}`),
    ...(missing.length ? ["", "Not in this browser", ...missing.map((name) => `- ${name}`)] : []),
    "",
  ].join("\n");

  entries.push({ name: "readme.txt", data: new TextEncoder().encode(readme) });
  return { blob: bytesBlob(zipStore(entries), "application/zip"), filename, missing: missing.length };
}

export async function downloadPacket(packet: Packet): Promise<number> {
  const built = await buildPacket(packet);
  saveBlob(built.blob, built.filename);
  return built.missing;
}

