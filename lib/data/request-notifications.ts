import "server-only";

type SessionClient = Awaited<ReturnType<
  typeof import("../supabase/server.ts").createClient
>>;

type FulfillmentNotificationDependencies = {
  createClient: () => SessionClient | Promise<SessionClient>;
};

export type FulfillmentNotificationData = {
  requesterEmail: string;
  deliveredQuantity: number;
  notes: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function createSessionClient() {
  const { createClient } = await import("../supabase/server.ts");
  return createClient();
}

function notificationDataError(): never {
  throw new Error("I dati della notifica non sono disponibili.");
}

export async function loadAuthorizedFulfillmentNotification(
  input: { requestId: string; requestLineId: string; idempotencyKey: string },
  dependencies: Partial<FulfillmentNotificationDependencies> = {},
): Promise<FulfillmentNotificationData | null> {
  if (
    !UUID_PATTERN.test(input.requestId)
    || !UUID_PATTERN.test(input.requestLineId)
    || !UUID_PATTERN.test(input.idempotencyKey)
  ) {
    return notificationDataError();
  }

  const createClient = dependencies.createClient ?? createSessionClient;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_events")
    .select(`
      quantity,
      notes,
      request_line:material_request_lines!inner(
        id,
        request_id,
        request:material_requests!inner(id, requester_email)
      )
    `)
    .eq("idempotency_key", input.idempotencyKey)
    .eq("request_line_id", input.requestLineId)
    .maybeSingle();

  if (error) return notificationDataError();
  if (!data) return null;
  if (!isRecord(data) || !isRecord(data.request_line) || !isRecord(data.request_line.request)) {
    return notificationDataError();
  }

  const requesterEmail = data.request_line.request.requester_email;
  const requestLineId = data.request_line.id;
  const requestId = data.request_line.request_id;
  const nestedRequestId = data.request_line.request.id;
  const quantity = data.quantity;
  const notes = data.notes;
  if (
    requestLineId !== input.requestLineId
    || requestId !== input.requestId
    || nestedRequestId !== input.requestId
    || typeof requesterEmail !== "string"
    || !EMAIL_PATTERN.test(requesterEmail)
    || typeof quantity !== "number"
    || !Number.isSafeInteger(quantity)
    || quantity <= 0
    || (notes !== null && typeof notes !== "string")
  ) {
    return notificationDataError();
  }

  return {
    requesterEmail: requesterEmail.trim().toLowerCase(),
    deliveredQuantity: quantity,
    notes: notes?.trim() || null,
  };
}
