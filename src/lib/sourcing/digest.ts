import type { MatchStatus, TruckLead } from "@/types/sourcing";
import { MATCH_STATUS_LABELS } from "@/types/sourcing";

export interface DigestGroup {
  status: MatchStatus;
  label: string;
  leads: TruckLead[];
}

export interface DigestPreview {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  total: number;
  groups: DigestGroup[];
}

const STATUS_ORDER: MatchStatus[] = [
  "confirmed_match",
  "needs_verification",
  "out_of_range_opportunity",
  "does_not_match",
];

/**
 * Build a daily digest preview of leads created or updated in the last 24 hours.
 * Does not send email — preview only.
 */
export function buildDailyDigestPreview(
  leads: TruckLead[],
  now: Date = new Date()
): DigestPreview {
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const recent = leads.filter((lead) => {
    const stamp = lead.updatedAt || lead.createdAt || lead.dateLastChecked;
    if (!stamp) return false;
    const t = new Date(stamp).getTime();
    return t >= windowStart.getTime() && t <= windowEnd.getTime();
  });

  const groups: DigestGroup[] = STATUS_ORDER.map((status) => ({
    status,
    label: MATCH_STATUS_LABELS[status],
    leads: recent
      .filter((l) => l.matchStatus === status)
      .sort((a, b) => {
        const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bt - at;
      }),
  })).filter((g) => g.leads.length > 0);

  return {
    generatedAt: now.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    total: recent.length,
    groups,
  };
}
