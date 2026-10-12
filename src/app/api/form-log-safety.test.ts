import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(),
    })),
  },
}));

import nodemailer from "nodemailer";
import { POST as contactPost } from "@/app/api/contact/route";
import { POST as financingPost } from "@/app/api/financing/route";
import { POST as sellTruckPost } from "@/app/api/sell-truck/route";
import { sendFormEmail } from "@/lib/email";

const createTransport = vi.mocked(nodemailer.createTransport);

/** Clearly fake values. Tests fail if any of these show up in logs or error responses. */
const SENSITIVE_VALUES = [
  "Exampleperson",
  "Pat Exampleperson",
  "Gina Exampleperson",
  "pat.exampleperson@example.test",
  "555-014-0198",
  "000-00-0000",
  "00-0000000",
  "Example Community Bank",
  "balance-token-44021",
  "checking-token-44021",
  "Pat Exampleperson signature",
  "fake-message-body-token-44021",
  "fake-comments-body-token-44021",
] as const;

const CONTACT = {
  name: "Pat Exampleperson",
  email: "pat.exampleperson@example.test",
  phone: "555-014-0198",
  message: "fake-message-body-token-44021",
};

const SELL = {
  intent: "sell",
  firstName: "Pat",
  lastName: "Exampleperson",
  email: "pat.exampleperson@example.test",
  phone: "555-014-0198",
  city: "Exampleville",
  state: "MO",
  comments: "fake-comments-body-token-44021",
};

const FINANCING = {
  companyName: "Example Trucking Co",
  federalTaxId: "00-0000000",
  contactName: "Pat Exampleperson",
  phone: "555-014-0198",
  email: "pat.exampleperson@example.test",
  street: "100 Example Ave",
  city: "Exampleville",
  bankName: "Example Community Bank",
  avgBalance: "balance-token-44021",
  checking: "checking-token-44021",
  guarantor1Name: "Gina Exampleperson",
  guarantor1SSN: "000-00-0000",
  signature1: "Pat Exampleperson signature",
};

const MAIL_ENV_KEYS = ["EMAIL_USER", "EMAIL_PASSWORD", "RECIPIENT_EMAIL", "CONTACT_EMAIL_TO"] as const;
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function watchConsole() {
  const lines: string[] = [];
  const spies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(stringifyArg).join(" "));
    })
  );
  return {
    text: () => lines.join("\n"),
    restore: () => {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

function expectNoSensitive(text: string) {
  for (const value of SENSITIVE_VALUES) {
    expect(text).not.toContain(value);
  }
}

function jsonRequest(path: string, body: Record<string, unknown>, ip: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("public form log safety", () => {
  const sendMail = vi.fn();
  let savedEnv: Partial<Record<(typeof MAIL_ENV_KEYS)[number], string | undefined>>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of MAIL_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    sendMail.mockReset();
    createTransport.mockReset();
    createTransport.mockReturnValue({ sendMail } as never);
  });

  afterEach(() => {
    for (const key of MAIL_ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("does not log a submission or claim delivery when mail is not configured", async () => {
    const logs = watchConsole();
    try {
      const direct = await sendFormEmail("Financing Application", FINANCING);
      expect(direct).toEqual({ sent: false, error: "Email service not configured" });

      const contact = await contactPost(jsonRequest("/api/contact", CONTACT, "203.0.113.10"));
      const financing = await financingPost(jsonRequest("/api/financing", FINANCING, "203.0.113.11"));
      const sell = await sellTruckPost(jsonRequest("/api/sell-truck", SELL, "203.0.113.12"));

      expect(contact.status).toBe(500);
      expect(financing.status).toBe(500);
      expect(sell.status).toBe(500);

      const contactBody = await contact.json();
      const financingBody = await financing.json();
      const sellBody = await sell.json();

      expect(contactBody).toEqual({ error: "Failed to send message." });
      expect(financingBody).toEqual({ error: "Failed to submit application." });
      expect(sellBody).toEqual({ error: "Failed to submit form." });

      const recorded = [
        logs.text(),
        JSON.stringify(direct),
        JSON.stringify(contactBody),
        JSON.stringify(financingBody),
        JSON.stringify(sellBody),
      ].join("\n");
      expectNoSensitive(recorded);
      expect(recorded).not.toMatch(/thank you|submitted successfully/i);
      expect(createTransport).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
      expect(logs.text()).toBe("");
    } finally {
      logs.restore();
    }
  });

  it("keeps provider errors that echo a submission out of logs and responses", async () => {
    process.env.EMAIL_USER = "staff@example.test";
    process.env.EMAIL_PASSWORD = "fake-mailbox-password";
    process.env.RECIPIENT_EMAIL = "inbox@example.test";
    sendMail.mockRejectedValue(new Error(SENSITIVE_VALUES.join(" | ")));

    const logs = watchConsole();
    try {
      const direct = await sendFormEmail("Financing Application", FINANCING);
      expect(direct).toEqual({ sent: false, error: "Failed to send email" });

      const financing = await financingPost(jsonRequest("/api/financing", FINANCING, "203.0.113.21"));
      expect(financing.status).toBe(500);
      const financingBody = await financing.json();
      expect(financingBody).toEqual({ error: "Failed to submit application." });

      const contact = await contactPost(jsonRequest("/api/contact", CONTACT, "203.0.113.22"));
      expect(contact.status).toBe(500);
      const contactBody = await contact.json();
      expect(contactBody).toEqual({ error: "Failed to send message." });

      const sell = await sellTruckPost(jsonRequest("/api/sell-truck", SELL, "203.0.113.23"));
      expect(sell.status).toBe(500);
      const sellBody = await sell.json();
      expect(sellBody).toEqual({ error: "Failed to submit form." });

      const recorded = [
        logs.text(),
        JSON.stringify(direct),
        JSON.stringify(financingBody),
        JSON.stringify(contactBody),
        JSON.stringify(sellBody),
      ].join("\n");
      expectNoSensitive(recorded);
      expect(logs.text()).toBe("[email] Gmail send failed\n[email] Gmail send failed\n[email] Gmail send failed\n[email] Gmail send failed");
      expect(sendMail).toHaveBeenCalledTimes(4);
    } finally {
      logs.restore();
    }
  });
});
