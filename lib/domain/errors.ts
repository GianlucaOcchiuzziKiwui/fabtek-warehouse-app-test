export type ActionError = {
  code: string;
  message: string;
};

const DATABASE_ERROR_CODES = {
  "42501": { code: "FORBIDDEN", message: "Operazione non consentita." },
  "P0001": {
    code: "INSUFFICIENT_STOCK",
    message: "La disponibilità di uno o più articoli è cambiata.",
  },
  "22023": { code: "INVALID_INPUT", message: "Controlla i dati inseriti." },
  "23514": {
    code: "INVALID_QUANTITY",
    message: "La quantità indicata non è valida.",
  },
  "P0002": {
    code: "NOT_FOUND",
    message: "La risorsa richiesta non è disponibile.",
  },
  "P0004": {
    code: "IDEMPOTENCY_PAYLOAD_MISMATCH",
    message: "Questa bozza non corrisponde alla richiesta gi\u00e0 registrata. Apri lo storico richieste.",
  },
} as const;

const UNEXPECTED_ERROR: ActionError = {
  code: "UNEXPECTED_ERROR",
  message: "Si è verificato un errore imprevisto.",
};

function hasErrorCode(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string";
}

export function toActionError(error: unknown): ActionError {
  if (hasErrorCode(error)) {
    const mapped = DATABASE_ERROR_CODES[error.code as keyof typeof DATABASE_ERROR_CODES];
    if (mapped) {
      return mapped;
    }
  }

  return UNEXPECTED_ERROR;
}
