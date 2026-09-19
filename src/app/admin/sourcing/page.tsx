import Link from "next/link";
import ImportSeedButton from "@/components/admin/sourcing/ImportSeedButton";
import MatchStatusBadge from "@/components/admin/sourcing/MatchStatusBadge";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import { buildDailyDigestPreview } from "@/lib/sourcing/digest";
import { getBuyingProfile, getSupplierContacts, getTruckLeads } from "@/lib/sourcing/db";
import { earliestAcceptedModelYear } from "@/lib/sourcing/match";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MATCH_STATUS_LABELS, type MatchStatus } from "@/types/sourcing";

export default async function SourcingOverviewPage() {
  const dbReady = isSupabaseConfigured();
  const [profile, leads, contacts] = await Promise.all([
    getBuyingProfile(),
    getTruckLeads(),
    getSupplierContacts(),
  ]);
  const digest = buildDailyDigestPreview(leads);
  const earliest = earliestAcceptedModelYear(profile);

  const counts = (Object.keys(MATCH_STATUS_LABELS) as MatchStatus[]).map((status) => ({
    status,
    label: MATCH_STATUS_LABELS[status],
    count: leads.filter((l) => l.matchStatus === status).length,
  }));

  const followUps = contacts
    .filter((c) => c.nextFollowUpDate)
    .sort((a, b) => String(a.nextFollowUpDate).localeCompare(String(b.nextFollowUpDate)))
    .slice(0, 5);

  return (
    <div>
      <SourcingNav active="overview" />
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:py-8">
        {!dbReady && (
          <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>Database not connected.</strong> Sourcing requires Supabase plus{" "}
            <code className="bg-amber-100 px-1">supabase/sourcing-schema.sql</code>. Use the same
            admin login as inventory. No sourcing data is exposed publicly.
          </div>
        )}

        <section className="bg-white border border-neutral-200 p-6">
          <h2 className="text-lg font-bold">Active buying profile</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Cummins + automatic + box {profile.requiredBoxLengthsFt.join("/")}&apos; · GVWR{" "}
            {profile.gvwrMustBeStrictlyBelow ? "strictly below" : "≤"}{" "}
            {profile.maxGvwrLbs.toLocaleString()} · max mileage {profile.maxMileage.toLocaleString()}{" "}
            · earliest model year <strong>{earliest}</strong> · liftgate preferred · within{" "}
            {profile.preferredMaxDrivingMiles.toLocaleString()} driving miles of{" "}
            {profile.originLabel} preferred · max price{" "}
            {profile.maxPrice == null ? "unset (not filtered)" : `$${profile.maxPrice.toLocaleString()}`}
          </p>
          <Link
            href="/admin/sourcing/profile"
            className="mt-4 inline-flex text-sm font-semibold text-[#fc0527] hover:underline"
          >
            Edit buying profile →
          </Link>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {counts.map((c) => (
            <Link
              key={c.status}
              href={`/admin/sourcing/leads?status=${c.status}`}
              className="border border-neutral-200 bg-white p-4 hover:border-[#fc0527]"
            >
              <div className="mb-2">
                <MatchStatusBadge status={c.status} />
              </div>
              <p className="text-3xl font-bold">{c.count}</p>
              <p className="text-xs text-neutral-500">{c.label}</p>
            </Link>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="border border-neutral-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-bold">Truck leads</h2>
              <Link
                href="/admin/sourcing/leads/new"
                className="text-sm font-semibold text-[#fc0527] hover:underline"
              >
                + Add lead
              </Link>
            </div>
            <p className="text-sm text-neutral-600">{leads.length} total in private sourcing DB</p>
            <Link href="/admin/sourcing/leads" className="text-sm font-semibold hover:underline">
              Review all leads →
            </Link>
            {dbReady && <ImportSeedButton />}
          </div>

          <div className="border border-neutral-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-bold">Supplier contacts</h2>
              <Link
                href="/admin/sourcing/contacts/new"
                className="text-sm font-semibold text-[#fc0527] hover:underline"
              >
                + Add contact
              </Link>
            </div>
            <p className="text-sm text-neutral-600">{contacts.length} contacts</p>
            {followUps.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {followUps.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/sourcing/contacts/${c.id}`} className="hover:underline">
                      {c.company}
                    </Link>
                    <span className="text-neutral-500"> — follow up {c.nextFollowUpDate}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">No follow-ups scheduled.</p>
            )}
            <Link href="/admin/sourcing/contacts" className="text-sm font-semibold hover:underline">
              Manage contacts →
            </Link>
          </div>
        </section>

        <section className="border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-bold">Internet search pilot</h2>
            <Link
              href="/admin/sourcing/search"
              className="text-sm font-semibold text-[#fc0527] hover:underline"
            >
              Run search →
            </Link>
          </div>
          <p className="mt-2 text-sm text-neutral-600">
            Staff-only “Run search now” (no cron). Finds individual listings and seller call routes
            from the active buying profile; results land here as private leads.
          </p>
        </section>

        <section className="border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-bold">Daily digest preview (last 24h)</h2>
            <Link
              href="/admin/sourcing/digest"
              className="text-sm font-semibold text-[#fc0527] hover:underline"
            >
              Open preview →
            </Link>
          </div>
          <p className="mt-2 text-sm text-neutral-600">
            {digest.newListingCount} new · {digest.listingChangeCount} changed ·{" "}
            {digest.seenAgainCount} seen again. Email is not scheduled or sent yet.
          </p>
          <Link
            href="/admin/sourcing/intake"
            className="mt-3 inline-flex text-sm font-semibold text-[#fc0527] hover:underline"
          >
            Open CSV intake →
          </Link>
        </section>
      </div>
    </div>
  );
}
