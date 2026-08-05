import { NextResponse } from "next/server";
import { SITE } from "@/lib/constants";
import { sendFormEmail } from "@/lib/email";
import { checkFormSpam } from "@/lib/spam";

export async function POST(request: Request) {
  const data = (await request.json()) as Record<string, unknown>;
  const check = checkFormSpam(data, request, { kind: "contact" });

  if (!check.ok) {
    if (check.silent) {
      return NextResponse.json({
        success: true,
        message: `Thank you for contacting ${SITE.name}. We will respond shortly.`,
      });
    }
    return NextResponse.json({ error: "Invalid submission. Please check your details." }, { status: 400 });
  }

  const { sent, error } = await sendFormEmail("Contact Form", check.clean);

  if (error) {
    return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
  }

  if (!sent) {
    return NextResponse.json(
      { error: "Email service not configured. Please call us directly." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    sent,
    message: `Thank you for contacting ${SITE.name}. We will respond shortly.`,
  });
}
