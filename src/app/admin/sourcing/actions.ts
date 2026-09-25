"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSourcingStaff } from "@/lib/sourcing/access";
import { duplicateConflictMessage } from "@/lib/sourcing/duplicates";
import {
  deleteSupplierContact,
  deleteTruckLead,
  getBuyingProfile,
  applyCsvIntake,
  applyWorkbookIntake,
  previewWorkbookIntake,
  reclassifyAllLeads,
  saveBuyingProfile,
  upsertSupplierContact,
  upsertTruckLead,
} from "@/lib/sourcing/db";
import {
  appendCallNote,
  parseBuyingProfileForm,
  parseSupplierContactForm,
  parseTruckLeadForm,
} from "@/lib/sourcing/forms";
import { classifyLead } from "@/lib/sourcing/match";
import {
  rowToSupplierContact,
  rowToTruckLead,
  truckLeadInputToRow,
  supplierContactInputToRow,
} from "@/lib/sourcing/mappers";
import {
  SEED_SUPPLIER_CONTACTS,
  SEED_TRUCK_LEADS,
} from "@/lib/sourcing/seed-data";

function revalidateSourcing() {
  revalidatePath("/admin/sourcing");
  revalidatePath("/admin/sourcing/leads");
  revalidatePath("/admin/sourcing/contacts");
  revalidatePath("/admin/sourcing/profile");
  revalidatePath("/admin/sourcing/digest");
  revalidatePath("/admin/sourcing/intake");
  revalidatePath("/admin/sourcing/search");
}

export async function updateBuyingProfileAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const parsed = parseBuyingProfileForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const result = await saveBuyingProfile(parsed.input);
  if (result.error) return { error: result.error };

  const reclass = await reclassifyAllLeads();
  if (reclass.error) return { error: reclass.error };

  revalidateSourcing();
  return { success: true, updatedLeads: reclass.updated ?? 0 };
}

export async function saveTruckLeadAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const input = parseTruckLeadForm(formData);

  if (!input.seller && !input.makeModel) {
    return { error: "Seller or make/model is required." };
  }

  const result = await upsertTruckLead(input, id);
  if (result.error) {
    return { error: duplicateConflictMessage(result.error) ?? result.error };
  }

  revalidateSourcing();
  redirect(`/admin/sourcing/leads/${result.lead!.id}`);
}

export async function deleteTruckLeadAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing lead id." };
  const result = await deleteTruckLead(id);
  if (result.error) return { error: result.error };
  revalidateSourcing();
  redirect("/admin/sourcing/leads");
}

/**
 * Staff call notes / follow-up — must not bump listing_last_changed_at.
 */
export async function recordLeadCallAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("callNote") ?? "");
  const followUp = String(formData.get("nextFollowUpDate") ?? "").trim();

  if (!id) return { error: "Missing lead id." };
  if (!note.trim()) return { error: "Call note is required." };

  const { data: existing, error: fetchError } = await access.supabase
    .from("sourcing_truck_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) return { error: fetchError?.message ?? "Lead not found." };

  const lead = rowToTruckLead(existing);
  const sklCallNotes = appendCallNote(lead.sklCallNotes, note);
  const verificationNotes = followUp
    ? appendCallNote(lead.verificationNotes, `Next follow-up: ${followUp}`)
    : lead.verificationNotes;

  const profile = await getBuyingProfile();
  const match = classifyLead(lead, profile);

  // Intentionally omit listing_last_changed_at — staff activity only
  const { error } = await access.supabase
    .from("sourcing_truck_leads")
    .update({
      skl_call_notes: sklCallNotes,
      verification_notes: verificationNotes,
      workflow_status: "contacted",
      date_last_checked: new Date().toISOString().slice(0, 10),
      match_status: match.status,
      match_reasons: match.reasons,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  if (followUp && lead.supplierContactId) {
    const { data: contactRow } = await access.supabase
      .from("sourcing_supplier_contacts")
      .select("call_notes")
      .eq("id", lead.supplierContactId)
      .maybeSingle();

    await access.supabase
      .from("sourcing_supplier_contacts")
      .update({
        next_follow_up_date: followUp,
        last_contact_date: new Date().toISOString().slice(0, 10),
        call_notes: appendCallNote(
          contactRow?.call_notes ?? "",
          `Re: lead ${lead.stockNumber || lead.vin || id}: ${note.trim()}`
        ),
      })
      .eq("id", lead.supplierContactId);
  }

  revalidateSourcing();
  revalidatePath(`/admin/sourcing/leads/${id}`);
  return { success: true };
}

export async function saveSupplierContactAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const input = parseSupplierContactForm(formData);
  if (!input.company) return { error: "Company is required." };

  const result = await upsertSupplierContact(input, id);
  if (result.error) return { error: result.error };

  revalidateSourcing();
  redirect(`/admin/sourcing/contacts/${result.contact!.id}`);
}

export async function deleteSupplierContactAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing contact id." };
  const result = await deleteSupplierContact(id);
  if (result.error) return { error: result.error };
  revalidateSourcing();
  redirect("/admin/sourcing/contacts");
}

