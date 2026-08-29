"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/domain/action-result";
import type {
  AdminCatalogTab,
  CatalogMutationResult,
} from "@/lib/domain/admin-catalog/contracts";
import { Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

type CatalogDeleteDialogBodyProps = {
  entityName: string;
  mode: "delete" | "deactivate";
  referenced: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CatalogDeleteDialogBody({
  entityName,
  mode,
  referenced,
  pending,
  error,
  onCancel,
  onConfirm,
}: CatalogDeleteDialogBodyProps) {
  const deactivating = mode === "deactivate" || referenced;
  const title = referenced
    ? "Voce utilizzata"
    : deactivating
      ? "Disattivare la voce?"
      : "Eliminare la voce?";

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>
          {referenced ? (
            <>
              <strong className="font-semibold text-foreground">{entityName}</strong>
              {" non può essere eliminata perché è utilizzata. Puoi disattivarla senza perdere i collegamenti esistenti."}
            </>
          ) : deactivating ? (
            <>
              <strong className="font-semibold text-foreground">{entityName}</strong>
              {" non sarà più visibile nel catalogo pubblico. I collegamenti esistenti resteranno invariati."}
            </>
          ) : (
            <>
              <strong className="font-semibold text-foreground">{entityName}</strong>
              {" verrà eliminata definitivamente se non è utilizzata."}
            </>
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {error ? <p role="alert" aria-live="polite" className="text-sm text-destructive">{error}</p> : null}

      <AlertDialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Annulla</Button>
        <Button
          type="button"
          variant={deactivating ? "default" : "destructive"}
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {pending ? "Operazione in corso..." : deactivating ? "Disattiva" : "Elimina"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

type CatalogDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: AdminCatalogTab;
  entityId: string;
  entityName: string;
  mode: "delete" | "deactivate";
  deleteEntity: (input: unknown) => Promise<ActionResult<CatalogMutationResult>>;
  setActive: (input: unknown) => Promise<ActionResult<CatalogMutationResult>>;
};

export function CatalogDeleteDialog({
  open,
  onOpenChange,
  entity,
  entityId,
  entityName,
  mode,
  deleteEntity,
  setActive,
}: CatalogDeleteDialogProps) {
  const [referenced, setReferenced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setReferenced(false);
    setError(null);
  }, [entityId, mode, open]);

  function close() {
    if (!pending) onOpenChange(false);
  }

  function confirm() {
    startTransition(async () => {
      setError(null);
      try {
        const deactivating = mode === "deactivate" || referenced;
        const result = deactivating
          ? await setActive({ entity, id: entityId, isActive: false })
          : await deleteEntity({ entity, id: entityId });

        if (!result.ok) {
          if (!deactivating && result.error.code === "CATALOG_ENTITY_REFERENCED") {
            setReferenced(true);
            return;
          }
          setError(result.error.message);
          return;
        }
        toast.success(deactivating ? "Voce disattivata." : "Voce eliminata.");
        onOpenChange(false);
      } catch {
        setError("Non è stato possibile completare l'operazione. Riprova.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}>
      <AlertDialogContent>
        <CatalogDeleteDialogBody
          entityName={entityName}
          mode={mode}
          referenced={referenced}
          pending={pending}
          error={error}
          onCancel={close}
          onConfirm={confirm}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
