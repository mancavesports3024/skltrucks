import { requireSourcingStaff } from "@/lib/sourcing/access";
import { listingContentChanged } from "@/lib/sourcing/listing-content";
import { classifyLead } from "@/lib/sourcing/match";
import type {
  MarketAssessment,
  MarketConfidence,
  MarketComparisonReport,
  MarketComparisonRecord,
} from "@/lib/sourcing/market-comparison/types";
import {
  buyingProfileToRow,
  rowToBuyingProfile,
  rowToSupplierContact,
  rowToTruckLead,
  supplierContactInputToRow,
  truckLeadInputToRow,
  type DbBuyingProfile,
  type DbSupplierContact,
  type DbTruckLead,
} from "@/lib/sourcing/mappers";
import type { SearchApiUsage } from "@/lib/sourcing/search/types";
import {
  buildIntakeBatchFromCsv,
  type IntakeBatchReport,
} from "@/lib/sourcing/intake/import";
import {
  buildWorkbookPreview,
  type WorkbookPreviewReport,
} from "@/lib/sourcing/intake/workbook";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type {
  BuyingProfile,
  BuyingProfileInput,
  SpecEvidence,
  SupplierContact,
  SupplierContactInput,
  TruckLead,
  TruckLeadInput,
} from "@/types/sourcing";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";
import type { DrivingRouteCache } from "@/lib/sourcing/distance/google-routes/types";
import { normalizeSpecEvidence } from "@/lib/sourcing/intake/sources";

export async function getBuyingProfile(): Promise<BuyingProfile> {
  if (!isSupabaseConfigured()) return { ...DEFAULT_BUYING_PROFILE };

  const access = await requireSourcingStaff();
  if (!access.ok) return { ...DEFAULT_BUYING_PROFILE };

  const { data, error } = await access.supabase
    .from("sourcing_buying_profile")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[sourcing] buying profile:", error.message);
    return { ...DEFAULT_BUYING_PROFILE };
  }

  return rowToBuyingProfile(data as DbBuyingProfile);
}

export async function saveBuyingProfile(
  input: BuyingProfileInput
): Promise<{ error?: string; profile?: BuyingProfile }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const fullRow = buyingProfileToRow(input);
  let { data, error } = await access.supabase
    .from("sourcing_buying_profile")
    .upsert({ id: "default", ...fullRow })
    .select("*")
    .single();

  // Optional additive columns may be absent until SQL is applied — retry without them.
  if (
    error &&
    /transportation_rate_per_mile|default_inspection_cost|schema cache/i.test(error.message)
  ) {
    const legacyRow = { ...fullRow } as Record<string, unknown>;
    delete legacyRow.transportation_rate_per_mile;
    delete legacyRow.default_inspection_cost;
    ({ data, error } = await access.supabase
      .from("sourcing_buying_profile")
      .upsert({ id: "default", ...legacyRow })
      .select("*")
      .single());
    if (!error && data) {
      const profile = rowToBuyingProfile(data as DbBuyingProfile);
      // Preserve staff-entered defaults in the returned profile even when columns are absent.
      return {
        profile: {
          ...profile,
          transportationRatePerMile: input.transportationRatePerMile,
          defaultInspectionCost: input.defaultInspectionCost,
        },
      };
    }
  }

  if (error) return { error: error.message };
  return { profile: rowToBuyingProfile(data as DbBuyingProfile) };
}

export async function getTruckLeads(): Promise<TruckLead[]> {
  const access = await requireSourcingStaff();
  if (!access.ok) return [];

  const { data, error } = await access.supabase
    .from("sourcing_truck_leads")
    .select("*")
    .order("listing_last_changed_at", { ascending: false });

  if (error) {
    console.error("[sourcing] leads:", error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToTruckLead(row as DbTruckLead));
}

export async function getTruckLeadById(id: string): Promise<TruckLead | null> {
  const access = await requireSourcingStaff();
  if (!access.ok) return null;

  const { data, error } = await access.supabase
    .from("sourcing_truck_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return rowToTruckLead(data as DbTruckLead);
}

export async function upsertTruckLead(
  input: TruckLeadInput,
  id?: string
): Promise<{ error?: string; lead?: TruckLead }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const profile = await getBuyingProfile();
  const match = classifyLead(input, profile);

  let listingLastChangedAt: string | undefined;
  if (id) {
    const existing = await getTruckLeadById(id);
    if (existing && listingContentChanged(existing, input)) {
      listingLastChangedAt = new Date().toISOString();
    }
  }

  const row = truckLeadInputToRow({
    ...input,
    matchStatus: match.status,
    matchReasons: match.reasons,
    listingLastChangedAt,
  });

  // Ensure specEvidence always present for older callers
  if (!input.specEvidence) {
    row.spec_evidence = {};
  }

  const query = id
    ? access.supabase.from("sourcing_truck_leads").update(row).eq("id", id)
    : access.supabase.from("sourcing_truck_leads").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) return { error: error.message };
  return { lead: rowToTruckLead(data as DbTruckLead) };
}

