import {
  getAvailabilityLabel,
  type StockView,
} from "@/lib/data/catalog-mappers";
import { cn } from "@/lib/utils";

const TONE_STYLES = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

export function AvailabilityBadge({ stock }: { stock: StockView }) {
  const availability = getAvailabilityLabel(stock);

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        TONE_STYLES[availability.tone],
      )}
    >
      {availability.label}
    </span>
  );
}
