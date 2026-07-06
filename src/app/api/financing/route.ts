import { NextResponse } from "next/server";
import { sendFormEmail } from "@/lib/email";

export async function POST(request: Request) {
  const data = await request.json();
  const { sent, error } = await sendFormEmail("Financing Application", data);

  if (error || !sent) {
    return NextResponse.json({ error: "Failed to submit application." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
