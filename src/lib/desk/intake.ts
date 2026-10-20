import type { Attachment } from "@/lib/desk/types";
import { putBlob } from "@/lib/desk/blobs";

export const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,.tif,.tiff";
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_PACKET_FILES = 24;
export const MAX_PACKET_BYTES = 48 * 1024 * 1024;

const EXT = /\.(pdf|png|jpe?g|webp|gif|docx?|xlsx?|csv|txt|tiff?)$/i;

const ALLOWED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/tiff",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  const mb = size / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (cleaned || "file").slice(0, 80);
}

function allowed(file: File): boolean {
  return ALLOWED.has(file.type) || EXT.test(file.name);
}

export function intakeError(file: File, count: number, bytes: number): string | null {
  if (count >= MAX_PACKET_FILES) return `A voucher holds up to ${MAX_PACKET_FILES} files.`;
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is over 12 MB.`;
  if (bytes + file.size > MAX_PACKET_BYTES) return "This voucher is at the 48 MB file limit.";
  if (!allowed(file)) return `${file.name} needs to be a PDF, image, Word, Excel, or text file.`;
  return null;
}

export async function storeIncoming(
  packetId: string,
  slot: string,
  list: FileList | File[],
  existing: Attachment[],
): Promise<{ added: Attachment[]; errors: string[] }> {
  const added: Attachment[] = [];
  const errors: string[] = [];
  let count = existing.length;
  let bytes = existing.reduce((sum, file) => sum + file.size, 0);

  for (const file of Array.from(list)) {
    const problem = intakeError(file, count, bytes);
    if (problem) {
      errors.push(problem);
      continue;
    }
    const id = crypto.randomUUID();
    try {
      await putBlob(packetId, id, file);
    } catch (error) {
      const quota = error instanceof DOMException && error.name === "QuotaExceededError";
      errors.push(quota ? "This browser is out of room for more deal files." : `${file.name} could not be saved.`);
      continue;
    }
    added.push({
      id,
      slot,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      addedAt: Date.now(),
    });
    count += 1;
    bytes += file.size;
  }

  return { added, errors };
}
