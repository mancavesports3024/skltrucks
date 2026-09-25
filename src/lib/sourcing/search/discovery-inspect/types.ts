import type { MatchStatus, SpecEvidence } from "@/types/sourcing";
import type { BuyingProfile } from "@/types/sourcing";
import type { DiscoveryInspectCeilings } from "@/lib/sourcing/search/discovery/ceilings";
import type { DiscoveryQueryPlan } from "@/lib/sourcing/search/discovery/query-matrix";
import type {
  DiscoveryUrlMetrics,
  RetainedDiscoveryUrl,
} from "@/lib/sourcing/search/discovery/types";
import type { ValidatedListingCandidate } from "@/lib/sourcing/search/discovery-inspect/validate-url";
import type {
  ExtractedContactCandidate,
  ExtractedTruckCandidate,
  SearchApiUsage,
} from "@/lib/sourcing/search/types";

export type PreviewRowOutcome =
  | "confirmed_match"
  | "needs_verification"
  | "does_not_match"
  | "duplicate"
  | "rejected_pre_inspect"
  | "unverified"
  | "inspect_failed";

export type DiscoveryInspectPreviewRow = {
  id: string;
  discoveryUrl: string;
  finalUrl: string;
  canonicalUrl: string;
  bucket: string;
  title: string;
  validationOutcome: string;
  validationReason: string;
  matchStatus: MatchStatus | "duplicate" | "unverified" | "inspect_failed" | "not_inspected";
  previewOutcome: PreviewRowOutcome;
  reasons: string[];
  truck: ExtractedTruckCandidate | null;
  contact: ExtractedContactCandidate | null;
  evidence: SpecEvidence;
  alreadyInSkl: boolean;
  importEligible: boolean;
  provenance: RetainedDiscoveryUrl["provenance"];
};

export type DiscoveryInspectPreviewReport = {
  mode: "mock" | "live";
  generatedAt: string;
  dbWrites: false;
  previewOnly: true;
  tavilyExtractCalled: false;
  openaiDiscoveryCalled: false;
  buyingProfile: BuyingProfile;
  ceilings: DiscoveryInspectCeilings;
  queryPlans: DiscoveryQueryPlan[];
  discoveryMetrics: DiscoveryUrlMetrics | null;
  tavilyCredits: number;
  tavilyEstimatedCostUsd: number;
  openAiInspectCalls: number;
  openAiEstimatedCostUsd: number;
  combinedEstimatedCostUsd: number;
  retained: RetainedDiscoveryUrl[];
  rejectedBeforeInspect: Array<{
    url: string;
    reason: string;
    outcome: string;
  }>;
  validated: ValidatedListingCandidate[];
  rows: DiscoveryInspectPreviewRow[];
  usage: SearchApiUsage;
  errors: string[];
  notes: string[];
  /** Opaque token tying Import to this Preview (server-validated shape). */
  previewId: string;
};

export const DISCOVERY_INSPECT_CONFIRM_FIELD = "confirmPaidDiscoveryInspect";
export const DISCOVERY_INSPECT_CONFIRM_VALUE = "1";
