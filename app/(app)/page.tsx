import { HomeActions } from "@/components/home/home-actions";
import { BrandLogo } from "@/components/brand-logo";
import { PageHeading } from "@/components/shared/page-heading";
import { requireCurrentProfile } from "@/lib/auth/current-profile";
import { isAdmin } from "@/lib/auth/permissions";
import { Suspense } from "react";

async function HomeActionsForCurrentProfile() {
  const profile = await requireCurrentProfile();

  return <HomeActions isAdmin={isAdmin(profile)} />;
}

export default function HomePage() {
  return (
    <div className="space-y-8">
      <PageHeading
        title={(
          <span className="flex flex-wrap items-center gap-3">
            <span>Materiali</span>
            <BrandLogo className="h-auto w-48 sm:w-60" />
          </span>
        )}
        description="Scegli l'operazione da eseguire."
      />
      <Suspense
        fallback={(
          <div
            aria-label="Caricamento azioni"
            className="h-64 animate-pulse rounded-xl border border-border bg-muted/60"
          />
        )}
      >
        <HomeActionsForCurrentProfile />
      </Suspense>
    </div>
  );
}