export async function recordSupplierCallAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("callNote") ?? "");
  const followUp = String(formData.get("nextFollowUpDate") ?? "").trim();

  if (!id) return { error: "Missing contact id." };
  if (!note.trim()) return { error: "Call note is required." };

  const { data: existing, error: fetchError } = await access.supabase
    .from("sourcing_supplier_contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) return { error: fetchError?.message ?? "Contact not found." };

  const contact = rowToSupplierContact(existing);
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await access.supabase
    .from("sourcing_supplier_contacts")
    .update({
      call_notes: appendCallNote(contact.callNotes, note),
      last_contact_date: today,
      next_follow_up_date: followUp || contact.nextFollowUpDate,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidateSourcing();
  revalidatePath(`/admin/sourcing/contacts/${id}`);
  return { success: true };
}

/**
 * Import unverified seed research. Safe to re-run: skips duplicates by VIN / scoped listing id / URL.
 * Does not scrape live sites. Does not bump listing timestamps beyond insert defaults.
 */
export async function importSeedResearchAction() {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const profile = await getBuyingProfile();

  await saveBuyingProfile({
    requireCummins: profile.requireCummins,
    requireAutomatic: profile.requireAutomatic,
    requiredBoxLengthsFt: profile.requiredBoxLengthsFt,
    maxGvwrLbs: profile.maxGvwrLbs,
    gvwrMustBeStrictlyBelow: profile.gvwrMustBeStrictlyBelow,
    maxMileage: profile.maxMileage,
    maxAgeYears: profile.maxAgeYears,
    preferLiftgate: profile.preferLiftgate,
    preferredMaxDrivingMiles: profile.preferredMaxDrivingMiles,
    maxPrice: profile.maxPrice,
    originLabel: profile.originLabel,
    notes: profile.notes,
    transportationRatePerMile: profile.transportationRatePerMile,
    defaultInspectionCost: profile.defaultInspectionCost,
  });

  const companyToId = new Map<string, string>();
  let contactsInserted = 0;
  let contactsSkipped = 0;

  for (const seed of SEED_SUPPLIER_CONTACTS) {
    const { seedKey, ...input } = seed;
    void seedKey;
    const { data: existing } = await access.supabase
      .from("sourcing_supplier_contacts")
      .select("id, company")
      .ilike("company", input.company)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      companyToId.set(input.company.toLowerCase(), existing.id);
      contactsSkipped += 1;
      continue;
    }

    const { data, error } = await access.supabase
      .from("sourcing_supplier_contacts")
      .insert(supplierContactInputToRow(input))
      .select("id")
      .single();

    if (error) return { error: `Contact seed failed (${input.company}): ${error.message}` };
    companyToId.set(input.company.toLowerCase(), data.id);
    contactsInserted += 1;
  }

  let leadsInserted = 0;
  let leadsSkipped = 0;

  for (const seed of SEED_TRUCK_LEADS) {
    const { seedKey, supplierCompany, ...rest } = seed;
    const supplierContactId = supplierCompany
      ? companyToId.get(supplierCompany.toLowerCase()) ?? null
      : null;

    const input = { ...rest, supplierContactId };
    const match = classifyLead(input, profile);
    const row = truckLeadInputToRow({
      ...input,
      matchStatus: match.status,
      matchReasons: match.reasons,
    });

    const { error } = await access.supabase.from("sourcing_truck_leads").insert(row);
    if (error) {
      if (duplicateConflictMessage(error.message)) {
        leadsSkipped += 1;
        continue;
      }
      return { error: `Lead seed failed (${seed.stockNumber || seedKey}): ${error.message}` };
    }
    leadsInserted += 1;
  }

  revalidateSourcing();
  return {
    success: true,
    contactsInserted,
    contactsSkipped,
    leadsInserted,
    leadsSkipped,
  };
}

/**
 * Staff-reviewed CSV intake (nonprod pilot). No scraping, no scheduled job, no email.
 */
export async function importCsvIntakeAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const sourceLabel = String(formData.get("sourceLabel") ?? "Staff-reviewed CSV").trim();
  const defaultSourceScope = String(formData.get("defaultSourceScope") ?? "").trim();
  const pasted = String(formData.get("csvText") ?? "");
  const file = formData.get("csvFile");

  let csvText: string | null = pasted.trim() ? pasted : null;
  if ((!csvText || !csvText.trim()) && file && typeof file === "object" && "text" in file) {
    try {
      csvText = await (file as File).text();
    } catch {
      return {
        error: "Source failure: could not read the uploaded file.",
        report: null,
      };
    }
  }

  if (csvText != null && !csvText.trim()) csvText = null;

  const { error, report } = await applyCsvIntake(csvText, {
    sourceLabel: sourceLabel || "Staff-reviewed CSV",
    defaultSourceScope: defaultSourceScope || undefined,
  });

  if (error) return { error, report: null };
  revalidateSourcing();
  return { success: true, report };
}

