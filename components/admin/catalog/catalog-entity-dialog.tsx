"use client";

import { CatalogIconSelect } from "@/components/admin/catalog/catalog-icon-select";
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
import type { CatalogIconKey } from "@/lib/data/catalog-mappers";
import type { ActionResult } from "@/lib/domain/action-result";
import type { CatalogMutationResult } from "@/lib/domain/admin-catalog/contracts";
import type {
  AdminCategoryRow,
  AdminComponentRow,
  AdminFamilyRow,
  AdminRelationOption,
} from "@/lib/data/admin-catalog";
import { Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

export type EditableCatalogEntityType = "categorie" | "famiglie" | "componenti";
export type EditableCatalogEntity = AdminCategoryRow | AdminFamilyRow | AdminComponentRow;

type CatalogEntityFormProps = {
  entityType: EditableCatalogEntityType;
  entity: EditableCatalogEntity | null;
  families: AdminRelationOption[];
  pending: boolean;
  error: string | null;
  iconKey?: CatalogIconKey;
  isActive?: boolean;
  onIconChange?: (value: CatalogIconKey) => void;
  onActiveChange?: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
};

const ENTITY_COPY = {
  categorie: {
    singular: "categoria",
    createTitle: "Nuova categoria",
    editTitle: "Modifica categoria",
    description: "Definisci come la categoria appare nel catalogo.",
  },
  famiglie: {
    singular: "famiglia",
    createTitle: "Nuova famiglia",
    editTitle: "Modifica famiglia",
    description: "Configura il gruppo tecnico dei componenti.",
  },
  componenti: {
    singular: "componente",
    createTitle: "Nuovo componente",
    editTitle: "Modifica componente",
    description: "Associa il componente alla sua famiglia tecnica.",
  },
} as const;

function matchingEntity(
  entityType: EditableCatalogEntityType,
  entity: EditableCatalogEntity | null,
) {
  if (!entity) return null;
  if (entityType === "categorie" && entity.kind === "categoria") return entity;
  if (entityType === "famiglie" && entity.kind === "famiglia") return entity;
  if (entityType === "componenti" && entity.kind === "componente") return entity;
  return null;
}

export function CatalogEntityForm({
  entityType,
  entity: rawEntity,
  families,
  pending,
  error,
  iconKey,
  isActive,
  onIconChange,
  onActiveChange,
  onSubmit,
  onCancel,
}: CatalogEntityFormProps) {
  const entity = matchingEntity(entityType, rawEntity);
  const copy = ENTITY_COPY[entityType];
  const selectedIcon = iconKey ?? entity?.iconKey ?? "boxes";
  const active = isActive ?? entity?.isActive ?? true;
  const errorId = error ? "catalog-entity-error" : undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{entity ? copy.editTitle : copy.createTitle}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        {entityType === "categorie" ? (
          <div className="space-y-2">
            <Label htmlFor="catalog-entity-code">Codice</Label>
            <Input
              id="catalog-entity-code"
              name="code"
              defaultValue={entity?.kind === "categoria" ? entity.code : ""}
              maxLength={80}
              required
              disabled={pending}
              aria-describedby={errorId}
            />
          </div>
        ) : null}

        {entityType === "famiglie" ? (
          <div className="space-y-2">
            <Label htmlFor="catalog-entity-source-code">Codice sorgente</Label>
            <Input
              id="catalog-entity-source-code"
              name="sourceCode"
              defaultValue={entity?.kind === "famiglia" ? entity.sourceCode ?? "" : ""}
              maxLength={80}
              disabled={pending}
              aria-describedby={errorId}
            />
          </div>
        ) : null}

        {entityType === "componenti" ? (
          <div className="space-y-2">
            <Label htmlFor="catalog-entity-family">Famiglia</Label>
            <select
              id="catalog-entity-family"
              name="familyId"
              defaultValue={entity?.kind === "componente" ? entity.familyId : ""}
              required
              disabled={pending}
              aria-describedby={errorId}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>Seleziona una famiglia</option>
              {families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}{family.isActive ? "" : " (inattiva)"}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="catalog-entity-name">Nome</Label>
          <Input
            id="catalog-entity-name"
            name="name"
            defaultValue={entity?.name ?? ""}
            maxLength={entityType === "componenti" ? 200 : 160}
            required
            disabled={pending}
            aria-describedby={errorId}
          />
        </div>

        {entityType === "componenti" ? (
          <div className="space-y-2">
            <Label htmlFor="catalog-entity-description">Descrizione</Label>
            <textarea
              id="catalog-entity-description"
              name="description"
              defaultValue={entity?.kind === "componente" ? entity.description ?? "" : ""}
              rows={3}
              disabled={pending}
              aria-describedby={errorId}
              className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="catalog-entity-subtitle">Sottotitolo</Label>
            <Input
              id="catalog-entity-subtitle"
              name="subtitle"
              defaultValue={
                entity?.kind === "categoria" || entity?.kind === "famiglia"
                  ? entity.subtitle ?? ""
                  : ""
              }
              disabled={pending}
              aria-describedby={errorId}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="catalog-entity-icon">Icona</Label>
          <CatalogIconSelect
            id="catalog-entity-icon"
            name="iconKey"
            value={selectedIcon}
            onValueChange={onIconChange ?? (() => {})}
            required
            disabled={pending}
            aria-describedby={errorId}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="catalog-entity-sort-order">Ordine</Label>
            <Input
              id="catalog-entity-sort-order"
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
          <div className="flex min-h-10 items-center gap-3 rounded-lg border border-input px-3">
            <input
              id="catalog-entity-active"
              type="checkbox"
              checked={active}
              onChange={(event) => onActiveChange?.(event.target.checked)}
              disabled={pending}
              className="size-4 accent-primary"
            />
            <Label htmlFor="catalog-entity-active">Attiva</Label>
          </div>
        </div>
      </div>

      {error ? (
        <p id={errorId} role="alert" aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Annulla</Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {pending
            ? "Salvataggio..."
            : entity
              ? "Salva modifiche"
              : `Crea ${copy.singular}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

type CatalogEntityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: EditableCatalogEntityType;
  entity: EditableCatalogEntity | null;
  families: AdminRelationOption[];
  blocked?: boolean;
  save: (input: unknown) => Promise<ActionResult<CatalogMutationResult>>;
};

export function CatalogEntityDialog({
  open,
  onOpenChange,
  entityType,
  entity,
  families,
  blocked = false,
  save,
}: CatalogEntityDialogProps) {
  const [iconKey, setIconKey] = useState<CatalogIconKey>(entity?.iconKey ?? "boxes");
  const [isActive, setIsActive] = useState(entity?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setIconKey(entity?.iconKey ?? "boxes");
    setIsActive(entity?.isActive ?? true);
    setError(null);
  }, [entity, open]);

  function close() {
    if (!pending && !blocked) onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || blocked) return;
    const formData = new FormData(event.currentTarget);
    const base = {
      id: entity?.id ?? null,
      name: formData.get("name"),
      iconKey,
      sortOrder: formData.get("sortOrder"),
      isActive,
    };

    startTransition(async () => {
      setError(null);
      try {
        const input = entityType === "categorie"
          ? {
              ...base,
              code: formData.get("code"),
              subtitle: formData.get("subtitle"),
            }
          : entityType === "famiglie"
            ? {
                ...base,
                sourceCode: formData.get("sourceCode"),
                subtitle: formData.get("subtitle"),
              }
            : {
                ...base,
                familyId: formData.get("familyId"),
                description: formData.get("description"),
              };
        const result = await save(input);

        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        toast.success(`${ENTITY_COPY[entityType].singular[0].toUpperCase()}${ENTITY_COPY[entityType].singular.slice(1)} salvata.`);
        onOpenChange(false);
      } catch {
        setError("Non è stato possibile salvare la voce. Riprova.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !pending && !blocked && onOpenChange(nextOpen)}
    >
      <DialogContent>
        <CatalogEntityForm
          entityType={entityType}
          entity={entity}
          families={families}
          pending={pending || blocked}
          error={error}
          iconKey={iconKey}
          isActive={isActive}
          onIconChange={setIconKey}
          onActiveChange={setIsActive}
          onSubmit={submit}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
