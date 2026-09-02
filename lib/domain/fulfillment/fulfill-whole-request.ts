import type { ActionResult } from "../action-result.ts";
import { toActionError } from "../errors.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type FulfillWholeRequestRpcArgs = {
  p_request_id: string;
  p_idempotency_key: string;
};

type RpcResponse = { data: unknown; error: unknown };

type Dependencies = {
  callRpc: (
    name: "fulfill_whole_request",
    args: FulfillWholeRequestRpcArgs,
  ) => Promise<RpcResponse>;
};

export type FulfillWholeRequestResult = {
  requestId: string;
  idempotencyKey: string;
  fulfilledLineCount: number;
  requestStatus: "evasa";
};

function invalidInput(): ActionResult<FulfillWholeRequestResult> {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "I dati dell'evasione completa non sono validi.",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function defaultCallRpc(
  name: "fulfill_whole_request",
  args: FulfillWholeRequestRpcArgs,
): Promise<RpcResponse> {
  const { createClient } = await import("../../supabase/server.ts");
  const supabase = await createClient();
  return supabase.rpc(name, args);
}

export async function fulfillWholeRequest(
  input: unknown,
  dependencies: Partial<Dependencies> = {},
): Promise<ActionResult<FulfillWholeRequestResult>> {
  if (
    !isRecord(input)
    || typeof input.requestId !== "string"
    || !UUID_PATTERN.test(input.requestId)
    || typeof input.idempotencyKey !== "string"
    || !UUID_PATTERN.test(input.idempotencyKey)
  ) {
    return invalidInput();
  }

  try {
    const response = await (dependencies.callRpc ?? defaultCallRpc)(
      "fulfill_whole_request",
      {
        p_request_id: input.requestId,
        p_idempotency_key: input.idempotencyKey,
      },
    );

    if (response.error) {
      if (
        isRecord(response.error)
        && response.error.code === "23514"
        && response.error.message === "INVENTORY_INVARIANT_VIOLATION"
      ) {
        return {
          ok: false,
          error: {
            code: "INSUFFICIENT_STOCK",
            message: "La disponibilità di uno o più articoli è cambiata. Nessuna riga è stata evasa.",
          },
        };
      }
      if (
        isRecord(response.error)
        && response.error.code === "22023"
        && response.error.message === "REQUEST_ALREADY_FULFILLED"
      ) {
        return {
          ok: false,
          error: {
            code: "REQUEST_ALREADY_FULFILLED",
            message: "La richiesta risulta già completamente evasa.",
          },
        };
      }
      return { ok: false, error: toActionError(response.error) };
    }

    if (!Array.isArray(response.data) || response.data.length !== 1) {
      return { ok: false, error: toActionError(null) };
    }
    const row = response.data[0];
    if (
      !isRecord(row)
      || row.request_id !== input.requestId
      || typeof row.fulfilled_line_count !== "number"
      || !Number.isSafeInteger(row.fulfilled_line_count)
      || row.fulfilled_line_count < 1
      || row.request_status !== "evasa"
    ) {
      return { ok: false, error: toActionError(null) };
    }

    return {
      ok: true,
      data: {
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
        fulfilledLineCount: row.fulfilled_line_count,
        requestStatus: "evasa",
      },
    };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
