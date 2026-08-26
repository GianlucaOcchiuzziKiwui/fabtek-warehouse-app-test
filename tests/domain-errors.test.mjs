import assert from "node:assert/strict";
import test from "node:test";

import { toActionError } from "../lib/domain/errors.ts";

test("maps known PostgreSQL errors to stable client-safe errors", () => {
  assert.deepEqual(
    toActionError({ code: "P0001", message: "stock details from SQL" }),
    {
      code: "INSUFFICIENT_STOCK",
      message: "La disponibilità di uno o più articoli è cambiata.",
    },
  );
  assert.deepEqual(toActionError({ code: "42501" }), {
    code: "FORBIDDEN",
    message: "Operazione non consentita.",
  });
  assert.deepEqual(toActionError({ code: "22023" }), {
    code: "INVALID_INPUT",
    message: "Controlla i dati inseriti.",
  });
  assert.deepEqual(toActionError({ code: "23514" }), {
    code: "INVALID_QUANTITY",
    message: "La quantità indicata non è valida.",
  });
  assert.deepEqual(toActionError({ code: "P0002" }), {
    code: "NOT_FOUND",
    message: "La risorsa richiesta non è disponibile.",
  });
});

test("does not expose unknown database error messages", () => {
  const error = toActionError({
    code: "XX000",
    message: "relation secret_inventory does not exist",
  });

  assert.equal(error.code, "UNEXPECTED_ERROR");
  assert.equal(error.message.includes("secret_inventory"), false);
});