async function readUploadBuffer(formData: FormData): Promise<
  | { ok: true; buffer: Buffer; filename: string }
  | { ok: false; error: string }
> {
  const file = formData.get("workbookFile") ?? formData.get("csvFile");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return { ok: false, error: "Choose a .csv, .xls, or .xlsx file." };
  }
  const f = file as File;
  const filename = (f.name || "upload.csv").trim();
  try {
    const ab = await f.arrayBuffer();
    return { ok: true, buffer: Buffer.from(ab), filename };
  } catch {
    return { ok: false, error: "Source failure: could not read the uploaded file." };
  }
}

/**
 * Preview authorized dealer workbook — parse + classify only (no persist).
 */
export async function previewWorkbookIntakeAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error, report: null };

  const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
  const uploaded = await readUploadBuffer(formData);
  if (!uploaded.ok) return { error: uploaded.error, report: null };

  const { error, report } = await previewWorkbookIntake(uploaded.buffer, uploaded.filename, {
    sourceLabel: sourceLabel || undefined,
  });
  if (error) return { error, report: null };
  return { success: true, report };
}

/**
 * Import authorized dealer workbook after staff preview confirmation.
 */
export async function importWorkbookIntakeAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error, report: null };

  const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
  const confirm = String(formData.get("confirmImport") ?? "") === "1";
  if (!confirm) {
    return { error: "Import requires explicit confirmation after preview.", report: null };
  }

  const uploaded = await readUploadBuffer(formData);
  if (!uploaded.ok) return { error: uploaded.error, report: null };

  const { error, report } = await applyWorkbookIntake(uploaded.buffer, uploaded.filename, {
    sourceLabel: sourceLabel || undefined,
  });
  if (error) return { error, report: null };
  revalidateSourcing();
  return { success: true, report };
}

/**
 * Staff-only internet search pilot (no cron). Resolves Tavily → OpenAI → mock.
 * API keys never leave the server.
 */
export async function runInternetSearchAction(forceMock = false) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error, report: null };

  const { executeInternetSearchPilot } = await import("@/lib/sourcing/search/run");
  const result = await executeInternetSearchPilot({ forceMock });
  if (result.report) revalidateSourcing();
  return result;
}

/**
 * Staff-only Tavily Discovery → Inspection Preview (read-only until Import).
 * No cron. No Tavily extract. OpenAI is inspect-only when configured.
 */
export async function runDiscoveryInspectPreviewAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error, preview: null };

  const { executeDiscoveryInspectPreview, isDiscoveryInspectPaidConfirmed } = await import(
    "@/lib/sourcing/search/discovery-inspect/execute"
  );
  const forceMock = String(formData.get("forceMock") ?? "") === "1";
  const result = await executeDiscoveryInspectPreview({
    forceMock,
    confirmPaidProviders: forceMock || isDiscoveryInspectPaidConfirmed(formData),
  });
  // Preview never writes — do not revalidate as a save signal.
  return result;
}

/**
 * Explicit Import of selected listing URLs (server revalidates; never trusts Preview payload).
 */
export async function importDiscoveryInspectSelectedAction(payload: {
  selectedUrls: string[];
}) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error, report: null, importedCount: 0 };

  const { importSelectedDiscoveryInspectRows } = await import(
    "@/lib/sourcing/search/discovery-inspect/import-selected"
  );
  const result = await importSelectedDiscoveryInspectRows({
    selectedUrls: payload.selectedUrls ?? [],
  });
  if (result.report && (result.importedCount ?? 0) > 0) revalidateSourcing();
  return result;
}

/**
 * Staff-only Penske unit URL inspection (feature-flagged, inspect-only, no discovery).
 * Disabled by default (SOURCING_PENSKE_URL_INSPECTION_ENABLED).
 */
