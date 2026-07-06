import { Resend } from "resend";
import { SITE } from "@/lib/constants";

const TO_EMAIL = process.env.CONTACT_EMAIL_TO || SITE.email;
const FROM_EMAIL = process.env.EMAIL_FROM || "SKL Trucks <onboarding@resend.dev>";

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
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[email] No RESEND_API_KEY — would send to ${TO_EMAIL}:`, subject, data);
    return { sent: false };
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    replyTo: typeof data.email === "string" ? data.email : undefined,
    subject: `[SKL Trucks] ${subject}`,
    html: `
      <h2>${subject}</h2>
      <p>New submission from skltrucks.com</p>
      ${formatBody(data)}
    `,
  });

  if (error) {
    console.error("[email] Resend error:", error);
    return { sent: false, error: error.message };
  }

  return { sent: true };
}
