import {
  Boxes,
  Cable,
  CircleDot,
  CircleGauge,
  Component,
  Cylinder,
  Droplets,
  Factory,
  FlaskConical,
  Gauge,
  GitBranch,
  PackageSearch,
  Plug,
  Snowflake,
  Sparkles,
  Waves,
  Wind,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps } from "react";

import type { CatalogIconKey } from "@/lib/data/catalog-mappers";

const CATALOG_ICONS: Record<CatalogIconKey, LucideIcon> = {
  boxes: Boxes,
  cable: Cable,
  "circle-dot": CircleDot,
  "circle-gauge": CircleGauge,
  component: Component,
  cylinder: Cylinder,
  droplets: Droplets,
  factory: Factory,
  "flask-conical": FlaskConical,
  gauge: Gauge,
  "git-branch": GitBranch,
  "package-search": PackageSearch,
  plug: Plug,
  snowflake: Snowflake,
  sparkles: Sparkles,
  waves: Waves,
  wind: Wind,
  wrench: Wrench,
};

export const CATALOG_ICON_LABELS: Record<CatalogIconKey, string> = {
  boxes: "Scatole",
  cable: "Cavo",
  "circle-dot": "Cerchio con punto",
  "circle-gauge": "Indicatore circolare",
  component: "Componente",
  cylinder: "Cilindro",
  droplets: "Gocce",
  factory: "Fabbrica",
  "flask-conical": "Beuta",
  gauge: "Indicatore",
  "git-branch": "Diramazione",
  "package-search": "Ricerca pacco",
  plug: "Spina",
  snowflake: "Fiocco di neve",
  sparkles: "Scintille",
  waves: "Onde",
  wind: "Vento",
  wrench: "Chiave inglese",
};

export function getCatalogIcon(iconKey: CatalogIconKey): LucideIcon {
  return CATALOG_ICONS[iconKey];
}

export function CatalogIcon({
  iconKey,
  ...props
}: ComponentProps<LucideIcon> & { iconKey: CatalogIconKey }) {
  const Icon = getCatalogIcon(iconKey);

  return (
    <Icon
      aria-hidden="true"
      focusable="false"
      data-catalog-icon={iconKey}
      {...props}
    />
  );
}
