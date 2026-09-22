import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(),
    })),
  },
}));

import nodemailer from "nodemailer";
import {
  MAX_REPLY_TO_EMAIL_LENGTH,
  sanitizeReplyToEmail,
  sendFormEmail,
} from "@/lib/email";

const createTransport = vi.mocked(nodemailer.createTransport);

describe("sanitizeReplyToEmail", () => {
  it("accepts normal single mailbox addresses", () => {
    expect(sanitizeReplyToEmail("buyer@example.com")).toBe("buyer@example.com");
    expect(sanitizeReplyToEmail("  Buyer.Name+fleet@dealer.example.org ")).toBe(
      "Buyer.Name+fleet@dealer.example.org"
    );
  });

  it("rejects malformed, multi-recipient, and overlong values before Nodemailer", () => {
    expect(sanitizeReplyToEmail(undefined)).toBeUndefined();
    expect(sanitizeReplyToEmail(null)).toBeUndefined();
    expect(sanitizeReplyToEmail("")).toBeUndefined();
    expect(sanitizeReplyToEmail("not-an-email")).toBeUndefined();
    expect(sanitizeReplyToEmail("a@b")).toBeUndefined();
    expect(sanitizeReplyToEmail("a@b.c")).toBeUndefined();
    expect(sanitizeReplyToEmail("a b@example.com")).toBeUndefined();
    expect(sanitizeReplyToEmail("a@example.com,b@example.com")).toBeUndefined();
    expect(sanitizeReplyToEmail("a@example.com;b@example.com")).toBeUndefined();
    expect(sanitizeReplyToEmail("Name <a@example.com>")).toBeUndefined();
    expect(sanitizeReplyToEmail("a@example.com\nbcc:evil@example.com")).toBeUndefined();
    expect(sanitizeReplyToEmail(`${"a".repeat(MAX_REPLY_TO_EMAIL_LENGTH)}@x.com`)).toBeUndefined();
    expect(
      sanitizeReplyToEmail(`${"a".repeat(60)}@${"b".repeat(200)}.com`)
    ).toBeUndefined();
  });
});

describe("sendFormEmail replyTo handling", () => {
  const sendMail = vi.fn();

  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockReset();
    createTransport.mockReturnValue({ sendMail } as never);
    process.env.EMAIL_USER = "skl@example.com";
    process.env.EMAIL_PASSWORD = "test-password";
    process.env.RECIPIENT_EMAIL = "inbox@skltrucks.com";
    sendMail.mockResolvedValue({ messageId: "1" });
  });

  it("passes a sanitized replyTo for normal form emails", async () => {
    const result = await sendFormEmail("Contact Form", {
      email: "customer@dealer.com",
      name: "Pat",
      message: "Need a 26ft box",
    });
    expect(result.sent).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const payload = sendMail.mock.calls[0][0];
    expect(payload.replyTo).toBe("customer@dealer.com");
    expect(payload.to).toBe("inbox@skltrucks.com");
  });

  it("omits replyTo when the address is malformed or excessively long", async () => {
    const result = await sendFormEmail("Contact Form", {
      email: "bad,".repeat(80) + "@example.com",
      name: "Bot",
    });
    expect(result.sent).toBe(true);
    const payload = sendMail.mock.calls[0][0];
    expect(payload.replyTo).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(payload, "replyTo")).toBe(false);
  });
});
