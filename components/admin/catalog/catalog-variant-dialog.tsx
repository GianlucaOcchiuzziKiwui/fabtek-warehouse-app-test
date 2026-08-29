"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/domain/action-result";
import type { CatalogMutationResult } from "@/lib/domain/admin-catalog/contracts";
import type {
  AdminCatalogFormOptions,
  AdminVariantRow,
} from "@/lib/data/admin-catalog";
import { Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

type CatalogVariantFormProps = {
  entity: AdminVariantRow | null;
  options: AdminCatalogFormOptions;
  categoryIds: string[];
  isActive: boolean;
  trackInventory: boolean;
  pending: boolean;
  error: string | null;
  onCategoryChange: (categoryId: string, selected: boolean) => void;
  onActiveChange: (value: boolean) => void;
  onInventoryChange: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
};

function relationLabel(
  name: string,
  isActive: boolean,
  parentActive = true,
) {
  if (!isActive) return `${name} (inattivo)`;
  if (!parentActive) return `${name} (famiglia inattiva)`;
  return name;
}

export function CatalogVariantForm({
  entity,
  options,
  categoryIds,
  isActive,
  trackInventory,
  pending,
  error,
  onCategoryChange,
  onActiveChange,
  onInventoryChange,
  onSubmit,
  onCancel,
}: CatalogVariantFormProps) {
  const errorId = error ? "catalog-variant-error" : undefined;
  const selectedCategories = options.categories.filter((category) => (
    categoryIds.includes(category.id)
  ));
  const selectedSummary = selectedCategories.length === 1
    ? "1 categoria selezionata"
    : `${selectedCategories.length} categorie selezionate`;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{entity ? "Modifica variante" : "Nuova variante"}</DialogTitle>
        <DialogDescription>
          Configura i dati tecnici e le categorie usate nel catalogo.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="catalog-variant-component">Componente</Label>
          <select
            id="catalog-variant-component"
            name="componentId"
            defaultValue={entity?.componentId ?? ""}
            required
            disabled={pending}
            aria-describedby={errorId}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>Seleziona un componente</option>
            {options.components.map((component) => (
              <option key={component.id} value={component.id}>
                {component.family.name} / {relationLabel(
                  component.name,
                  component.isActive,
                  component.family.isActive,
                )}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="catalog-variant-fabtek-code">Codice Fabtek</Label>
          <Input
            id="catalog-variant-fabtek-code"
            name="fabtekCode"
            defaultValue={entity?.fabtekCode ?? ""}
            required
            disabled={pending}
            aria-describedby={errorId}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="catalog-variant-oracle-code">Codice Oracle/SAPIO</Label>
          <Input
            id="catalog-variant-oracle-code"
            name="oracleSapioCode"
            defaultValue={entity?.oracleSapioCode ?? ""}
            disabled={pending}
            aria-describedby={errorId}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="catalog-variant-description">Descrizione</Label>
          <textarea
            id="catalog-variant-description"
            name="description"
            defaultValue={entity?.description ?? ""}
            rows={3}
            required
            disabled={pending}
            aria-describedby={errorId}
            className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="catalog-variant-diameter">Diametro</Label>
          <Input
            id="catalog-variant-diameter"
            name="diameter"
            defaultValue={entity?.diameter ?? ""}
            disabled={pending}
            aria-describedby={errorId}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="catalog-variant-material">Materiale</Label>
          <Input
            id="catalog-variant-material"
            name="material"
            defaultValue={entity?.material ?? ""}
            required
            disabled={pending}
            aria-describedby={errorId}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="catalog-variant-connection">Connessione</Label>
          <Input
            id="catalog-variant-connection"
            name="connection"
            defaultValue={entity?.connection ?? ""}
            required
            disabled={pending}
            aria-describedby={errorId}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="catalog-variant-unit">Unità di misura</Label>
          <select
            id="catalog-variant-unit"
            name="unitOfMeasureId"
            defaultValue={entity?.unitOfMeasureId ?? ""}
            required
            disabled={pending}
            aria-describedby={errorId}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>Seleziona un&apos;unità</option>
            {options.unitsOfMeasure.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code} — {relationLabel(unit.name, unit.isActive)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset
        aria-describedby={`catalog-variant-categories-help${errorId ? ` ${errorId}` : ""}`}
        className="min-w-0 space-y-3 rounded-xl border border-input p-3"
      >
        <legend className="px-1 text-sm font-medium text-foreground">Categorie</legend>
        <p
          id="catalog-variant-categories-help"
          className="min-w-0 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]"
        >
          Seleziona almeno una categoria. {selectedSummary}
          {selectedCategories.length > 0
            ? `: ${selectedCategories.map((category) => `${category.code} — ${category.name}`).join(", ")}`
            : "."}
        </p>
        {options.categories.length > 0 ? (
          <div className="grid min-w-0 max-h-48 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {options.categories.map((category, index) => {
              const checked = categoryIds.includes(category.id);
              const categoryInputId = `catalog-variant-category-${category.id}`;
              return (
                <label
                  key={category.id}
                  htmlFor={categoryInputId}
                  className="flex min-h-10 min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25 has-checked:border-primary has-checked:bg-primary/5"
                >
                  <input
                    id={categoryInputId}
                    type="checkbox"
                    name="categoryIds"
                    value={category.id}
                    checked={checked}
                    required={index === 0 && categoryIds.length === 0}
                    disabled={pending}
                    onChange={(event) => onCategoryChange(category.id, event.target.checked)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                    {category.code} — {category.name}{category.isActive ? "" : " (inattiva)"}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-destructive">
            Crea almeno una categoria prima di salvare una variante.
          </p>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="catalog-variant-sort-order">Ordine</Label>
          <Input
            id="catalog-variant-sort-order"
            name="sortOrder"
            type="number"
            min={-1_000_000}
            max={1_000_000}
            step={1}
            defaultValue={entity?.sortOrder ?? 0}
            required
            disabled={pending}
            aria-describedby={errorId}
          />
        </div>
        <label
          htmlFor="catalog-variant-track-inventory"
          className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-input px-3 sm:self-end"
        >
          <input
            id="catalog-variant-track-inventory"
            type="checkbox"
            checked={trackInventory}
            disabled={pending}
            onChange={(event) => onInventoryChange(event.target.checked)}
            className="size-4 accent-primary"
          />
          <span className="text-sm font-medium">Traccia inventario</span>
        </label>
        <label
          htmlFor="catalog-variant-active"
          className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-input px-3 sm:self-end"
        >
          <input
            id="catalog-variant-active"
            type="checkbox"
            checked={isActive}
            disabled={pending}
            onChange={(event) => onActiveChange(event.target.checked)}
            className="size-4 accent-primary"
          />
          <span className="text-sm font-medium">Attiva</span>
        </label>
      </div>

      {error ? (
        <p id={errorId} role="alert" aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Annulla</Button>
        <Button
          type="submit"
          disabled={pending || options.categories.length === 0}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : null}
          {pending ? "Salvataggio…" : entity ? "Salva modifiche" : "Crea variante"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type CatalogVariantDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: AdminVariantRow | null;
  options: AdminCatalogFormOptions;
  blocked?: boolean;
  save: (input: unknown) => Promise<ActionResult<CatalogMutationResult>>;
};

export function CatalogVariantDialog({
  open,
  onOpenChange,
  entity,
  options,
  blocked = false,
  save,
}: CatalogVariantDialogProps) {
  const [categoryIds, setCategoryIds] = useState(() => (
    entity?.categories.map((category) => category.id) ?? []
  ));
  const [isActive, setIsActive] = useState(entity?.isActive ?? true);
  const [trackInventory, setTrackInventory] = useState(entity?.trackInventory ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setCategoryIds(entity?.categories.map((category) => category.id) ?? []);
    setIsActive(entity?.isActive ?? true);
    setTrackInventory(entity?.trackInventory ?? false);
    setError(null);
  }, [entity, open]);

  function close() {
    if (!pending && !blocked) onOpenChange(false);
  }

  function changeCategory(categoryId: string, selected: boolean) {
    setCategoryIds((current) => selected
      ? current.includes(categoryId) ? current : [...current, categoryId]
      : current.filter((id) => id !== categoryId));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || blocked) return;
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setError(null);
      try {
        const result = await save({
          id: entity?.id ?? null,
          componentId: formData.get("componentId"),
          fabtekCode: formData.get("fabtekCode"),
          oracleSapioCode: formData.get("oracleSapioCode"),
          description: formData.get("description"),
          diameter: formData.get("diameter"),
          material: formData.get("material"),
          connection: formData.get("connection"),
          unitOfMeasureId: formData.get("unitOfMeasureId"),
          categoryIds,
          trackInventory,
          sortOrder: formData.get("sortOrder"),
          isActive,
        });

        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        toast.success("Variante salvata.");
        onOpenChange(false);
      } catch {
        setError("Non è stato possibile salvare la variante. Riprova.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !pending && !blocked && onOpenChange(nextOpen)}
    >
      <DialogContent className="max-w-3xl">
        <CatalogVariantForm
          entity={entity}
          options={options}
          categoryIds={categoryIds}
          isActive={isActive}
          trackInventory={trackInventory}
          pending={pending || blocked}
          error={error}
          onCategoryChange={changeCategory}
          onActiveChange={setIsActive}
          onInventoryChange={setTrackInventory}
          onSubmit={submit}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
