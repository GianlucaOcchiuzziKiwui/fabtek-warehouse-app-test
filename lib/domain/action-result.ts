import type { ActionError } from "./errors";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };
