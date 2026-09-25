/**
 * Shared dry-box buying-profile body policy.
 * SKL sources dry van / dry box only — positive refrigerated/reefer evidence rejects.
 * Used by classifyLead, workbook intake, Discovery Preview/Import, and search mapping.
 */
import type { MatchReason, SpecEvidence } from "@/types/sourcing";

export const REFRIGERATED_BODY_OUTSIDE_PROFILE =
  "Refrigerated/reefer body is outside SKL buying profile.";

/** Negated refrigeration phrasing that must not count as positive evidence. */
const REFRIGERATED_NEGATION_RE =
  /\b(?:not|non)[-\s]?refrigerat(?:ed|ion|e|ing|es)?\b|\bwithout\s+refrigerat(?:ed|ion)?\b|\bno\s+refrigerat(?:ed|ion)?\b/gi;

/**
 * Positive refrigerated-body evidence (after negations are scrubbed).
 * "insulated" alone is NOT enough — requires reefer / refrigerat*.
 */
const REFRIGERATED_POSITIVE_RE =
  /\breefer(?:s|ed|ing)?\b|\brefrigerat(?:ed|ion|e|ing|es)\b/i;

/**
 * True when text contains positive refrigerated/reefer body evidence.
 * Avoids false positives for "not refrigerated" / "non-refrigerated".
 */
export function hasPositiveRefrigeratedBodyEvidence(text: string): boolean {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  const scrubbed = raw.replace(REFRIGERATED_NEGATION_RE, " ");
  return REFRIGERATED_POSITIVE_RE.test(scrubbed);
}

export type BodyEvidenceParts = {
  makeModel?: string | null;
  boxLengthRaw?: string | null;
  verificationNotes?: string | null;
  sklCallNotes?: string | null;
  notes?: string | null;
  liftgateNotes?: string | null;
  engine?: string | null;
  transmission?: string | null;
  sourceUrl?: string | null;
  listingUrl?: string | null;
  title?: string | null;
  bodyDescription?: string | null;
  bodyEvidenceText?: string | null;
  specEvidence?: Partial<SpecEvidence> | null;
};

/** Concatenate listing-backed text used for dry-box / reefer detection. */
export function collectBodyEvidenceText(parts: BodyEvidenceParts): string {
  const chunks: string[] = [];
  const push = (v: string | null | undefined) => {
    const s = String(v ?? "").trim();
    if (s) chunks.push(s);
  };
  push(parts.bodyEvidenceText);
  push(parts.title);
  push(parts.makeModel);
  push(parts.bodyDescription);
  push(parts.boxLengthRaw);
  push(parts.verificationNotes);
  push(parts.sklCallNotes);
  push(parts.notes);
  push(parts.liftgateNotes);
  push(parts.engine);
  push(parts.transmission);
  push(parts.sourceUrl);
  push(parts.listingUrl);
  if (parts.specEvidence) {
    push(parts.specEvidence.boxLength);
    push(parts.specEvidence.engine);
    push(parts.specEvidence.transmission);
    push(parts.specEvidence.gvwr);
    push(parts.specEvidence.distance);
  }
  return chunks.join("\n");
}

export function refrigeratedBodyRejectReason(): MatchReason {
  return {
    code: "dry_box_body",
    label: REFRIGERATED_BODY_OUTSIDE_PROFILE,
    outcome: "fail",
    required: true,
  };
}

/**
 * Workbook / intake body-kind classification using the shared reefer detector.
 */
export type BodyKind = "dry_van" | "reefer" | "flatbed" | "other" | "unknown";

export function classifyBodyKind(typeOrDescription: string): BodyKind {
  const t = typeOrDescription.trim().toLowerCase();
  if (!t) return "unknown";
  if (hasPositiveRefrigeratedBodyEvidence(t)) return "reefer";
  if (/\bflat\s*bed\b|\bflatbed\b/.test(t)) return "flatbed";
  if (/\bvan\b|\bbox\b|\bdry\b/.test(t) && !hasPositiveRefrigeratedBodyEvidence(t)) {
    return "dry_van";
  }
  if (/\bother\b/.test(t)) return "other";
  return "unknown";
}

export function workbookBodyRejectReason(bodyKind: BodyKind): string | null {
  if (bodyKind === "reefer") return REFRIGERATED_BODY_OUTSIDE_PROFILE;
  if (bodyKind === "flatbed" || bodyKind === "other") {
    return `${bodyKind.replace("_", " ")} body is not a qualifying dry van`;
  }
  return null;
}
