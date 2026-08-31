"use server";

import { requirePermission } from "@/lib/auth/current-profile";
import type { ActionResult } from "@/lib/domain/action-result";
import {
  fulfillRequestLine,
  type FulfillmentResult,
} from "@/lib/domain/fulfillment/fulfill-request-line";
import {
  FulfillmentEmailError,
  sendRequestFulfilledEmail,
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
