import { HomeActions } from "@/components/home/home-actions";
import { requireCurrentProfile } from "@/lib/auth/current-profile";
import { isAdmin } from "@/lib/auth/permissions";
import { Suspense } from "react";

async function HomeActionsForCurrentProfile() {
  const profile = await requireCurrentProfile();

  return <HomeActions isAdmin={isAdmin(profile)} />;
}

export default function HomePage() {
  return (
    <div>
      <h1 className="sr-only">Azioni principali</h1>
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
