type DraftLineAvailability = {
  stock: {
    trackInventory: boolean;
    availableQuantity: number | null;
  };
};

type DraftLineErrorCode =
  | "INVALID_QUANTITY"
  | "AVAILABILITY_UNKNOWN"
  | "INSUFFICIENT_STOCK";

export type DraftLineValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: DraftLineErrorCode;
        message: string;
      };
    };

const MAX_QUANTITY = 999_999;

export function stepDraftQuantity(
  currentValue: string,
  delta: -1 | 1,
  maximum: number,
) {
  const parsedValue = Number(currentValue);
  const currentQuantity = Number.isInteger(parsedValue) ? parsedValue : 0;
  const safeMaximum = Number.isInteger(maximum)
    ? Math.min(Math.max(maximum, 0), MAX_QUANTITY)
    : MAX_QUANTITY;

  return Math.min(Math.max(currentQuantity + delta, 0), safeMaximum);
}

export function canAddDraftLine(
  line: DraftLineAvailability,
  requestedQuantity: number,
): DraftLineValidationResult {
  if (
    !Number.isInteger(requestedQuantity)
    || requestedQuantity < 1
    || requestedQuantity > MAX_QUANTITY
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUANTITY",
        message: "Inserisci una quantità intera tra 1 e 999999.",
      },
    };
  }

  if (!line.stock.trackInventory) return { ok: true };

  if (line.stock.availableQuantity === null) {
    return {
      ok: false,
      error: {
        code: "AVAILABILITY_UNKNOWN",
        message: "La disponibilità non è verificabile in questo momento.",
      },
    };
  }

  if (requestedQuantity > line.stock.availableQuantity) {
    return {
      ok: false,
      error: {
        code: "INSUFFICIENT_STOCK",
        message: `Disponibilità osservata: ${line.stock.availableQuantity}.`,
      },
    };
  }

  return { ok: true };
}
