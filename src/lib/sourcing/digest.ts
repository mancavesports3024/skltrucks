import { selectDigestLeadEvents, type DigestEventKind } from "@/lib/sourcing/listing-content";
import type { MatchStatus, TruckLead } from "@/types/sourcing";
import { MATCH_STATUS_LABELS } from "@/types/sourcing";

export interface DigestGroupLead {
  lead: TruckLead;
  kind: DigestEventKind;
  at: string;
}

export interface DigestGroup {
  status: MatchStatus;
  label: string;
  entries: DigestGroupLead[];
}

export interface DigestPreview {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  total: number;
  newListingCount: number;
  listingChangeCount: number;
  seenAgainCount: number;
  groups: DigestGroup[];
}

const STATUS_ORDER: MatchStatus[] = [
  "confirmed_match",
  "needs_verification",
  "out_of_range_opportunity",
  "does_not_match",
];

/**
 * Daily digest preview of newly discovered listings, meaningful listing changes,
 * and unchanged listings seen again on intake. Staff call notes alone do not appear.
 * Does not send email — preview only.
 */
export function buildDailyDigestPreview(
  leads: TruckLead[],
  now: Date = new Date()
): DigestPreview {
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const events = selectDigestLeadEvents(leads, windowStart, windowEnd);

  const groups: DigestGroup[] = STATUS_ORDER.map((status) => ({
    status,
    label: MATCH_STATUS_LABELS[status],
    entries: events
      .filter((e) => e.lead.matchStatus === status)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
  })).filter((g) => g.entries.length > 0);

  return {
    generatedAt: now.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    total: events.length,
    newListingCount: events.filter((e) => e.kind === "new_listing").length,
    listingChangeCount: events.filter((e) => e.kind === "listing_change").length,
    seenAgainCount: events.filter((e) => e.kind === "seen_again").length,
    groups,
  };
}
