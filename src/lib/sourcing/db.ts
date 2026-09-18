import { classifyLead } from "@/lib/sourcing/match";
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
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type {
  BuyingProfile,
  BuyingProfileInput,
  SupplierContact,
  SupplierContactInput,
  TruckLead,
  TruckLeadInput,
} from "@/types/sourcing";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

async function adminClient() {
  if (!isSupabaseConfigured()) return null;
  return createClient();
}

export async function getBuyingProfile(): Promise<BuyingProfile> {
  const supabase = await adminClient();
  if (!supabase) return { ...DEFAULT_BUYING_PROFILE };

  const { data, error } = await supabase
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
  const supabase = await adminClient();
  if (!supabase) return { error: "Database not connected." };

  const { data, error } = await supabase
    .from("sourcing_buying_profile")
    .upsert({ id: "default", ...buyingProfileToRow(input) })
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { profile: rowToBuyingProfile(data as DbBuyingProfile) };
}

export async function getTruckLeads(): Promise<TruckLead[]> {
  const supabase = await adminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("sourcing_truck_leads")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[sourcing] leads:", error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToTruckLead(row as DbTruckLead));
}

export async function getTruckLeadById(id: string): Promise<TruckLead | null> {
  const supabase = await adminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
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
  const supabase = await adminClient();
  if (!supabase) return { error: "Database not connected." };

  const profile = await getBuyingProfile();
  const match = classifyLead(input, profile);
  const row = truckLeadInputToRow({
    ...input,
    matchStatus: match.status,
    matchReasons: match.reasons,
  });

  const query = id
    ? supabase.from("sourcing_truck_leads").update(row).eq("id", id)
    : supabase.from("sourcing_truck_leads").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) return { error: error.message };
  return { lead: rowToTruckLead(data as DbTruckLead) };
}

export async function deleteTruckLead(id: string): Promise<{ error?: string }> {
  const supabase = await adminClient();
  if (!supabase) return { error: "Database not connected." };

  const { error } = await supabase.from("sourcing_truck_leads").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function getSupplierContacts(): Promise<SupplierContact[]> {
  const supabase = await adminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
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
  const supabase = await adminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
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
  const supabase = await adminClient();
  if (!supabase) return { error: "Database not connected." };

  const row = supplierContactInputToRow(input);
  const query = id
    ? supabase.from("sourcing_supplier_contacts").update(row).eq("id", id)
    : supabase.from("sourcing_supplier_contacts").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) return { error: error.message };
  return { contact: rowToSupplierContact(data as DbSupplierContact) };
}

export async function deleteSupplierContact(id: string): Promise<{ error?: string }> {
  const supabase = await adminClient();
  if (!supabase) return { error: "Database not connected." };

  const { error } = await supabase.from("sourcing_supplier_contacts").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function reclassifyAllLeads(): Promise<{ error?: string; updated?: number }> {
  const supabase = await adminClient();
  if (!supabase) return { error: "Database not connected." };

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

    const { error } = await supabase
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
