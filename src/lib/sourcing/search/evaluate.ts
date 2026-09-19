import { findExistingLead, planIntakeRow } from "@/lib/sourcing/intake/import";
import { classifyLead } from "@/lib/sourcing/match";
import {
  candidateToContactInput,
  candidateToTruckLeadInput,
} from "@/lib/sourcing/search/map-candidates";
import type { SearchModelPayload } from "@/lib/sourcing/search/types";
import type { BuyingProfile, TruckLead } from "@/types/sourcing";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

/** Pure pipeline for unit tests / CLI dry-runs (no DB, no OpenAI). */
export function evaluateSearchPayloadForTest(
  profile: BuyingProfile = DEFAULT_BUYING_PROFILE,
  payload: SearchModelPayload,
  existing: TruckLead[] = []
) {
  const trucks: Array<{
    outcome: "inserted" | "listing_change" | "seen_again" | "rejected";
    reason?: string;
    matchStatus?: string;
    seller?: string;
    stockNumber?: string;
    listingUrl?: string;
    phone?: string;
  }> = [];
  let rejected = 0;
  for (const truck of payload.trucks) {
    const mapped = candidateToTruckLeadInput(truck);
    if (mapped.rejectReason) {
      rejected += 1;
      trucks.push({ outcome: "rejected", reason: mapped.rejectReason });
      continue;
    }
    const existingLead = findExistingLead(existing, mapped.input);
    const plan = planIntakeRow(mapped.input, existingLead, profile, {
      dateObserved: "2026-09-19",
      missingEvidence: [],
    });
    const match = classifyLead(plan.input, profile);
    trucks.push({
      outcome: plan.kind,
      matchStatus: match.status,
      seller: plan.input.seller,
      stockNumber: plan.input.stockNumber,
      listingUrl: plan.input.sourceUrl,
      phone: truck.phone,
    });
  }
  const contacts = payload.contacts.map((c) => {
    const mapped = candidateToContactInput(c);
    return mapped.rejectReason
      ? { outcome: "rejected" as const, reason: mapped.rejectReason, company: c.company }
      : {
          outcome: "inserted" as const,
          company: mapped.input.company,
          phone: mapped.input.phone,
        };
  });
  return { trucks, contacts, rejected };
}
