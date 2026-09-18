import type { MatchStatus } from "@/types/sourcing";
import { MATCH_STATUS_LABELS } from "@/types/sourcing";

const STYLES: Record<MatchStatus, string> = {
  confirmed_match: "bg-emerald-50 text-emerald-800 border-emerald-200",
  needs_verification: "bg-amber-50 text-amber-900 border-amber-200",
  does_not_match: "bg-neutral-100 text-neutral-700 border-neutral-200",
  out_of_range_opportunity: "bg-sky-50 text-sky-900 border-sky-200",
};

export default function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return (
    <span
      className={`inline-flex border px-2 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      {MATCH_STATUS_LABELS[status]}
    </span>
  );
}
