import {
  classifyBodyKind,
  extractBoxLengthFt,
  isAutomaticTransmission,
  isCumminsEngine,
  normalizeEngineMake,
  normalizeMake,
  parseLiftgate,
  parseMileage,
  parsePrice,
  parseWeightLbs,
  parseYear,
  type BodyKind,
} from "@/lib/sourcing/intake/workbook/normalize";
import type { SpecEvidence } from "@/types/sourcing";

export const PENSKE_PREAUCTION_SCOPE = "penske-preauction";

function get(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const found = row[key];
    if (found != null && String(found).trim() !== "") return String(found).trim();
  }
  return "";
}

export interface PenskePreauctionMapped {
  sourceScope: typeof PENSKE_PREAUCTION_SCOPE;
  sourceListingId: string;
  stockNumber: string;
  vin: string;
  year: number | null;
  makeModel: string;
  make: string;
  model: string;
  type: string;
  description: string;
  bodyKind: BodyKind;
  boxLengthFt: number | null;
  boxLengthRaw: string;
  bodyRejectReason: string | null;
  mileage: number | null;
  price: number | null;
  location: string;
  city: string;
  state: string;
  gvwLbs: number | null;
  gvwRaw: string;
  engine: string;
  engineIsCummins: boolean | null;
  transmission: string;
  transmissionIsAutomatic: boolean | null;
  hasLiftgate: boolean | null;
  liftgateNotes: string;
  salesTerms: string;
  penskeStatus: string;
  titleStatus: string;
  comments: string;
  evidence: SpecEvidence;
  notes: string[];
}

export function mapPenskePreauctionRow(row: Record<string, string>): PenskePreauctionMapped | null {
  const unit = get(row, "unit", "unit_number");
  if (!unit) return null;

  const vin = get(row, "vin", "vin_number").toUpperCase().replace(/\s+/g, "");
  const year = parseYear(get(row, "year"));
  const make = normalizeMake(get(row, "make"));
  const model = get(row, "model");
  const type = get(row, "type");
  const description = get(row, "description");
  const miles = parseMileage(get(row, "miles", "ltd_miles", "mileage"));
  const price = parsePrice(get(row, "price", "sale_price", "wholesale_price"));
  const city = get(row, "city", "area_name");
  const state = get(row, "state");
  const gvwRaw = get(row, "gvw", "gvw_lbs", "gvw_(lbs)", "gross_vehicle_weight");
  const gvwLbs = parseWeightLbs(gvwRaw);
  const engMake = normalizeEngineMake(get(row, "engine_make", "eng_make", "eng_mfr"));
  const engModel = get(row, "engine_model", "eng_model");
  const trans = get(row, "trans", "transmission", "trans_type");
  const transMake = get(row, "trans_make");
  const transModel = get(row, "trans_model");
  const liftRaw = get(row, "liftgate", "lift_gate");
  const liftModel = get(row, "liftgate_model", "lift_gate_model");
  const liftCap = get(row, "liftgate_cap", "lift_gate_cap", "liftgate_capacity");
  const salesTerms = get(row, "sales_terms", "sale_terms");
  const penskeStatus = get(row, "penske_status", "status");
  const titleStatus = get(row, "title_status");
  const comments = get(row, "comments");

  const engineParts = [engMake, engModel].filter(Boolean);
  const engine = engineParts.join(" ").trim();
  const transParts = [
    trans.toUpperCase() === "AUTO" ? "Automatic" : trans,
    transMake,
    transModel,
  ].filter(Boolean);
  const transmission = transParts.join(" ").trim();

  const bodyBlob = `${type} ${description}`;
  const bodyKind = classifyBodyKind(bodyBlob);
  const boxFromDesc = extractBoxLengthFt(description) ?? extractBoxLengthFt(type);
  let boxLengthFt: number | null = boxFromDesc;
  let bodyRejectReason: string | null = null;
  let boxLengthRaw = boxFromDesc != null ? `${boxFromDesc}'` : description || type;

  if (bodyKind === "reefer" || bodyKind === "flatbed" || bodyKind === "other") {
    bodyRejectReason = `${bodyKind.replace("_", " ")} body is not a qualifying dry van`;
    boxLengthFt = 0; // force box_length fail in classifier
    boxLengthRaw = bodyBlob.trim() || bodyKind;
  } else if (bodyKind === "dry_van" && boxLengthFt == null) {
    boxLengthRaw = description || type || "VAN";
  }

  const liftCombined = [liftRaw, liftModel, liftCap].filter(Boolean).join(" ");
  const lift = parseLiftgate(liftCombined || liftRaw);

  const evidence: SpecEvidence = {
    engine: engine || "",
    transmission: transmission || "",
    boxLength:
      bodyRejectReason ||
      (boxFromDesc != null ? `${description || type} → ${boxFromDesc}'` : description || type),
    gvwr: gvwRaw ? `GVW ${gvwRaw}` : "",
    workbookStatus: penskeStatus,
    salesTerms,
    penskeStatus,
    titleStatus,
  };

  const notes: string[] = [];
  notes.push(`Penske pre-auction Unit ${unit} (authorized workbook; no public listing URL invented).`);
  if (type) notes.push(`Type: ${type}`);
  if (description) notes.push(`Description: ${description}`);
  if (comments) notes.push(comments);
  if (salesTerms) notes.push(`Sales terms: ${salesTerms}`);
  if (titleStatus) notes.push(`Title status: ${titleStatus}`);
  if (bodyRejectReason) notes.push(bodyRejectReason);
  if (gvwRaw) {
    notes.push(
      "Workbook GVW used for weight classification with evidence retained; door-plate GVWR still recommended at purchase."
    );
  }

  return {
    sourceScope: PENSKE_PREAUCTION_SCOPE,
    sourceListingId: unit,
    stockNumber: unit,
    vin,
    year,
    makeModel: [make, model].filter(Boolean).join(" ").trim(),
    make,
    model,
    type,
    description,
    bodyKind,
    boxLengthFt,
    boxLengthRaw,
    bodyRejectReason,
    mileage: miles,
    price,
    location: [city, state].filter(Boolean).join(", "),
    city,
    state,
    gvwLbs,
    gvwRaw,
    engine,
    engineIsCummins: isCumminsEngine(`${engMake} ${engModel} ${engine}`),
    transmission,
    transmissionIsAutomatic: isAutomaticTransmission(transmission || trans),
    hasLiftgate: lift.hasLiftgate,
    liftgateNotes: lift.notes,
    salesTerms,
    penskeStatus,
    titleStatus,
    comments,
    evidence,
    notes,
  };
}