import "server-only";

import { createClient } from "@supabase/supabase-js";

import { DocumentEnvironmentError } from "../env/documents.ts";

function required(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new DocumentEnvironmentError("MISSING_DOCUMENT_ENV", name);
  return value;
}

export function createAdminClient() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new TypeError("Unsupported Supabase URL protocol.");
    }
  } catch {
    throw new DocumentEnvironmentError(
      "INVALID_DOCUMENT_ENV",
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
