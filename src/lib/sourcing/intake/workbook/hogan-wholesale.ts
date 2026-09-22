import {
  classifyBodyKind,
  extractBoxLengthFt,
  isAutomaticTransmission,
  isCumminsEngine,
  normalizeMake,
  parseLiftgate,
  parseMileage,
  parseOsLocation,
  parsePrice,
  parseWeightLbs,
  parseYear,
  type BodyKind,
} from "@/lib/sourcing/intake/workbook/normalize";
import type { SpecEvidence } from "@/types/sourcing";

export const HOGAN_WHOLESALE_SCOPE = "hogan-wholesale";

/** Only HTTPS inspection-report hosts accepted for Hogan 3rd-party insp links. */
export const HOGAN_INSPECTION_ALLOWED_HOSTS = [
  "inspection-reports.example.test", // synthetic fixtures
  "reports.nationalinspect.com",
  "nationalinspect.com",
  "www.nationalinspect.com",
  "www.fleetinspect.com",
  "fleetinspect.com",
  "app.fleetinspect.com",
  "reports.rwis.com",
  "www.rwis.com",
  "inspect.rigdig.com",
  "www.rigdig.com",
] as const;

function get(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const found = row[key];
    if (found != null && String(found).trim() !== "") return String(found).trim();
  }
  return "";
}

export function validateInspectionUrl(raw: string): {
  ok: boolean;
  url: string;
  error?: string;
} {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: true, url: "" };
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, url: "", error: "Inspection link is not a valid URL." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, url: "", error: "Inspection link must be HTTPS." };
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = HOGAN_INSPECTION_ALLOWED_HOSTS.some(
    (h) => host === h || host.endsWith(`.${h}`)
  );
  if (!allowed) {
    return {
      ok: false,
      url: "",
      error: `Inspection link host "${host}" is not an allowed inspection-report hostname.`,
    };
  }
  return { ok: true, url: parsed.toString() };
}

export interface HoganWholesaleMapped {
  sourceScope: typeof HOGAN_WHOLESALE_SCOPE;
  sourceListingId: string;
  stockNumber: string;
  productName: string;
  year: number | null;
  makeModel: string;
  bodyKind: BodyKind;
  boxLengthFt: number | null;
  boxLengthRaw: string;
  bodyRejectReason: string | null;
  mileage: number | null;
  price: number | null;
  location: string;
  looksCanadian: boolean;
  gvwLbs: number | null;
  gvwRaw: string;
  engine: string;
  engineIsCummins: boolean | null;
  transmission: string;
  transmissionIsAutomatic: boolean | null;
  hasLiftgate: boolean | null;
  liftgateNotes: string;
  doorConfig: string;
  description: string;
  osStatus: string;
  completionStatus: string;
  salesTerms: string;
  thirdPartyInspLabel: string;
  inspectionUrl: string;
  inspectionUrlError: string | null;
  evidence: SpecEvidence;
  notes: string[];
}

