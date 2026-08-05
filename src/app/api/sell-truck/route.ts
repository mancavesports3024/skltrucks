import { NextResponse } from "next/server";
import { sendFormEmail } from "@/lib/email";
import { checkFormSpam } from "@/lib/spam";

export async function POST(request: Request) {
  const data = (await request.json()) as Record<string, unknown>;
  const check = checkFormSpam(data, request, { kind: "sell-truck" });

  if (!check.ok) {
    if (check.silent) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Invalid submission. Please check your details." }, { status: 400 });
  }

  const { sent, error } = await sendFormEmail("Sell My Truck", check.clean);

  if (error || !sent) {
    return NextResponse.json({ error: "Failed to submit form." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
