/**
 * Offline reprocess of the final OpenAI live-run report.
 * No network calls to OpenAI / Tavily — uses saved report + local DB only.
 */
import Module from "node:module";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const originalLoad = (Module as unknown as { _load: Function })._load;
(Module as unknown as { _load: Function })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return originalLoad(request, parent, isMain);
};

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const host = new URL(supabaseUrl).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.error("REFUSE: not local nonprod");
    process.exit(2);
  }

  const { classifyLead } = await import("../src/lib/sourcing/match.ts");
  const { applyDeterministicEngineIsCummins } = await import(
    "../src/lib/sourcing/search/deterministic-specs.ts"
  );
  const { candidateToTruckLeadInput } = await import(
    "../src/lib/sourcing/search/map-candidates.ts"
  );
  const { mapRawTruck } = await import("../src/lib/sourcing/search/openai-normalize.ts");
  const { DEFAULT_BUYING_PROFILE } = await import("../src/types/sourcing.ts");
  const { truckLeadInputToRow } = await import("../src/lib/sourcing/mappers.ts");

  const reportPath = "/opt/cursor/artifacts/openai-live-search-report.json";
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    buyingProfile?: typeof DEFAULT_BUYING_PROFILE;
    detailedResults: Array<Record<string, unknown>>;
    trucksSaved: Array<Record<string, unknown>>;
    newLeadsSaved: number;
    confirmedMatches: number;
    needsVerification: number;
    duplicatesOrRejected: number;
    errors: string[];
    [k: string]: unknown;
  };

  const profile = report.buyingProfile || DEFAULT_BUYING_PROFILE;
  const asOf = new Date(String(report.generatedAt || "2026-09-19"));

  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const corrected: Array<Record<string, unknown>> = [];
  let confirmedMatches = 0;
  let needsVerification = 0;
  let duplicatesOrRejected = 0;
  const trucksSaved: Array<Record<string, unknown>> = [];

  for (const detail of report.detailedResults || []) {
    const raw = mapRawTruck(detail);
    const mapped = candidateToTruckLeadInput({
      ...raw,
      // Preserve contact fields from saved detail
      phone: String(detail.phone || raw.phone || ""),
      contactName: String(detail.contactName || raw.contactName || ""),
      contactRole: String(detail.contactRole || raw.contactRole || ""),
    });

    if (mapped.rejectReason) {
      duplicatesOrRejected += 1;
      const entry = {
        ...detail,
        classification: "Rejected",
        outcome: "rejected",
        reason: mapped.rejectReason,
        reprocessed: true,
      };
      corrected.push(entry);
      trucksSaved.push({
        seller: detail.seller,
        stockNumber: detail.stockNumber,
        listingUrl: detail.listingUrl,
        matchStatus: "rejected",
        outcome: "rejected",
        reason: mapped.rejectReason,
      });
      continue;
    }

    // Deterministic engine already applied in mapRawTruck / candidateToTruckLeadInput
    const match = classifyLead(mapped.input, profile, asOf);
    const label =
      match.status === "confirmed_match"
        ? "Confirmed match"
        : match.status === "needs_verification"
          ? "Needs verification"
          : match.status === "does_not_match"
            ? "Rejected"
            : match.status;

    if (match.status === "confirmed_match") confirmedMatches += 1;
    if (match.status === "needs_verification") needsVerification += 1;
    if (match.status === "does_not_match") duplicatesOrRejected += 1;

    const engineFlag = applyDeterministicEngineIsCummins({
      engine: mapped.input.engine,
      engineEvidence: mapped.input.specEvidence?.engine,
      engineIsCummins: mapped.input.engineIsCummins,
    });

    // Fix only the incorrectly saved leads from this run (Stapleton / same listing URLs)
    const listingUrl = String(detail.listingUrl || "");
    const { data: existing } = await supabase
      .from("sourcing_truck_leads")
      .select("id, match_status, engine, manufacturer_gvwr_lbs")
      .eq("source_url", listingUrl)
      .maybeSingle();

    let dbAction = "none";
    if (existing?.id) {
      if (match.status === "does_not_match") {
        // Reclassify rejected lead in place (do not delete unrelated leads)
        const { error } = await supabase
          .from("sourcing_truck_leads")
          .update({
            match_status: "does_not_match",
            match_reasons: match.reasons,
            engine_is_cummins: engineFlag,
            manufacturer_gvwr_lbs: mapped.input.manufacturerGvwrLbs,
            listed_weight_lbs: mapped.input.listedWeightLbs,
            listed_weight_term: mapped.input.listedWeightTerm,
            verification_notes: [
              String(
                (
                  await supabase
                    .from("sourcing_truck_leads")
                    .select("verification_notes")
                    .eq("id", existing.id)
                    .maybeSingle()
                ).data?.verification_notes || ""
              )
                .split("\n")
                .filter((line) => !/^Reclassified:/i.test(line))
                .join("\n")
                .trim(),
              `Reclassified: deterministic rules → Rejected (${match.reasons
                .filter((r) => r.outcome === "fail")
                .map((r) => r.label)
                .join("; ")})`,
            ]
              .filter(Boolean)
              .join("\n"),
          })
          .eq("id", existing.id);
        dbAction = error ? `error:${error.message}` : "reclassified_does_not_match";
      } else {
        // Refresh classification for other leads from this run without inventing specs
        const { error } = await supabase
          .from("sourcing_truck_leads")
          .update({
            match_status: match.status,
            match_reasons: match.reasons,
            engine_is_cummins: engineFlag,
          })
          .eq("id", existing.id);
        dbAction = error ? `error:${error.message}` : `updated_${match.status}`;
      }
    }

    const entry = {
      ...detail,
      engineIsCummins: engineFlag,
      listedWeightLbs: mapped.input.listedWeightLbs,
      listedWeightTerm: mapped.input.listedWeightTerm,
      manufacturerGvwrLbs: mapped.input.manufacturerGvwrLbs,
      classification: label,
      matchStatus: match.status,
      matchReasons: match.reasons,
      outcome:
        match.status === "does_not_match"
          ? "rejected"
          : detail.outcome === "listing_change"
            ? "listing_change"
            : detail.outcome === "inserted"
              ? "inserted"
              : detail.outcome,
      reason:
        match.status === "does_not_match"
          ? match.reasons
              .filter((r) => r.outcome === "fail")
              .map((r) => r.label)
              .join("; ")
          : detail.reason || null,
      reprocessed: true,
      dbAction,
      supplierContactId: detail.supplierContactId || detail.linkedContactId || null,
    };
    // Avoid unused import warning if bundlers scan — keep row mapper available for future
    void truckLeadInputToRow;
    corrected.push(entry);

    trucksSaved.push({
      id: existing?.id,
      seller: mapped.input.seller || detail.seller,
      stockNumber: mapped.input.stockNumber || detail.stockNumber,
      listingUrl,
      matchStatus: match.status,
      outcome: entry.outcome,
      reason: entry.reason,
      supplierContactId: entry.supplierContactId,
      dbAction,
    });
  }

  const out = {
    ...report,
    reprocessedAt: new Date().toISOString(),
    reprocessedOffline: true,
    openaiCalled: false,
    confirmedMatches,
    needsVerification,
    duplicatesOrRejected,
    // newLeadsSaved unchanged historically; note corrected reject count separately
    detailedResults: corrected,
    trucksSaved,
    classificationSummary: corrected.map((t) => ({
      seller: t.seller,
      listingUrl: t.listingUrl,
      classification: t.classification,
      matchStatus: t.matchStatus,
      outcome: t.outcome,
      reason: t.reason,
      engineIsCummins: t.engineIsCummins,
      manufacturerGvwrLbs: t.manufacturerGvwrLbs,
      listedWeightTerm: t.listedWeightTerm,
      dbAction: t.dbAction,
    })),
  };

  const outPath = "/opt/cursor/artifacts/openai-live-search-report-reprocessed.json";
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.classificationSummary, null, 2));
  console.log("Wrote", outPath);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
