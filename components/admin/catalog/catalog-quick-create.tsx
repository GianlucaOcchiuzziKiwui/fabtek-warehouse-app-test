"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/domain/action-result";
import type { CatalogMutationResult } from "@/lib/domain/admin-catalog/contracts";
import type {
  AdminCategoryOption,
  AdminComponentOption,
  AdminRelationOption,
  AdminUnitOption,
} from "@/lib/data/admin-catalog";
import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

type CreateAction = (input: unknown) => Promise<ActionResult<CatalogMutationResult>>;
export type QuickCreatedOption =
  | AdminRelationOption
  | AdminCategoryOption
  | AdminComponentOption
  | AdminUnitOption;

type CatalogQuickCreateProps = {
  kind: "family" | "category" | "component" | "unit";
  families?: AdminRelationOption[];
  disabled?: boolean;
  create: CreateAction;
  createFamily?: CreateAction;
  onCreated: (option: QuickCreatedOption) => void;
};

const COPY = {
  family: { trigger: "Nuova famiglia", title: "Aggiungi famiglia", success: "Famiglia aggiunta." },
  category: { trigger: "Nuova categoria", title: "Aggiungi categoria", success: "Categoria aggiunta." },
  component: { trigger: "Nuovo componente", title: "Aggiungi componente", success: "Componente aggiunto." },
  unit: { trigger: "Nuova unità", title: "Aggiungi unità", success: "Unità aggiunta." },
} as const;

const EMPTY_FAMILIES: AdminRelationOption[] = [];

export function CatalogQuickCreate({
  kind,
  families = EMPTY_FAMILIES,
  disabled = false,
  create,
  createFamily,
  onCreated,
}: CatalogQuickCreateProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [allowsFraction, setAllowsFraction] = useState(false);
  const [familyOptions, setFamilyOptions] = useState(families);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const copy = COPY[kind];
  const panelId = `quick-create-${kind}-panel`;

  useEffect(() => {
    setFamilyOptions(families);
  }, [families]);

  function reset() {
    setCode("");
    setName("");
    setFamilyId("");
    setAllowsFraction(false);
    setError(null);
  }

  function close() {
    if (pending) return;
    reset();
    setOpen(false);
  }

  function submit() {
    if (pending || disabled) return;
    const normalizedName = name.trim();
    const normalizedCode = code.trim();
    if (!normalizedName || ((kind === "category" || kind === "unit") && !normalizedCode)) {
      setError("Compila i campi richiesti.");
      return;
    }
    if (kind === "component" && !familyId) {
      setError("Seleziona una famiglia.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const input = kind === "family"
        ? {
            id: null,
            sourceCode: null,
            name: normalizedName,
            subtitle: null,
            iconKey: "boxes",
            sortOrder: 0,
            isActive: true,
          }
        : kind === "category"
          ? {
              id: null,
              code: normalizedCode,
              name: normalizedName,
              subtitle: null,
              iconKey: "factory",
              sortOrder: 0,
              isActive: true,
            }
          : kind === "component"
            ? {
                id: null,
                familyId,
                name: normalizedName,
                description: null,
                iconKey: "component",
                sortOrder: 0,
                isActive: true,
              }
            : {
                code: normalizedCode,
                name: normalizedName,
                allowsFraction,
              };

      try {
        const result = await create(input);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }

        let option: QuickCreatedOption;
        if (kind === "category") {
          option = {
            id: result.data.id,
            code: normalizedCode,
            name: normalizedName,
            isActive: true,
          };
        } else if (kind === "unit") {
          option = {
            id: result.data.id,
            code: normalizedCode,
            name: normalizedName,
            isActive: true,
          };
        } else if (kind === "component") {
          const family = familyOptions.find((item) => item.id === familyId);
          if (!family) {
            setError("La famiglia selezionata non è più disponibile.");
            return;
          }
          option = {
            id: result.data.id,
            familyId,
            family,
            name: normalizedName,
            isActive: true,
          };
        } else {
          option = { id: result.data.id, name: normalizedName, isActive: true };
        }

        onCreated(option);
        toast.success(copy.success);
        reset();
        setOpen(false);
      } catch {
        setError("Non è stato possibile creare la voce. Riprova.");
      }
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-expanded="false"
        aria-controls={panelId}
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden="true" />
        {copy.trigger}
      </Button>
    );
  }

  return (
    <section
      id={panelId}
      aria-label={copy.title}
      className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{copy.title}</p>
        <Button type="button" variant="ghost" size="icon-sm" disabled={pending} onClick={close} aria-label="Chiudi creazione rapida">
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {kind === "category" || kind === "unit" ? (
          <div className="space-y-2">
            <Label htmlFor={`quick-create-${kind}-code`}>Codice</Label>
            <Input
              id={`quick-create-${kind}-code`}
              value={code}
              maxLength={kind === "unit" ? 40 : 80}
              disabled={pending}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
        ) : null}

        {kind === "component" ? (
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="quick-create-component-family">Famiglia</Label>
              {createFamily ? (
                <CatalogQuickCreate
                  kind="family"
                  create={createFamily}
                  disabled={pending}
                  onCreated={(option) => {
                    const family = option as AdminRelationOption;
                    setFamilyOptions((current) => [...current, family]);
                    setFamilyId(family.id);
                  }}
                />
              ) : null}
            </div>
            <select
              id="quick-create-component-family"
              value={familyId}
              disabled={pending}
              onChange={(event) => setFamilyId(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>Seleziona una famiglia</option>
              {familyOptions.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}{family.isActive ? "" : " (inattiva)"}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className={kind === "family" || kind === "component" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
          <Label htmlFor={`quick-create-${kind}-name`}>Nome</Label>
          <Input
            id={`quick-create-${kind}-name`}
            value={name}
            maxLength={kind === "component" ? 200 : kind === "unit" ? 120 : 160}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        {kind === "unit" ? (
          <label htmlFor="quick-create-unit-fraction" className="flex min-h-10 items-center gap-3 rounded-lg border border-input px-3 sm:col-span-2">
            <input
              id="quick-create-unit-fraction"
              type="checkbox"
              checked={allowsFraction}
              disabled={pending}
              onChange={(event) => setAllowsFraction(event.target.checked)}
              className="size-4 accent-primary"
            />
            <span className="text-sm font-medium">Consente quantità decimali</span>
          </label>
        ) : null}
      </div>

      {error ? <p role="alert" aria-live="polite" className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={close}>Annulla</Button>
        <Button type="button" size="sm" disabled={pending || disabled} onClick={submit}>
          {pending ? <><Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Aggiunta…</> : "Aggiungi"}
        </Button>
      </div>
    </section>
  );
}
