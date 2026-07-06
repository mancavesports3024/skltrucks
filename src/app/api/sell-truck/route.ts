import { NextResponse } from "next/server";
import { sendFormEmail } from "@/lib/email";

export async function POST(request: Request) {
  const data = await request.json();
  const { sent, error } = await sendFormEmail("Sell My Truck", data);

  if (error || !sent) {
    return NextResponse.json({ error: "Failed to submit form." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
