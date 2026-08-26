import type { RequestStatusView } from "@/lib/data/request-mappers";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<RequestStatusView["tone"], string> = {
  pending: "border-status-pending/25 bg-status-pending-background text-status-pending",
  warning: "border-status-warning/25 bg-status-warning-background text-status-warning",
  good: "border-status-good/25 bg-status-good-background text-status-good",
};

export function RequestStatusBadge({ status }: { status: RequestStatusView }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        STATUS_STYLES[status.tone],
      )}
    >
      {status.label}
    </span>
  );
}
