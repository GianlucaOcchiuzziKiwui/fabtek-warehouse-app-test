"use client";

import { Button } from "@/components/ui/button";
import { useRequestDraft } from "@/components/requests/request-draft-provider";
import { isRequestHeaderComplete } from "@/components/requests/request-header-form";
import { canAddDraftLine } from "@/lib/domain/requests/line-rules";
import { Check, Plus } from "lucide-react";
import { useState } from "react";

const SELECT_STYLES = "h-9 min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

type RequestCategory = {
  id: string;
  name: string;
};

export function AddToRequestButton({
  itemVariantId,
  categories,
  selectedCategoryId,
  stock,
}: {
  itemVariantId: string;
  categories: RequestCategory[];
  selectedCategoryId?: string;
  stock: {
    trackInventory: boolean;
    availableQuantity: number | null;
  };
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
  const canAdd = headerIsComplete && Boolean(categoryId) && validation.ok;

  function addToDraft() {
    if (!canAdd) return;
    addLine({ itemVariantId, categoryId, quantity });
    setWasAdded(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        {fixedCategory ? (
          <p className="min-w-36 flex-1 text-xs text-muted-foreground">
            Categoria <span className="block font-medium text-foreground">{fixedCategory.name}</span>
          </p>
        ) : (
          <div className="min-w-40 flex-1">
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

        <div className="w-28">
          <label htmlFor={`request-quantity-${itemVariantId}`} className="mb-1 block text-xs font-medium">
            Quantità
          </label>
          <input
            id={`request-quantity-${itemVariantId}`}
            type="number"
            value={quantityValue}
            onChange={(event) => {
              setQuantityValue(event.target.value);
              setWasAdded(false);
            }}
            min={0}
            max={stock.trackInventory && stock.availableQuantity !== null
              ? stock.availableQuantity
              : 999_999}
            step={1}
            inputMode="numeric"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          />
        </div>

        <Button type="button" size="sm" variant="accent" onClick={addToDraft} disabled={!canAdd}>
          {wasAdded ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {wasAdded ? "Aggiunto" : "Aggiungi"}
        </Button>
      </div>

      {!headerIsComplete ? (
        <p className="text-xs text-amber-700">Completa l’intestazione prima di aggiungere materiali.</p>
      ) : !validation.ok && quantityValue !== "0" ? (
        <p className="text-xs text-destructive">{validation.error.message}</p>
      ) : null}
    </div>
  );
}
