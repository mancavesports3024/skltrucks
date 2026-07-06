import { NextResponse } from "next/server";
import { SITE } from "@/lib/constants";
import { sendFormEmail } from "@/lib/email";

export async function POST(request: Request) {
  const data = await request.json();
  const { sent, error } = await sendFormEmail("Contact Form", data);

  if (error) {
    return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    sent,
    message: `Thank you for contacting ${SITE.name}. We will respond shortly.`,
  });
}