export async function deleteTruckLead(id: string): Promise<{ error?: string }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const { error } = await access.supabase.from("sourcing_truck_leads").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function getSupplierContacts(): Promise<SupplierContact[]> {
  const access = await requireSourcingStaff();
  if (!access.ok) return [];

  const { data, error } = await access.supabase
    .from("sourcing_supplier_contacts")
    .select("*")
    .order("company", { ascending: true });

  if (error) {
    console.error("[sourcing] contacts:", error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToSupplierContact(row as DbSupplierContact));
}

export async function getSupplierContactById(id: string): Promise<SupplierContact | null> {
  const access = await requireSourcingStaff();
  if (!access.ok) return null;

  const { data, error } = await access.supabase
    .from("sourcing_supplier_contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return rowToSupplierContact(data as DbSupplierContact);
}

export async function upsertSupplierContact(
  input: SupplierContactInput,
  id?: string
): Promise<{ error?: string; contact?: SupplierContact }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const row = supplierContactInputToRow(input);
  const query = id
    ? access.supabase.from("sourcing_supplier_contacts").update(row).eq("id", id)
    : access.supabase.from("sourcing_supplier_contacts").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) return { error: error.message };
  return { contact: rowToSupplierContact(data as DbSupplierContact) };
}

export async function deleteSupplierContact(id: string): Promise<{ error?: string }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const { error } = await access.supabase.from("sourcing_supplier_contacts").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

/**
 * Persist Google Routes driving-distance cache into spec_evidence only.
 * Does not change driving_distance_miles, distance_is_estimate, listing timestamps,
 * classification, call notes, or listing-content fingerprint fields.
 */
export async function persistDrivingRouteCache(
  leadId: string,
  cache: DrivingRouteCache
): Promise<{ error?: string; lead?: TruckLead }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const existing = await getTruckLeadById(leadId);
  if (!existing) return { error: "Lead not found." };

  const nextEvidence: SpecEvidence = normalizeSpecEvidence({
    ...existing.specEvidence,
    drivingRoute: cache,
  });

  const { data, error } = await access.supabase
    .from("sourcing_truck_leads")
    .update({ spec_evidence: nextEvidence })
    .eq("id", leadId)
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { lead: rowToTruckLead(data as DbTruckLead) };
}

/**
 * Recalculate match_status / match_reasons only.
 * Does not bump listing_last_changed_at (staff/system edit, not a listing change).
 */
export async function reclassifyAllLeads(): Promise<{ error?: string; updated?: number }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const profile = await getBuyingProfile();
  const leads = await getTruckLeads();
  let updated = 0;

  for (const lead of leads) {
    const match = classifyLead(lead, profile);
    if (
      match.status === lead.matchStatus &&
      JSON.stringify(match.reasons) === JSON.stringify(lead.matchReasons)
    ) {
      continue;
    }

    const { error } = await access.supabase
      .from("sourcing_truck_leads")
      .update({
        match_status: match.status,
        match_reasons: match.reasons,
      })
      .eq("id", lead.id);

    if (error) return { error: error.message };
    updated += 1;
  }

  return { updated };
}

/**
 * Apply a staff-reviewed CSV intake batch. Persists first/last seen and listing changes.
 * Does not schedule email or scrape remote sites.
 */
export async function applyCsvIntake(
  csvText: string | null | undefined,
  options?: { sourceLabel?: string; defaultSourceScope?: string }
): Promise<{ error?: string; report?: IntakeBatchReport }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const profile = await getBuyingProfile();
  const existing = await getTruckLeads();
  const report = buildIntakeBatchFromCsv(csvText, existing, profile, {
    sourceLabel: options?.sourceLabel,
    defaultSourceScope: options?.defaultSourceScope,
  });

  if (report.parseError) {
    return { report };
  }

  for (const plan of report.plans) {
    const match = classifyLead(plan.input, profile);
    const row = truckLeadInputToRow({
      ...plan.input,
      matchStatus: match.status,
      matchReasons: match.reasons,
      listingFirstSeenAt: plan.listingFirstSeenAt,
      listingLastSeenAt: plan.listingLastSeenAt,
      listingLastChangedAt: plan.listingLastChangedAt,
    });

    if (plan.kind === "inserted") {
      const { error } = await access.supabase.from("sourcing_truck_leads").insert(row);
      if (error) {
        report.errors.push(error.message);
      }
      continue;
    }

    const { error } = await access.supabase
      .from("sourcing_truck_leads")
      .update(row)
      .eq("id", plan.existingId!);
    if (error) report.errors.push(error.message);
  }

  return { report };
}

