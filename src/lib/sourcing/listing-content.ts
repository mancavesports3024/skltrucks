import type { ListedWeightTerm, TruckLead, TruckLeadInput } from "@/types/sourcing";

/** Fields that represent the published listing — not staff workflow/notes. */
export const LISTING_CONTENT_FIELDS = [
  "seller",
  "sourceUrl",
  "sourceScope",
  "sourceListingId",
  "canonicalListingUrl",
  "stockNumber",
  "vin",
  "year",
  "makeModel",
  "boxLengthFt",
  "boxLengthRaw",
  "engine",
  "engineIsCummins",
  "transmission",
  "transmissionIsAutomatic",
  "listedWeightLbs",
  "listedWeightTerm",
  "manufacturerGvwrLbs",
  "gvwrDoorPlateVerified",
  "mileage",
  "hasLiftgate",
  "liftgateNotes",
  "price",
  "location",
  "drivingDistanceMiles",
  "distanceIsEstimate",
] as const;

export type ListingContentField = (typeof LISTING_CONTENT_FIELDS)[number];

export type ListingContentSnapshot = Pick<TruckLeadInput, ListingContentField>;

function norm(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  return String(value).trim();
}

/** Stable fingerprint of listing-significant fields for change detection. */
export function listingContentFingerprint(
  lead: Partial<ListingContentSnapshot> & {
    listedWeightTerm?: ListedWeightTerm;
  }
): string {
  return LISTING_CONTENT_FIELDS.map((key) => `${key}=${norm(lead[key])}`).join("|");
}

export function listingContentChanged(
  before: Partial<ListingContentSnapshot>,
  after: Partial<ListingContentSnapshot>
): boolean {
  return listingContentFingerprint(before) !== listingContentFingerprint(after);
}

export type DigestEventKind = "new_listing" | "listing_change" | "seen_again";

export interface DigestLeadEvent {
  lead: TruckLead;
  kind: DigestEventKind;
  at: string;
}

/**
 * Include a lead in the daily digest for discovery, meaningful listing changes,
 * or re-observation (seen again) of an unchanged older listing.
 * Staff call notes, verification notes, workflow edits, and match recalculation alone
 * do not qualify (they touch updated_at but not listing timestamps).
 */
export function selectDigestLeadEvents(
  leads: TruckLead[],
  windowStart: Date,
  windowEnd: Date
): DigestLeadEvent[] {
  const start = windowStart.getTime();
  const end = windowEnd.getTime();
  const events: DigestLeadEvent[] = [];

  for (const lead of leads) {
    const firstSeen = lead.listingFirstSeenAt || lead.createdAt;
    const lastChanged = lead.listingLastChangedAt;
    const lastSeen = lead.listingLastSeenAt;

    if (firstSeen) {
      const t = new Date(firstSeen).getTime();
      if (t >= start && t <= end) {
        events.push({ lead, kind: "new_listing", at: firstSeen });
        continue; // new discovery covers the initial stamps
      }
    }

    if (lastChanged && firstSeen) {
      const changedAt = new Date(lastChanged).getTime();
      const seenAt = new Date(firstSeen).getTime();
      if (changedAt > seenAt && changedAt >= start && changedAt <= end) {
        events.push({ lead, kind: "listing_change", at: lastChanged });
        continue;
      }
    } else if (lastChanged) {
      const changedAt = new Date(lastChanged).getTime();
      if (changedAt >= start && changedAt <= end) {
        events.push({ lead, kind: "listing_change", at: lastChanged });
        continue;
      }
    }

    // Unchanged listing observed again in the window (intake last_seen only)
    if (lastSeen && firstSeen) {
      const lastSeenAt = new Date(lastSeen).getTime();
      const seenAt = new Date(firstSeen).getTime();
      const changedAt = lastChanged ? new Date(lastChanged).getTime() : seenAt;
      if (
        lastSeenAt >= start &&
        lastSeenAt <= end &&
        lastSeenAt > seenAt &&
        lastSeenAt > changedAt
      ) {
        events.push({ lead, kind: "seen_again", at: lastSeen });
      }
    }
  }

  return events;
}
