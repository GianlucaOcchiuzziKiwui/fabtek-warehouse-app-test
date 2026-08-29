"use client";

import { CatalogIcon, CATALOG_ICON_LABELS } from "@/components/catalog/catalog-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATALOG_ICON_KEYS, type CatalogIconKey } from "@/lib/data/catalog-mappers";

type CatalogIconSelectProps = {
  value: CatalogIconKey;
  onValueChange: (value: CatalogIconKey) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
};

export function CatalogIconSelect({
  value,
  onValueChange,
  name,
  id,
  disabled,
  required,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel = "Icona",
}: CatalogIconSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as CatalogIconKey)}
      name={name}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      >
        <SelectValue>
          <span className="flex min-w-0 items-center gap-2">
            <CatalogIcon iconKey={value} className="size-5 shrink-0" />
            <span className="truncate">{CATALOG_ICON_LABELS[value]}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CATALOG_ICON_KEYS.map((iconKey) => (
          <SelectItem key={iconKey} value={iconKey}>
            <span className="flex items-center gap-2">
              <CatalogIcon iconKey={iconKey} className="size-5 shrink-0" />
              <span>{CATALOG_ICON_LABELS[iconKey]}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
