"use server";

import { requirePermission } from "@/lib/auth/current-profile";
import type { ActionResult } from "@/lib/domain/action-result";
import {
  fulfillRequestLine,
  type FulfillmentResult,
} from "@/lib/domain/fulfillment/fulfill-request-line";
import { revalidatePath } from "next/cache";

export async function fulfillRequestLineAction(
  input: unknown,
): Promise<ActionResult<FulfillmentResult>> {
  await requirePermission("requests:manage");

  const result = await fulfillRequestLine(input);
  if (result.ok) {
    revalidatePath("/admin/richieste");
    revalidatePath(`/richieste/${result.data.requestId}`);
  }

  return result;
}
