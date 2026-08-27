"use client";

import { Button } from "@/components/ui/button";
import { useRequestDraft } from "@/components/requests/request-draft-provider";
import { isRequestHeaderComplete } from "@/components/requests/request-header-form";
import { canAddDraftLine } from "@/lib/domain/requests/line-rules";
import { Check, Plus } from "lucide-react";
import { useState } from "react";

const SELECT_STYLES = "h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

type RequestCategory = {
  id: string;
  name: string;
};

export function RequestItemRowControls({
  itemVariantId,
  categories,
  selectedCategoryId,
  stock,
  datasheetUrl,
}: {
  itemVariantId: string;
  categories: RequestCategory[];
  selectedCategoryId?: string;
  stock: {
    trackInventory: boolean;
    availableQuantity: number | null;
  };
  datasheetUrl: string | null;
}) {
  const { draft, addLine } = useRequestDraft();
  const fixedCategory = categories.find((category) => category.id === selectedCategoryId)
    ?? (categories.length === 1 ? categories[0] : null);
  const [categoryId, setCategoryId] = useState(fixedCategory?.id ?? "");
  const [quantityValue, setQuantityValue] = useState("0");
  const [wasAdded, setWasAdded] = useState(false);
  const quantity = Number(quantityValue);
  const validation = canAddDraftLine({ stock }, quantity);
  const headerIsComplete = isRequestHeaderComplete(draft.header);
  const showQuantityError = headerIsComplete
    && !validation.ok
    && quantityValue !== "0";
  const quantityErrorId = `request-quantity-error-${itemVariantId}`;
  const canAdd = headerIsComplete && Boolean(categoryId) && validation.ok;

  function addToDraft() {
    if (!canAdd) return;
    addLine({ itemVariantId, categoryId, quantity });
    setWasAdded(true);
  }

  return (
    <div className={`grid items-start gap-x-3 ${fixedCategory ? "grid-cols-[4rem_auto]" : "grid-cols-[9rem_auto]"}`}>
      <div>
        {fixedCategory ? (
          <span className="sr-only">Categoria: {fixedCategory.name}</span>
        ) : (
          <div className="w-36">
            <label htmlFor={`request-category-${itemVariantId}`} className="mb-1 block text-xs font-medium">
              Categoria
            </label>
            <select
              id={`request-category-${itemVariantId}`}
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setWasAdded(false);
              }}
              className={SELECT_STYLES}
              required
            >
              <option value="" disabled>Seleziona</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
        )}
        <label htmlFor={`request-quantity-${itemVariantId}`} className="sr-only">Quantità</label>
        <input
          id={`request-quantity-${itemVariantId}`}
          type="number"
          value={quantityValue}
          onChange={(event) => {
            setQuantityValue(event.target.value);
            setWasAdded(false);
          }}
          min={1}
          max={stock.trackInventory && stock.availableQuantity !== null
            ? stock.availableQuantity
            : 999_999}
          step={1}
          inputMode="numeric"
          aria-invalid={showQuantityError}
          aria-describedby={showQuantityError ? quantityErrorId : undefined}
          className="h-10 w-16 rounded-md border border-input bg-background px-2 text-center font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
        />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="accent" onClick={addToDraft} disabled={!canAdd}>
            {wasAdded ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {wasAdded ? "Aggiunto" : "Aggiungi"}
          </Button>
          {datasheetUrl ? (
            <Button asChild variant="outline">
              <a href={datasheetUrl} target="_blank" rel="noreferrer">
                Data Sheet
              </a>
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled>Data Sheet</Button>
          )}
        </div>

        {!headerIsComplete ? (
          <p className="mt-2 max-w-52 text-xs text-amber-700">Completa l’intestazione prima di aggiungere materiali.</p>
        ) : showQuantityError ? (
          <p id={quantityErrorId} className="mt-2 max-w-52 text-xs text-destructive">
            {validation.error.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
