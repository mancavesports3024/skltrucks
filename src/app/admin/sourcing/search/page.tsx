import DiscoveryInspectPreviewPanel from "@/components/admin/sourcing/DiscoveryInspectPreviewPanel";
import PenskeUrlInspectionPanel from "@/components/admin/sourcing/PenskeUrlInspectionPanel";
import RunSearchButton, {
  SearchReportPanel,
} from "@/components/admin/sourcing/RunSearchButton";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import { requireSourcingStaff } from "@/lib/sourcing/access";
import { getBuyingProfile } from "@/lib/sourcing/db";
import { earliestAcceptedModelYear } from "@/lib/sourcing/match";
import { isPenskeUrlInspectionEnabled } from "@/lib/sourcing/search/penske-url-inspection";
import {
  getConfiguredSearchProviderLabel,
  isLiveSearchConfigured,
} from "@/lib/sourcing/search/providers";
import { isOpenAiSearchConfigured } from "@/lib/sourcing/search/providers/openai";
import { isTavilyConfigured } from "@/lib/sourcing/search/providers/tavily";
import { listRecentSearchRuns } from "@/lib/sourcing/search/run";

export default async function SourcingSearchPage() {
  const access = await requireSourcingStaff();
  if (!access.ok) {
    return (
      <div>
        <SourcingNav active="search" />
        <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-red-800">{access.error}</div>
      </div>
    );
  }

  const [profile, recent] = await Promise.all([
    getBuyingProfile(),
    listRecentSearchRuns(5),
  ]);
  const earliest = earliestAcceptedModelYear(profile);
  const liveConfigured = isLiveSearchConfigured();
  const configuredProviderLabel = getConfiguredSearchProviderLabel();
  const penskeInspectionEnabled = isPenskeUrlInspectionEnabled();
  const tavilyConfigured = isTavilyConfigured();
  const openAiConfigured = isOpenAiSearchConfigured();

  return (
    <div>
      <SourcingNav active="search" />
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:py-8">
        <div>
          <h2 className="text-lg font-bold">Internet search pilot</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Staff-only discovery and inspection from the <strong>active buying profile</strong>.
            Prefer the Discovery → Inspection Preview below for Tavily unit discovery with explicit
            Import. Legacy “Run search now” still exists. No cron, no email, keys stay on the server.
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Configured provider: <strong>{configuredProviderLabel}</strong>
          </p>
        </div>

        <section className="border border-neutral-200 bg-white p-6 text-sm">
          <h3 className="font-bold">Active profile driving this search</h3>
          <p className="mt-2 text-neutral-700">
            Cummins {profile.requireCummins ? "required" : "optional"} · automatic{" "}
            {profile.requireAutomatic ? "required" : "optional"} · box{" "}
            {profile.requiredBoxLengthsFt.join("/")}&apos; · GVWR{" "}
            {profile.gvwrMustBeStrictlyBelow ? "strictly below" : "≤"}{" "}
            {profile.maxGvwrLbs.toLocaleString()} · max mileage {profile.maxMileage.toLocaleString()}{" "}
            · earliest year {earliest} · liftgate preferred {String(profile.preferLiftgate)} · within{" "}
            {profile.preferredMaxDrivingMiles.toLocaleString()} mi of {profile.originLabel}
          </p>
        </section>

        <DiscoveryInspectPreviewPanel
          tavilyConfigured={tavilyConfigured}
          openAiConfigured={openAiConfigured}
        />

        <RunSearchButton
          liveConfigured={liveConfigured}
          configuredProviderLabel={configuredProviderLabel}
        />

        {penskeInspectionEnabled && <PenskeUrlInspectionPanel enabled />}

        {recent.length > 0 && (
          <section className="space-y-4">
            <h3 className="font-bold">Recent runs</h3>
            {recent.map((r) => (
              <SearchReportPanel key={r.id || r.generatedAt} report={r} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
