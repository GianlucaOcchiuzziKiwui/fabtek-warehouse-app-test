"use server";

import {
  getCurrentUserEmail,
  requirePermission,
} from "@/lib/auth/current-profile";
import type { ActionResult } from "@/lib/domain/action-result";
import { submitMaterialRequest } from "@/lib/domain/requests/submit-request";
import {
  RequestEmailError,
  sendRequestSubmittedEmail,
} from "@/lib/email/request-submitted";
import { revalidatePath } from "next/cache";

function emailErrorCode(error: unknown) {
  return error instanceof RequestEmailError
    ? error.code
    : "REQUEST_EMAIL_UNEXPECTED_ERROR";
}

export async function submitRequestAction(
  input: unknown,
): Promise<ActionResult<{ requestId: string; requestNumber: number }>> {
  await requirePermission("requests:create");

  const result = await submitMaterialRequest(input);
  if (result.ok) {
    try {
      const requesterEmail = await getCurrentUserEmail();
      if (!requesterEmail) throw new RequestEmailError("INVALID_EMAIL_CONFIG");
      await sendRequestSubmittedEmail({
        requestId: result.data.requestId,
        requesterEmail,
      });
    } catch (error) {
      console.error("Request submitted email failed", {
        requestId: result.data.requestId,
        errorCode: emailErrorCode(error),
      });
    }
    revalidatePath("/richieste");
    revalidatePath(`/richieste/${result.data.requestId}`);
  }

  return result;
}
