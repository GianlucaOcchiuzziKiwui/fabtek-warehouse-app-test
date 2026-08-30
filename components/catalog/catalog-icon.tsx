import {
  Bolt,
  Boxes,
  Cable,
  CircuitBoard,
  CircleDot,
  CircleGauge,
  Cog,
  Component,
  Cylinder,
  Droplets,
  Factory,
  Fan,
  Filter,
  FlaskConical,
  Gauge,
  GitBranch,
  PackageSearch,
  Pipette,
  Plug,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Thermometer,
  Waves,
  Wind,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps } from "react";

import type { CatalogIconKey } from "@/lib/data/catalog-mappers";

const CATALOG_ICONS: Record<CatalogIconKey, LucideIcon> = {
  bolt: Bolt,
  boxes: Boxes,
  cable: Cable,
  "circuit-board": CircuitBoard,
  "circle-dot": CircleDot,
  "circle-gauge": CircleGauge,
  cog: Cog,
  component: Component,
  cylinder: Cylinder,
  droplets: Droplets,
  factory: Factory,
  fan: Fan,
  filter: Filter,
  "flask-conical": FlaskConical,
  gauge: Gauge,
  "git-branch": GitBranch,
  "package-search": PackageSearch,
  pipette: Pipette,
  plug: Plug,
  "shield-check": ShieldCheck,
  snowflake: Snowflake,
  sparkles: Sparkles,
  thermometer: Thermometer,
  waves: Waves,
  wind: Wind,
  wrench: Wrench,
};

export const CATALOG_ICON_LABELS: Record<CatalogIconKey, string> = {
  bolt: "Bullone",
  boxes: "Scatole",
  cable: "Cavo",
  "circuit-board": "Circuito",
  "circle-dot": "Cerchio con punto",
  "circle-gauge": "Indicatore circolare",
  cog: "Ingranaggio",
  component: "Componente",
  cylinder: "Cilindro",
  droplets: "Gocce",
  factory: "Fabbrica",
  fan: "Ventola",
  filter: "Filtro",
  "flask-conical": "Beuta",
  gauge: "Indicatore",
  "git-branch": "Diramazione",
  "package-search": "Ricerca pacco",
  pipette: "Pipetta",
  plug: "Spina",
  "shield-check": "Protezione verificata",
  snowflake: "Fiocco di neve",
  sparkles: "Scintille",
  thermometer: "Termometro",
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
