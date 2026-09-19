import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import BuyingProfileForm from "@/components/admin/sourcing/BuyingProfileForm";
import { getBuyingProfile } from "@/lib/sourcing/db";

export default async function SourcingProfilePage() {
  const profile = await getBuyingProfile();

  return (
    <div>
      <SourcingNav active="profile" />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <BuyingProfileForm profile={profile} />
      </div>
    </div>
  );
}
