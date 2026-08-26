import type { RequestDetail, RequestLineDetail } from "@/lib/data/request-mappers";

export class RequestHistoryConsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestHistoryConsistencyError";
  }
}

const MAX_READ_ATTEMPTS = 3;

function consistencyError(message: string): never {
  throw new RequestHistoryConsistencyError(message);
}

function expectedLineTone(line: RequestLineDetail) {
  if (line.fulfilledQuantity === 0) return "pending";
  if (line.fulfilledQuantity === line.requestedQuantity) return "good";
  return "warning";
}

function assertLineConsistent(line: RequestLineDetail) {
  if (
    !Number.isSafeInteger(line.requestedQuantity)
    || line.requestedQuantity <= 0
    || !Number.isSafeInteger(line.fulfilledQuantity)
    || line.fulfilledQuantity < 0
    || line.fulfilledQuantity > line.requestedQuantity
    || line.remainingQuantity !== line.requestedQuantity - line.fulfilledQuantity
  ) {
    consistencyError("Quantitativi della riga richiesta incoerenti.");
  }

  let eventTotal = 0;
  for (const fulfillment of line.fulfillments) {
    eventTotal += fulfillment.quantity;
    if (!Number.isSafeInteger(eventTotal)) {
      consistencyError("Totale eventi evasione non valido.");
    }
  }

  if (eventTotal !== line.fulfilledQuantity) {
    consistencyError("Totale eventi evasione incoerente con la riga richiesta.");
  }
  if (line.status.tone !== expectedLineTone(line)) {
    consistencyError("Stato della riga richiesta incoerente.");
  }
}

export function assertRequestHistoryConsistent(request: RequestDetail): RequestDetail {
  if (request.lines.length === 0) {
    consistencyError("Richiesta priva di righe.");
  }

  for (const line of request.lines) assertLineConsistent(line);

  const expectedRequestTone = request.lines.every((line) => line.status.tone === "good")
    ? "good"
    : request.lines.some((line) => line.status.tone !== "pending")
      ? "warning"
      : "pending";

  if (request.status.tone !== expectedRequestTone) {
    consistencyError("Stato della richiesta incoerente con le sue righe.");
  }

  return request;
}

export async function readConsistentRequestDetail(
  loadAttempt: () => Promise<RequestDetail | null>,
  maxAttempts = MAX_READ_ATTEMPTS,
): Promise<RequestDetail | null> {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) {
    throw new RangeError("Il numero massimo di tentativi deve essere positivo.");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const request = await loadAttempt();
    if (request === null) return null;

    try {
      return assertRequestHistoryConsistent(request);
    } catch (error) {
      if (!(error instanceof RequestHistoryConsistencyError) || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new RequestHistoryConsistencyError("Lettura coerente della richiesta non disponibile.");
}
