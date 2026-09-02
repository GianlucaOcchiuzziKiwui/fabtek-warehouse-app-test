"use server";

import { requirePermission } from "@/lib/auth/current-profile";
import type { ActionResult } from "@/lib/domain/action-result";
import {
  fulfillRequestLine,
  type FulfillmentResult,
} from "@/lib/domain/fulfillment/fulfill-request-line";
import {
  fulfillWholeRequest,
  type FulfillWholeRequestResult,
} from "@/lib/domain/fulfillment/fulfill-whole-request";
import {
  FulfillmentEmailError,
  sendRequestFulfilledEmail,
  sendWholeRequestFulfilledEmail,
} from "@/lib/email/request-fulfilled";
import { revalidatePath } from "next/cache";

function emailErrorCode(error: unknown) {
  return error instanceof FulfillmentEmailError
    ? error.code
    : "FULFILLMENT_EMAIL_UNEXPECTED_ERROR";
}

export async function fulfillRequestLineAction(
  input: unknown,
): Promise<ActionResult<FulfillmentResult>> {
  await requirePermission("requests:manage");

  const result = await fulfillRequestLine(input);
  if (result.ok) {
    try {
      await sendRequestFulfilledEmail(result.data);
    } catch (error) {
      console.error("Fulfillment email failed", {
        requestId: result.data.requestId,
        requestLineId: result.data.requestLineId,
        errorCode: emailErrorCode(error),
      });
    }
    revalidatePath("/admin/richieste");
    revalidatePath(`/richieste/${result.data.requestId}`);
  }

  return result;
}

export async function fulfillWholeRequestAction(
  input: unknown,
): Promise<ActionResult<FulfillWholeRequestResult>> {
  await requirePermission("requests:manage");

  const result = await fulfillWholeRequest(input);
  if (result.ok) {
    try {
      await sendWholeRequestFulfilledEmail(result.data);
    } catch (error) {
      console.error("Whole-request fulfillment email failed", {
        requestId: result.data.requestId,
        errorCode: emailErrorCode(error),
      });
      return {
        ok: false,
        error: {
          code: "FULFILLMENT_EMAIL_FAILED",
          message: "La richiesta è stata evasa, ma la notifica finale non è stata inviata. Riprova per inviarla senza evadere nuovamente le righe.",
        },
      };
    }
    revalidatePath("/admin/richieste");
    revalidatePath(`/richieste/${result.data.requestId}`);
  }

  return result;
}
