"use client";

import { Button } from "@/components/ui/button";
import { useRequestDraft } from "@/components/requests/request-draft-provider";
import { buildRequestSummaryHref } from "@/lib/domain/requests/navigation";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const REQUEST_FLOW_PATHS = new Set([
  "/richieste/nuova",
  "/richieste/nuova/materiali",
  "/richieste/nuova/riepilogo",
]);

export function RequestCartHeader() {
  const pathname = usePathname();
  const { draft, isHydrated } = useRequestDraft();

  if (!REQUEST_FLOW_PATHS.has(pathname)) return null;

  const lineCount = isHydrated ? draft.lines.length : 0;
  const label = lineCount === 1
    ? "Apri riepilogo, 1 riga"
    : `Apri riepilogo, ${lineCount} righe`;
  const className = "h-10 gap-2 border-white/25 bg-white/10 px-3 text-white hover:border-white/45 hover:bg-white/20 hover:text-white";
  const content = (
    <>
      <ShoppingCart aria-hidden="true" />
      <span className="hidden sm:inline">Riepilogo</span>
      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand-gold px-1.5 py-0.5 text-xs font-bold leading-5 text-white">
        {lineCount}
      </span>
    </>
  );

  return lineCount === 0 ? (
    <Button type="button" variant="outline" className={className} disabled aria-label={label}>
      {content}
    </Button>
  ) : (
    <Button asChild variant="outline" className={className}>
      <Link href={buildRequestSummaryHref(draft.lines)} aria-label={label}>{content}</Link>
    </Button>
  );
}
