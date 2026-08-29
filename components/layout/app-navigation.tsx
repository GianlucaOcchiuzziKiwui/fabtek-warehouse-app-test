import { ClipboardList, House, PackageSearch, Settings2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { RequestCartHeader } from "../requests/request-cart-header";

const navigationItems = [
  { href: "/", label: "Home", icon: House },
  { href: "/catalogo", label: "Catalogo", icon: PackageSearch },
] as const;

export function AppNavigation({
  isAdmin,
  showRequestCart = false,
}: {
  isAdmin: boolean;
  showRequestCart?: boolean;
}) {
  return (
    <nav
      aria-label="Navigazione principale"
      className="border-t border-white/15"
    >
      <div className="mx-auto flex w-full max-w-[1128px] gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        {navigationItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[#d9e8f7] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </Link>
        ))}
        <Link
          href="/richieste"
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[#d9e8f7] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <ClipboardList aria-hidden="true" className="size-4" />
          Richieste
        </Link>
        {isAdmin ? (
          <Link
            href="/admin/richieste"
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[#d9e8f7] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Settings2 aria-hidden="true" className="size-4" />
            Gestisci richieste
          </Link>
        ) : null}
        {showRequestCart ? (
          <Suspense fallback={null}>
            <RequestCartHeader className="ml-auto order-first md:order-last" />
          </Suspense>
        ) : null}
      </div>
    </nav>
  );
}
