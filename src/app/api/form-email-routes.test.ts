import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  sendFormEmail: vi.fn(),
}));

vi.mock("@/lib/spam", async () => {
  const actual = await vi.importActual<typeof import("@/lib/spam")>("@/lib/spam");
  return {
    ...actual,
    checkFormSpam: vi.fn(),
  };
});

import { sendFormEmail } from "@/lib/email";
import { checkFormSpam } from "@/lib/spam";
import { POST as contactPost } from "@/app/api/contact/route";
import { POST as financingPost } from "@/app/api/financing/route";
import { POST as sellTruckPost } from "@/app/api/sell-truck/route";

const mockedSend = vi.mocked(sendFormEmail);
const mockedSpam = vi.mocked(checkFormSpam);

function jsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("public form email routes", () => {
  beforeEach(() => {
    mockedSend.mockReset();
    mockedSpam.mockReset();
    mockedSpam.mockReturnValue({
      ok: true,
      clean: {
        email: "buyer@example.com",
        name: "Buyer",
        message: "Hello",
      },
    });
    mockedSend.mockResolvedValue({ sent: true });
  });

  it("contact route emails cleaned payloads", async () => {
    const res = await contactPost(jsonRequest({ email: "buyer@example.com" }));
    expect(res.status).toBe(200);
    expect(mockedSend).toHaveBeenCalledWith(
      "Contact Form",
      expect.objectContaining({ email: "buyer@example.com" })
    );
  });

  it("financing route emails cleaned payloads", async () => {
    const res = await financingPost(jsonRequest({ email: "buyer@example.com" }));
    expect(res.status).toBe(200);
    expect(mockedSend).toHaveBeenCalledWith(
      "Financing Application",
      expect.objectContaining({ email: "buyer@example.com" })
    );
  });

  it("sell-truck route emails cleaned payloads", async () => {
    const res = await sellTruckPost(jsonRequest({ email: "buyer@example.com" }));
    expect(res.status).toBe(200);
    expect(mockedSend).toHaveBeenCalledWith(
      "Sell My Truck",
      expect.objectContaining({ email: "buyer@example.com" })
    );
  });

  it("rejects invalid submissions without calling email", async () => {
    mockedSpam.mockReturnValue({ ok: false, silent: false, reason: "bad_email" });
    const res = await contactPost(jsonRequest({ email: "nope" }));
    expect(res.status).toBe(400);
    expect(mockedSend).not.toHaveBeenCalled();
  });
});
