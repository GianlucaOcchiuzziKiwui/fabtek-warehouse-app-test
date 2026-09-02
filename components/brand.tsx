import Link from "next/link";

import { BrandLogo } from "./brand-logo";

export function Brand() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 text-white focus-visible:rounded-sm"
      aria-label="Fabtek Materiali - Home"
    >
      <span className="rounded-md bg-transparent px-2">
        <BrandLogo className="h-auto w-32 sm:w-40" />
      </span>
    </Link>
  );
}
