import type { ActionResult } from "../action-result.ts";
import { toActionError } from "../errors.ts";
import type { FulfillRequestInput } from "../requests/contracts.ts";
import { validateFulfillment } from "./validation.ts";

const REQUEST_STATUSES = new Set([
  "in_preparazione",
  "evasa_parziale",
  "evasa",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FulfillmentRpcArgs = {
  p_request_line_id: string;
  p_quantity: number;
  p_idempotency_key: string;
  p_notes: string | null;
};

type RpcResponse = {
  data: unknown;
  error: unknown;
};

type FulfillmentDependencies = {
  callRpc: (
    name: "fulfill_request_line",
    args: FulfillmentRpcArgs,
  ) => Promise<RpcResponse>;
};

export type FulfillmentResult = {
  requestId: string;
  requestLineId: string;
  fulfilledQuantity: number;
  remainingQuantity: number;
  lineStatus: "in_preparazione" | "evasa_parziale" | "evasa";
  requestStatus: "in_preparazione" | "evasa_parziale" | "evasa";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRequestStatus(value: unknown): value is FulfillmentResult["lineStatus"] {
  return typeof value === "string" && REQUEST_STATUSES.has(value);
}

function readRpcResult(data: unknown): FulfillmentResult | null {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) return null;

  const row = data[0];
  const requestId = row.request_id;
  const requestLineId = row.request_line_id;
  const fulfilledQuantity = row.fulfilled_quantity;
  const remainingQuantity = row.remaining_quantity;
  const lineStatus = row.line_status;
  const requestStatus = row.request_status;

  if (
    typeof requestId !== "string"
    || !UUID_PATTERN.test(requestId)
    || typeof requestLineId !== "string"
    || !UUID_PATTERN.test(requestLineId)
    || !isNonNegativeInteger(fulfilledQuantity)
    || !isNonNegativeInteger(remainingQuantity)
    || !isRequestStatus(lineStatus)
    || !isRequestStatus(requestStatus)
  ) {
    return null;
  }

  return {
    requestId,
    requestLineId,
    fulfilledQuantity,
    remainingQuantity,
    lineStatus,
    requestStatus,
  };
}

function isExceedsRemainingError(error: unknown) {
  return isRecord(error)
    && error.code === "22023"
    && error.message === "QUANTITY_EXCEEDS_REMAINING";
}

async function defaultCallRpc(
  name: "fulfill_request_line",
  args: FulfillmentRpcArgs,
): Promise<RpcResponse> {
  const { createClient } = await import("../../supabase/server.ts");
  const supabase = await createClient();
  return supabase.rpc(name, args);
}

export async function fulfillRequestLine(
  input: unknown,
  dependencies: Partial<FulfillmentDependencies> = {},
): Promise<ActionResult<FulfillmentResult>> {
  const validated = validateFulfillment(input);
  if (!validated.ok) return validated;

  const callRpc = dependencies.callRpc ?? defaultCallRpc;
  const data: FulfillRequestInput = validated.data;

  try {
    const response = await callRpc("fulfill_request_line", {
      p_request_line_id: data.requestLineId,
      p_quantity: data.quantity,
      p_idempotency_key: data.idempotencyKey,
      p_notes: data.notes,
    });

    if (response.error) {
      if (isExceedsRemainingError(response.error)) {
        return {
          ok: false,
          error: {
            code: "FULFILLMENT_EXCEEDS_REMAINING",
            message: "La quantità supera il residuo disponibile.",
          },
        };
      }
      return { ok: false, error: toActionError(response.error) };
    }

    const result = readRpcResult(response.data);
    return result
      ? { ok: true, data: result }
      : { ok: false, error: toActionError(null) };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
