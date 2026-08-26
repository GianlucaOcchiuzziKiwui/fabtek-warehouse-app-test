import Link from "next/link";

export function Brand() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 text-white focus-visible:rounded-sm"
      aria-label="Fabtek Materiali - Home"
    >
      <svg
        aria-hidden="true"
        className="size-8 shrink-0"
        viewBox="0 0 40 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      >
        <path d="M20 4 35 12v16l-15 8-15-8V12Z" />
        <path d="M14 16h12M14 20h9M14 24h6" strokeLinecap="round" />
      </svg>
      <span className="grid leading-none">
        <span className="font-heading text-xl font-bold">FABTEK</span>
        <span className="mt-1 text-[11px] text-[#9fb3d6]">
          Richiesta Materiali
        </span>
      </span>
    </Link>
  );
}
