import { Brand } from "@/components/brand";
import { BrandLogo } from "@/components/brand-logo";
import { ProfileProvider } from "@/components/auth/profile-context";
import { AppNavigation } from "@/components/layout/app-navigation";
import { LogoutButton } from "@/components/logout-button";
import { RequestDraftProvider } from "@/components/requests/request-draft-provider";
import { RequestCartHeader } from "@/components/requests/request-cart-header";
import { Toaster } from "@/components/ui/sonner";
import { requireCurrentProfile } from "@/lib/auth/current-profile";
import { ShieldCheck, UserRound } from "lucide-react";
import { Suspense } from "react";
import { isAdmin } from "@/lib/auth/permissions";

async function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const profile = await requireCurrentProfile();

  return (
    <ProfileProvider profile={profile}>
      <RequestDraftProvider key={profile.id} ownerId={profile.id}>
        <AppShell fullName={profile.full_name} isAdmin={isAdmin(profile)} showRequestCart>
          {children}
        </AppShell>
      </RequestDraftProvider>
    </ProfileProvider>
  );
}

function AppShell({
  children,
  fullName,
  isAdmin,
  showRequestCart = false,
}: {
  children?: React.ReactNode;
  fullName?: string;
  isAdmin?: boolean;
  showRequestCart?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header data-print-shell="chrome" className="bg-brand-navy text-white">
        <div className="mx-auto flex min-h-16 w-full max-w-[1128px] items-center gap-4 px-4 py-3 sm:px-6">
          <Brand />
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            
            {fullName ? (
              <div className="flex min-w-0 items-center gap-2">
                <span className="max-w-20 truncate text-xs text-[#cfe0f5] sm:max-w-64 sm:text-sm">
                  {fullName}
                </span>
                <span
                  aria-label={isAdmin ? "Amministratore" : "Utente"}
                  title={isAdmin ? "Amministratore" : "Utente"}
                  className={
                    isAdmin
                      ? "inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-amber-300/35 bg-amber-300/10 text-amber-200 sm:h-6 sm:w-auto sm:px-2"
                      : "inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-[#9fb3d6]/30 bg-white/10 text-[#cfe0f5] sm:h-6 sm:w-auto sm:px-2"
                  }
                >
                  {isAdmin ? (
                    <ShieldCheck aria-hidden="true" className="size-3.5" />
                  ) : (
                    <UserRound aria-hidden="true" className="size-3.5" />
                  )}
                  <span className="ml-1.5 hidden text-[11px] font-semibold uppercase sm:inline">
                    {isAdmin ? "Admin" : "User"}
                  </span>
                </span>
              </div>
            ) : (
              <div className="h-5 w-20 animate-pulse rounded bg-white/10 sm:w-28" />
            )}
            {fullName ? (
              <LogoutButton />
            ) : (
              <div className="h-9 w-10 animate-pulse rounded-lg bg-white/10" />
            )}
          </div>
        </div>
        <AppNavigation showRequestCart={showRequestCart} isAdmin={Boolean(isAdmin)} />
      </header>

      <main data-print-shell="main" className="mx-auto w-full max-w-[1128px] flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>

      <Toaster position="top-center" duration={8_000} />

      <footer data-print-shell="chrome" className="flex flex-wrap items-center justify-center gap-2 border-t border-border px-4 py-5 text-center text-xs text-muted-foreground sm:px-6">
        <BrandLogo className="h-auto w-20" />
        <span aria-hidden="true">|</span>
        <span>Warehouse Management | v.{process.env.NEXT_PUBLIC_APP_VERSION}</span>
      </footer>
    </div>
  );
}

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Suspense fallback={<AppShell />}>
      <AuthenticatedApp>{children}</AuthenticatedApp>
    </Suspense>
  );
}
