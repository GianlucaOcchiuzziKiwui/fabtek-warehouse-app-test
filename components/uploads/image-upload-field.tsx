"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UPLOAD_POLICIES, validateUploadMetadata, type UploadPurpose } from "@/lib/uploads/policy";

export type ImageUploadValue = { file: File | null; remove: boolean };

export function ImageUploadField({
  id, purpose, label = "Foto", currentUrl, value, onChange, disabled,
}: {
  id: string;
  purpose: UploadPurpose;
  label?: string;
  currentUrl?: string | null;
  value: ImageUploadValue;
  onChange: (value: ImageUploadValue) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!value.file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value.file]);
  const url = value.file ? preview : value.remove ? null : currentUrl;

  return (
    <div className="space-y-3">
      <Label htmlFor={id}>{label}</Label>
      {url ? (
        <Image src={url} alt={`Anteprima: ${label}`} width={320} height={180} unoptimized className="h-36 w-full rounded-lg border bg-white object-contain p-2" />
      ) : null}
      <Input
        ref={inputRef}
        id={id}
        type="file"
        accept={UPLOAD_POLICIES[purpose].accept}
        disabled={disabled}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            validateUploadMetadata(file, purpose);
            setError(null);
            onChange({ file, remove: false });
          } catch (error) {
            event.target.value = "";
            setError(error instanceof Error ? error.message : "Foto non valida.");
          }
        }}
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">JPG o PNG, massimo {UPLOAD_POLICIES[purpose].maxBytes / (1024 * 1024)} MB. La foto viene caricata al salvataggio.</p>
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
      {url || value.file ? (
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => {
          if (inputRef.current) inputRef.current.value = "";
          setError(null);
          onChange({ file: null, remove: Boolean(currentUrl) });
        }}>Rimuovi foto</Button>
      ) : null}
      {value.remove && currentUrl ? (
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ file: null, remove: false })}>Ripristina foto</Button>
      ) : null}
    </div>
  );
}
