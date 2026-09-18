import type { SpecEvidence } from "@/types/sourcing";

export const INTAKE_SOURCE_IDS = [
  "penske-used-trucks",
  "ryder-fleet-remarketing",
  "regional-dealer-csv",
  "staff-reviewed-csv",
] as const;

export type IntakeSourceId = (typeof INTAKE_SOURCE_IDS)[number];

export type IntakeAccessMethod =
  | "dealer_feed"
  | "supplier_email"
  | "csv_export"
  | "api"
  | "staff_reviewed_csv"
  | "not_available";

export interface IntakeSourceProfile {
  id: IntakeSourceId;
  name: string;
  summary: string;
  /** How SKL can obtain individual listings today (not category pages). */
  accessMethods: {
    method: IntakeAccessMethod;
    available: boolean;
    notes: string;
  }[];
  /** True only when a dependable automated feed is already authorized. */
  automationReady: boolean;
  defaultSourceScope: string;
}

/**
 * Realistic recurring box-truck sources. Public search pages are documented as
 * non-feeds — do not scrape them without an established permitted access method.
 */
export const INTAKE_SOURCES: IntakeSourceProfile[] = [
  {
    id: "penske-used-trucks",
    name: "Penske Used Trucks",
    summary:
      "National fleet wholesale inventory. Weekly emailed inventory via dealer sales rep is the permitted recurring channel once SKL is registered.",
    accessMethods: [
      {
        method: "supplier_email",
        available: true,
        notes:
          "Ask the assigned Penske dealer sales rep to email inventory weekly (documented dealer offering).",
      },
      {
        method: "csv_export",
        available: false,
        notes: "No public CSV download documented — request spreadsheet attachment from the rep.",
      },
      {
        method: "api",
        available: false,
        notes: "No public listing API identified for general use.",
      },
      {
        method: "dealer_feed",
        available: false,
        notes: "Wholesale/auction dealer portal exists after license verification; not wired here.",
      },
    ],
    automationReady: false,
    defaultSourceScope: "penske-used-trucks",
  },
  {
    id: "ryder-fleet-remarketing",
    name: "Ryder (fleet remarketing)",
    summary:
      "National fleet remarketing. Individual units arrive via account manager / wholesale email once a relationship exists.",
    accessMethods: [
      {
        method: "supplier_email",
        available: true,
        notes: "Account manager can send individual box-truck opportunities by email.",
      },
      {
        method: "csv_export",
        available: false,
        notes: "Possible only if Ryder grants an explicit export; not assumed.",
      },
      {
        method: "api",
        available: false,
        notes: "No public API identified for automated daily intake.",
      },
    ],
    automationReady: false,
    defaultSourceScope: "ryder-fleet-remarketing",
  },
  {
    id: "regional-dealer-csv",
    name: "Regional dealers (DeBary, Miller, etc.)",
    summary:
      "Dealers SKL already calls. Best dependable path is a dealer-agreed CSV or emailed individual listing URLs.",
    accessMethods: [
      {
        method: "supplier_email",
        available: true,
        notes: "Dealer emails stock numbers + listing URLs (already used manually).",
      },
      {
        method: "csv_export",
        available: true,
        notes: "When a dealer agrees to send a spreadsheet of current box trucks.",
      },
      {
        method: "api",
        available: false,
        notes: "Uncommon for small regional dealers.",
      },
    ],
    automationReady: false,
    defaultSourceScope: "regional-dealer",
  },
  {
    id: "staff-reviewed-csv",
    name: "Staff-reviewed CSV (pilot)",
    summary:
      "Fallback until a source grants a dependable automated feed. Staff paste/upload listings obtained by email or export.",
    accessMethods: [
      {
        method: "staff_reviewed_csv",
        available: true,
        notes: "Implemented in this pilot at /admin/sourcing/intake.",
      },
    ],
    automationReady: false,
    defaultSourceScope: "staff-csv",
  },
];

export function emptySpecEvidence(): SpecEvidence {
  return {
    engine: "",
    transmission: "",
    boxLength: "",
    gvwr: "",
  };
}

export function normalizeSpecEvidence(raw: unknown): SpecEvidence {
  const base = emptySpecEvidence();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  return {
    engine: String(obj.engine ?? obj.engine_evidence ?? "").trim(),
    transmission: String(obj.transmission ?? obj.transmission_evidence ?? "").trim(),
    boxLength: String(obj.boxLength ?? obj.box_length ?? obj.box_length_evidence ?? "").trim(),
    gvwr: String(obj.gvwr ?? obj.gvwr_evidence ?? "").trim(),
  };
}