export async function runPenskeUrlInspectionAction(urlsText: string) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error, report: null };

  const { executePenskeUrlInspection } = await import(
    "@/lib/sourcing/search/penske-url-inspection/run"
  );
  const result = await executePenskeUrlInspection({ urlsText });
  if (result.report) revalidateSourcing();
  return result;
}

/**
 * Staff-only market comparison for one truck lead (OpenAI web search, manual button).
 * Requires paid-search confirmation. Uses shared search lock. No cron.
 */
export async function compareMarketAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error, report: null, comparisonId: null };

  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) return { error: "Missing lead id.", report: null, comparisonId: null };

  const { executeMarketComparison, isPaidSearchConfirmed } = await import(
    "@/lib/sourcing/market-comparison/run"
  );
  const { parseLandedCostFromForm } = await import(
    "@/lib/sourcing/market-comparison/landed-cost"
  );

  // Development/test environments without OpenAI key use mock automatically inside execute.
  // Never force live from this action during automated verification.
  const result = await executeMarketComparison({
    leadId,
    confirmPaidSearch: isPaidSearchConfirmed(formData),
    landedCostInput: parseLandedCostFromForm(formData),
  });

  if (result.report) revalidateSourcing();
  return {
    error: result.error ?? null,
    report: result.report ?? null,
    comparisonId: result.comparisonId ?? null,
  };
}

/**
 * Explicit Google Routes driving-distance calculation for Market Comparison.
 * Does not run OpenAI/Tavily. Does not start market comparison.
 * At most one Google request (zero when a fresh cache exists).
 */
export async function calculateDrivingDistanceAction(formData: FormData) {
  const access = await requireSourcingStaff();
  if (!access.ok) {
    return {
      error: access.error,
      ok: false as const,
      status: access.status,
    };
  }

  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) return { error: "Missing lead id.", ok: false as const };

  const { getBuyingProfile, getTruckLeadById, persistDrivingRouteCache } = await import(
    "@/lib/sourcing/db"
  );
  const { calculateDrivingDistanceForLead } = await import(
    "@/lib/sourcing/distance/google-routes/calculate"
  );
  const {
    CITY_CENTER_CONFIRM_NOTICE,
    CITY_CENTER_DRIVING_LABEL,
  } = await import("@/lib/sourcing/distance/google-routes");
  const {
    formatTransportationFormula,
    normalizeDefaultInspectionCost,
  } = await import("@/lib/sourcing/market-comparison/cost-defaults");

  const lead = await getTruckLeadById(leadId);
  if (!lead) return { error: "Lead not found.", ok: false as const };

  const profile = await getBuyingProfile();
  const result = await calculateDrivingDistanceForLead({
    leadId,
    location: lead.location,
    straightLineMiles: lead.drivingDistanceMiles,
    specEvidence: lead.specEvidence,
    transportationRatePerMile: profile.transportationRatePerMile,
    holderEmail: access.user.email ?? access.user.id,
  });

  if (!result.ok) {
    return {
      ok: false as const,
      error: result.error,
      failureCategory: result.failureCategory,
      straightLineMiles: result.straightLineMiles,
      usage: result.usage,
      label: CITY_CENTER_DRIVING_LABEL,
    };
  }

  if (result.cacheToPersist) {
    const saved = await persistDrivingRouteCache(leadId, result.cacheToPersist);
    if (saved.error) {
      const { logGoogleRoutesFailure } = await import(
        "@/lib/sourcing/distance/google-routes/diagnostics"
      );
      logGoogleRoutesFailure({
        httpStatus: null,
        failureStage: "cache_persistence",
        googleErrorMessage: "cache_persist_failed",
      });
      return { ok: false as const, error: saved.error };
    }
    revalidateSourcing();
  }

  const inspectionDefault = normalizeDefaultInspectionCost(profile.defaultInspectionCost);
  const formula = formatTransportationFormula(
    result.displayMiles,
    profile.transportationRatePerMile,
    result.transportationDefaultUsd
  );

  return {
    ok: true as const,
    error: null,
    message: result.message,
    displayMiles: result.displayMiles,
    distanceMilesUnrounded: result.cache.distanceMiles,
    durationSeconds: result.cache.durationSeconds,
    transportationDefaultUsd: result.transportationDefaultUsd,
    inspectionDefaultUsd: inspectionDefault,
    ratePerMile: profile.transportationRatePerMile,
    formula,
    methodLabel: CITY_CENTER_DRIVING_LABEL,
    confirmNotice: CITY_CENTER_CONFIRM_NOTICE,
    usage: result.usage,
    cache: result.cache,
    straightLineMiles: lead.distanceIsEstimate ? lead.drivingDistanceMiles : lead.drivingDistanceMiles,
  };
}

