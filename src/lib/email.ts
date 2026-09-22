import nodemailer from "nodemailer";
import { SITE } from "@/lib/constants";

function recipientEmail(): string {
  return process.env.RECIPIENT_EMAIL || process.env.CONTACT_EMAIL_TO || SITE.email;
}

/** RFC 5321 practical mailbox length; also bounds addressparser work. */
export const MAX_REPLY_TO_EMAIL_LENGTH = 254;

/**
 * Strict single-address Reply-To sanitizer.
 * Rejects malformed, multi-recipient, control-character, and overlong values
 * before they reach Nodemailer.
 */
export function sanitizeReplyToEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const email = value.trim();
  if (!email) return undefined;
  if (email.length > MAX_REPLY_TO_EMAIL_LENGTH) return undefined;
  // One mailbox only — no lists, comments-as-separators, or header injection.
  if (/[\r\n\0,;<>()[\]\\]/.test(email)) return undefined;
  if (/\s/.test(email)) return undefined;

  const at = email.lastIndexOf("@");
  if (at <= 0 || at !== email.indexOf("@")) return undefined;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || local.length > 64 || domain.length > 253) return undefined;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return undefined;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return undefined;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/.test(domain)) {
    return undefined;
  }
  return email;
}

function formatBody(data: Record<string, unknown>): string {
  const rows = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(
      ([key, value]) =>
        `<tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">${key}</td><td style="padding:8px;border:1px solid #eee">${String(value)}</td></tr>`
    )
    .join("");

  return `<table style="border-collapse:collapse;width:100%;max-width:600px">${rows}</table>`;
}

export async function sendFormEmail(
  subject: string,
  data: Record<string, unknown>
): Promise<{ sent: boolean; error?: string }> {
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;

  if (!emailUser || !emailPassword) {
    console.log(`[email] Gmail not configured — would send to ${recipientEmail()}:`, subject, data);
    return { sent: false, error: "Email service not configured" };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });

    const replyTo = sanitizeReplyToEmail(data.email);

    await transporter.sendMail({
      from: `"SKL Trucks LLC" <${emailUser}>`,
      to: recipientEmail(),
      ...(replyTo ? { replyTo } : {}),
      subject: `[SKL Trucks] ${subject}`,
      html: `
        <h2>${subject}</h2>
        <p>New submission from skltrucks.com</p>
        ${formatBody(data)}
      `,
      text: `${subject}\n\n${Object.entries(data)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")}`,
    });

    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    console.error("[email] Gmail error:", message);
    return { sent: false, error: message };
  }
}
