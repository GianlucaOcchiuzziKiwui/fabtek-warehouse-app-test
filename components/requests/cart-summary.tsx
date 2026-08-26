"use client";

import { Button } from "@/components/ui/button";
import { useRequestDraft } from "@/components/requests/request-draft-provider";
import { ClipboardList, ShoppingCart } from "lucide-react";
import Link from "next/link";

function summaryHref(lines: { itemVariantId: string; categoryId: string }[]) {
  const params = new URLSearchParams();
  for (const line of lines) {
    params.append("line", `${line.itemVariantId}:${line.categoryId}`);
  }
  const query = params.toString();
  return query ? `/richieste/nuova/riepilogo?${query}` : "/richieste/nuova/riepilogo";
}

export function CartSummary() {
  const { draft } = useRequestDraft();
  const lineCount = draft.lines.length;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-20 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:sticky lg:inset-x-auto lg:top-4 lg:bottom-auto lg:block">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShoppingCart aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="font-semibold">Bozza richiesta</p>
          <p className="text-sm text-muted-foreground">
            {lineCount} {lineCount === 1 ? "riga nel carrello" : "righe nel carrello"}
          </p>
        </div>
      </div>
      {lineCount === 0 ? (
        <Button className="shrink-0 lg:mt-3 lg:w-full" disabled>
          <ClipboardList aria-hidden="true" />Riepilogo
        </Button>
      ) : (
        <Button asChild className="shrink-0 lg:mt-3 lg:w-full">
          <Link href={summaryHref(draft.lines)}>
            <ClipboardList aria-hidden="true" />
            <span className="lg:hidden">Riepilogo</span>
            <span className="hidden lg:inline">Apri riepilogo</span>
          </Link>
        </Button>
      )}
    </aside>
  );
}
