"use server";

import { requirePermission } from "@/lib/auth/current-profile";
import type { ActionResult } from "@/lib/domain/action-result";
import { submitMaterialRequest } from "@/lib/domain/requests/submit-request";
import { revalidatePath } from "next/cache";

export async function submitRequestAction(
  input: unknown,
): Promise<ActionResult<{ requestId: string; requestNumber: number }>> {
  await requirePermission("requests:create");

  const result = await submitMaterialRequest(input);
  if (result.ok) {
    revalidatePath("/richieste");
    revalidatePath(`/richieste/${result.data.requestId}`);
  }

  return result;
}