/**
 * Staff preview for authorized dealer workbooks (.xls / .xlsx / .csv).
 * Parse + classify only — no persistence, no OpenAI/Tavily.
 */
export async function previewWorkbookIntake(
  buffer: ArrayBuffer | Buffer,
  filename: string,
  options?: { sourceLabel?: string }
): Promise<{ error?: string; report?: WorkbookPreviewReport }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const profile = await getBuyingProfile();
  const existing = await getTruckLeads();
  const report = buildWorkbookPreview(buffer, filename, existing, profile, {
    sourceLabel: options?.sourceLabel,
  });
  return { report };
}

/**
 * Persist a staff-confirmed workbook intake after preview.
 */
export async function applyWorkbookIntake(
  buffer: ArrayBuffer | Buffer,
  filename: string,
  options?: { sourceLabel?: string }
): Promise<{ error?: string; report?: WorkbookPreviewReport }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const profile = await getBuyingProfile();
  const existing = await getTruckLeads();
  const report = buildWorkbookPreview(buffer, filename, existing, profile, {
    sourceLabel: options?.sourceLabel,
  });

  if (report.workbookParseError) {
    return { report };
  }

  for (const plan of report.plans) {
    const match = classifyLead(plan.input, profile);
    const row = truckLeadInputToRow({
      ...plan.input,
      matchStatus: match.status,
      matchReasons: match.reasons,
      listingFirstSeenAt: plan.listingFirstSeenAt,
      listingLastSeenAt: plan.listingLastSeenAt,
      listingLastChangedAt: plan.listingLastChangedAt,
    });

    if (plan.kind === "inserted") {
      const { error } = await access.supabase.from("sourcing_truck_leads").insert(row);
      if (error) {
        report.errors.push(error.message);
      }
      continue;
    }

    const { error } = await access.supabase
      .from("sourcing_truck_leads")
      .update(row)
      .eq("id", plan.existingId!);
    if (error) report.errors.push(error.message);
  }

  // Refresh counts from plans after persist attempts
  return { report };
}

export async function insertMarketComparison(input: {
  leadId: string;
  status: "completed" | "failed";
  assessment: MarketAssessment | null;
  confidence: MarketConfidence | null;
  report: MarketComparisonReport | null;
  apiUsage: SearchApiUsage | null;
  errorMessage: string | null;
  createdBy: string;
  /**
   * Prefer the already-authorized staff client from requireSourcingStaff() so the
   * insert runs with the signed-in user’s JWT (auth.uid() + RLS). Never use a
   * service-role client here.
   */
  access?: Extract<Awaited<ReturnType<typeof requireSourcingStaff>>, { ok: true }>;
}): Promise<{ id?: string; error?: string }> {
  const access = input.access ?? (await requireSourcingStaff());
  if (!access.ok) return { error: access.error };

  // Defense in depth: refuse empty uid — trigger also requires auth.uid().
  if (!access.user.id) {
    return { error: "Authenticated user id missing; cannot record comparison." };
  }

  const { data, error } = await access.supabase
    .from("sourcing_market_comparisons")
    .insert({
      lead_id: input.leadId,
      status: input.status,
      assessment: input.assessment,
      confidence: input.confidence,
      report: input.report,
      api_usage: input.apiUsage,
      error_message: input.errorMessage,
      // Trigger overwrites with auth.uid(); value is advisory for the client session.
      created_by: access.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data?.id as string };
}

export async function listMarketComparisonsForLead(
  leadId: string
): Promise<MarketComparisonRecord[]> {
  const access = await requireSourcingStaff();
  if (!access.ok) return [];

  const { data, error } = await access.supabase
    .from("sourcing_market_comparisons")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data) {
    if (error) console.error("[sourcing] market comparisons:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id as string,
    leadId: row.lead_id as string,
    status: row.status as "completed" | "failed",
    assessment: (row.assessment as MarketAssessment | null) ?? null,
    confidence: (row.confidence as MarketConfidence | null) ?? null,
    report: (row.report as MarketComparisonReport | null) ?? null,
    apiUsage: (row.api_usage as SearchApiUsage | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    createdBy: (row.created_by as string) ?? "",
    createdAt: row.created_at as string,
  }));
}