export function mapHoganWholesaleRow(row: Record<string, string>): HoganWholesaleMapped | null {
  const unit = get(row, "unit", "unit_number", "unit_");
  if (!unit) return null;

  const productName = get(row, "product_name");
  const year = parseYear(get(row, "year"));
  const make = normalizeMake(get(row, "make"));
  const model = get(row, "model");
  const miles = parseMileage(get(row, "miles_hrs", "miles_hrs_", "miles", "mileage"));
  const price = parsePrice(get(row, "wholesale_price", "price"));
  const engineRaw = get(row, "engine");
  const transRaw = get(row, "transmission");
  const lengthRaw = get(row, "length", "box_length");
  const liftRaw = get(row, "lift_gate", "liftgate");
  const doorConfig = get(row, "door_config", "door_config_");
  const gvwRaw = get(row, "gvw", "gvw_");
  const gvwLbs = parseWeightLbs(gvwRaw);
  const description = get(row, "description");
  const osStatus = get(row, "o_s_status", "os_status");
  const osLocationRaw = get(row, "os_location", "o_s_location");
  const salesTerms = get(row, "sale_terms", "sales_terms");
  const thirdPartyInspLabel = get(row, "3rd_party_insp", "third_party_insp", "3rd_party_inspection");
  const hyperlink = get(row, "inspection_hyperlink", "inspection_url");

  const loc = parseOsLocation(osLocationRaw);
  const engine = engineRaw.replace(/\s+/g, " ").trim();
  // CUMMINS ISB 6.7 → Cummins with original evidence retained
  const engineIsCummins = isCumminsEngine(engine);
  const transmission = transRaw.replace(/\s+/g, " ").trim();
  const transmissionIsAutomatic = isAutomaticTransmission(transmission);

  const bodyBlob = `${productName} ${description} ${model}`;
  const bodyKind = classifyBodyKind(bodyBlob);
  const boxFromLength = extractBoxLengthFt(lengthRaw);
  const boxFromDesc = extractBoxLengthFt(description) ?? extractBoxLengthFt(productName);
  let boxLengthFt = boxFromLength ?? boxFromDesc;
  let bodyRejectReason: string | null = null;
  let boxLengthRaw = lengthRaw || (boxLengthFt != null ? `${boxLengthFt}'` : "");

  if (bodyKind === "reefer" || bodyKind === "flatbed" || bodyKind === "other") {
    bodyRejectReason = `${bodyKind.replace("_", " ")} body is not a qualifying dry van`;
    boxLengthFt = 0;
    boxLengthRaw = bodyBlob.trim() || bodyKind;
  }

  const lift = parseLiftgate(liftRaw);
  const insp = validateInspectionUrl(hyperlink);

  const completionStatus = osStatus || thirdPartyInspLabel;
  const evidence: SpecEvidence = {
    engine: engine || "",
    transmission: transmission || "",
    boxLength:
      bodyRejectReason ||
      (boxLengthFt != null && boxLengthFt > 0
        ? `Length ${lengthRaw || boxLengthFt} → ${boxLengthFt}'`
        : lengthRaw || description),
    gvwr: gvwRaw ? `GVW ${gvwRaw}` : "",
    inspectionUrl: insp.ok ? insp.url : "",
    workbookStatus: completionStatus,
    salesTerms,
  };

  const notes: string[] = [];
  notes.push(
    `Hogan wholesale Unit ${unit} (authorized workbook; scoped unit id — VIN not provided in main table).`
  );
  if (productName) notes.push(`Product: ${productName}`);
  if (description) notes.push(description);
  if (osStatus) notes.push(`O/S status: ${osStatus}`);
  if (completionStatus) {
    notes.push(
      `Completion/inspection label: ${completionStatus} (not treated as proof of current availability).`
    );
  }
  if (salesTerms) notes.push(`Sale terms: ${salesTerms}`);
  if (doorConfig) notes.push(`Door config: ${doorConfig}`);
  if (insp.ok && insp.url) {
    notes.push("Third-party inspection HTTPS link retained in evidence (not used as listing URL).");
  } else if (insp.error) {
    notes.push(insp.error);
  }
  if (loc.looksCanadian) {
    notes.push("Canadian location — not assumed inside Joplin radius.");
  }
  if (bodyRejectReason) notes.push(bodyRejectReason);
  if (gvwRaw) {
    notes.push(
      "Workbook GVW used for weight classification with evidence retained; door-plate GVWR still recommended at purchase."
    );
  }

  return {
    sourceScope: HOGAN_WHOLESALE_SCOPE,
    sourceListingId: unit,
    stockNumber: unit,
    productName,
    year,
    makeModel: [make, model].filter(Boolean).join(" ").trim() || productName,
    bodyKind,
    boxLengthFt,
    boxLengthRaw,
    bodyRejectReason,
    mileage: miles,
    price,
    location: loc.location,
    looksCanadian: loc.looksCanadian,
    gvwLbs,
    gvwRaw,
    engine,
    engineIsCummins,
    transmission,
    transmissionIsAutomatic,
    hasLiftgate: lift.hasLiftgate,
    liftgateNotes: lift.notes,
    doorConfig,
    description,
    osStatus,
    completionStatus,
    salesTerms,
    thirdPartyInspLabel,
    inspectionUrl: insp.ok ? insp.url : "",
    inspectionUrlError: insp.error ?? null,
    evidence,
    notes,
  };
}