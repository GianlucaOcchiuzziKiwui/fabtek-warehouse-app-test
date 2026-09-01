import Link from "next/link";

import { BrandLogo } from "./brand-logo";

export function Brand() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 text-white focus-visible:rounded-sm"
      aria-label="Fabtek Materiali - Home"
    >
      <span className="rounded-md bg-white px-2 py-1">
        <BrandLogo className="h-auto w-32 sm:w-40" />
      </span>
      <span className="hidden text-xs font-medium text-[#cfe0f5] lg:inline">
        Richiesta Materiali
      </span>
    </Link>
  );
}
