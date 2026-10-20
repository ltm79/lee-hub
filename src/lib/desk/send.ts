import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export type SendAttachment = {
  filename: string;
  mimeType: string;
  contentBase64: string;
};

export type SendInput = {
  to: string;
  subject: string;
  body: string;
  attachments: SendAttachment[];
};

export type SendResult = {
  ok: boolean;
  errorMessage?: string;
  loginRequired?: boolean;
  loginUrl?: string;
  pending?: boolean;
};

const EMAIL = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const MAX_FILES = 16;
const MAX_FILE_CHARS = 9_000_000;
const MAX_TOTAL_CHARS = 12_000_000;

function cleanName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
  return cleaned || "file";
}

export const sendVoucherEmail = createServerFn({ method: "POST" })
  .validator((data: SendInput) => data)
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<SendResult> => {
    const recipients = data.to
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (recipients.length === 0 || recipients.some((item) => !EMAIL.test(item))) {
      return { ok: false, errorMessage: "Choose at least one staff member with an email." };
    }
    if (!data.subject.trim() || !data.body.trim()) {
      return { ok: false, errorMessage: "This voucher does not have enough to send." };
    }
    if (data.attachments.length > MAX_FILES) {
      return { ok: false, errorMessage: "Too many files to email at once." };
    }
    let total = 0;
    for (const file of data.attachments) {
      if (file.contentBase64.length > MAX_FILE_CHARS) {
        return { ok: false, errorMessage: `${file.filename} is too large to email.` };
      }
      total += file.contentBase64.length;
    }
    if (total > MAX_TOTAL_CHARS) {
      return { ok: false, errorMessage: "These files are too large to email together. Remove one and send again." };
    }

    const { callTool } = await import("@/lib/app-data/client.server");
    const { ConnectorType } = await import("@/lib/app-data/types");
    const result = await callTool(
      "gmail_send_email",
      {
        to: recipients.join(", "),
        subject: data.subject.trim(),
        body: data.body,
        attachments: data.attachments.map((file) => ({
          filename: cleanName(file.filename),
          mimeType: file.mimeType || "application/octet-stream",
          content: file.contentBase64,
        })),
      },
      { connectorType: ConnectorType.Gmail },
    );

    return {
      ok: result.ok,
      errorMessage: result.errorMessage,
      loginRequired: result.loginRequired,
      loginUrl: result.loginUrl,
      pending: result.pending,
    };
  });
