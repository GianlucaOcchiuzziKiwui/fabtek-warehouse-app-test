import { HomeActions } from "@/components/home/home-actions";
import { PageHeading } from "@/components/shared/page-heading";
import { requireCurrentProfile } from "@/lib/auth/current-profile";
import { isAdmin } from "@/lib/auth/permissions";

export default async function HomePage() {
  const profile = await requireCurrentProfile();

  return (
    <div className="space-y-8">
      <PageHeading
        title="Materiali Fabtek"
        description="Scegli l'operazione da eseguire."
      />
      <HomeActions isAdmin={isAdmin(profile)} />
    </div>
  );
}
