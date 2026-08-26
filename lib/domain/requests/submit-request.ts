import type { ActionResult } from "../action-result.ts";
import { toActionError } from "../errors.ts";
import { validateSubmitRequest } from "./validation.ts";

type SubmitRequestRpcArgs = {
  p_client_request_id: string;
  p_project: string;
  p_tool_line: string;
  p_utilities: string;
  p_notes: string | null;
  p_lines: {
    item_variant_id: string;
    category_id: string;
    quantity: number;
  }[];
};

type RpcResponse = {
  data: unknown;
  error: unknown;
};

type SubmitRequestDependencies = {
  callRpc: (name: "submit_material_request", args: SubmitRequestRpcArgs) => Promise<RpcResponse>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRpcResult(data: unknown) {
  if (!Array.isArray(data) || data.length === 0 || !isRecord(data[0])) {
    return null;
  }

  const { request_id: requestId, request_number: requestNumber } = data[0];
  if (
    typeof requestId !== "string"
    || !UUID_PATTERN.test(requestId)
    || typeof requestNumber !== "number"
    || !Number.isSafeInteger(requestNumber)
    || requestNumber < 1
  ) {
    return null;
  }

  return { requestId, requestNumber };
}

async function defaultCallRpc(
  name: "submit_material_request",
  args: SubmitRequestRpcArgs,
): Promise<RpcResponse> {
  const { createClient } = await import("../../supabase/server.ts");
  const supabase = await createClient();
  return supabase.rpc(name, args);
}

export async function submitMaterialRequest(
  input: unknown,
  dependencies: Partial<SubmitRequestDependencies> = {},
): Promise<ActionResult<{ requestId: string; requestNumber: number }>> {
  const validated = validateSubmitRequest(input);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const callRpc = dependencies.callRpc ?? defaultCallRpc;
  const args: SubmitRequestRpcArgs = {
    p_client_request_id: validated.data.clientRequestId,
    p_project: validated.data.project,
    p_tool_line: validated.data.toolLine,
    p_utilities: validated.data.utilities,
    p_notes: validated.data.notes,
    p_lines: validated.data.lines.map((line) => ({
      item_variant_id: line.itemVariantId,
      category_id: line.categoryId,
      quantity: line.quantity,
    })),
  };

  try {
    const { data, error } = await callRpc("submit_material_request", args);
    if (error) {
      return { ok: false, error: toActionError(error) };
    }

    const result = readRpcResult(data);
    if (!result) {
      return { ok: false, error: toActionError(null) };
    }

    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
