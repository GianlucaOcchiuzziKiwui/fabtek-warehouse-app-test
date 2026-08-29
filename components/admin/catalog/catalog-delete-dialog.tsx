"use client";

import {
  AlertDialog,
  AlertDialogCancel,
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
import { useEffect, useRef, useState, useTransition, type RefObject } from "react";
import { toast } from "sonner";

type CatalogDeleteDialogBodyProps = {
  entityName: string;
  mode: "delete" | "deactivate";
  referenced: boolean;
  currentIsActive: boolean;
  pending: boolean;
  error: string | null;
  cancelRef?: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CatalogDeleteDialogBody({
  entityName,
  mode,
  referenced,
  currentIsActive,
  pending,
  error,
  cancelRef,
  onCancel,
  onConfirm,
}: CatalogDeleteDialogBodyProps) {
  const referencedCanDeactivate = referenced && currentIsActive;
  const inactiveReferenced = referenced && !currentIsActive;
  const deactivating = mode === "deactivate" || referencedCanDeactivate;
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
          {inactiveReferenced ? (
            <>
              <strong className="font-semibold text-foreground">{entityName}</strong>
              {" non può essere eliminata perché è utilizzata ed è già inattiva."}
            </>
          ) : referenced ? (
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
        <AlertDialogCancel asChild>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
          >
            {inactiveReferenced ? "Chiudi" : "Annulla"}
          </Button>
        </AlertDialogCancel>
        {inactiveReferenced ? null : (
          <Button
            type="button"
            variant={deactivating ? "default" : "destructive"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {pending ? "Operazione in corso..." : deactivating ? "Disattiva" : "Elimina"}
          </Button>
        )}
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
  currentIsActive: boolean;
  mode: "delete" | "deactivate";
  blocked?: boolean;
  deleteEntity: (input: unknown) => Promise<ActionResult<CatalogMutationResult>>;
  setActive: (input: unknown) => Promise<ActionResult<CatalogMutationResult>>;
};

export function CatalogDeleteDialog({
  open,
  onOpenChange,
  entity,
  entityId,
  entityName,
  currentIsActive,
  mode,
  blocked = false,
  deleteEntity,
  setActive,
}: CatalogDeleteDialogProps) {
  const [referenced, setReferenced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busy = pending || blocked;

  useEffect(() => {
    setReferenced(false);
    setError(null);
  }, [entityId, mode, open]);

  function close() {
    if (!busy) onOpenChange(false);
  }

  function confirm() {
    if (busy || (referenced && !currentIsActive)) return;
    startTransition(async () => {
      setError(null);
      try {
        const deactivating = mode === "deactivate" || (referenced && currentIsActive);
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
    <AlertDialog open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <CatalogDeleteDialogBody
          entityName={entityName}
          mode={mode}
          referenced={referenced}
          currentIsActive={currentIsActive}
          pending={busy}
          error={error}
          cancelRef={cancelRef}
          onCancel={close}
          onConfirm={confirm}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
