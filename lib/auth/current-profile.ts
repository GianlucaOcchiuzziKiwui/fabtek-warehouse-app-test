import "server-only";

import {
  can,
  hasRole,
  isAppRole,
  type AppPermission,
  type AppRole,
  type UserProfile,
} from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";

  constructor() {
    super("Operazione non consentita.");
    this.name = "ForbiddenError";
  }
}

export const getCurrentProfile = cache(
  async (): Promise<UserProfile | null> => {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getClaims();
    const userId = authData?.claims?.sub;

    if (authError || typeof userId !== "string") return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Supabase profile query failed", {
        code: error.code,
        message: error.message,
      });
      throw new Error("Impossibile caricare il profilo utente.");
    }

    if (
      !data ||
      typeof data.id !== "string" ||
      typeof data.full_name !== "string" ||
      !isAppRole(data.role) ||
      typeof data.is_active !== "boolean"
    ) {
      return null;
    }

    return data;
  },
);

export async function requireCurrentProfile() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/auth/error?error=Profilo%20utente%20non%20disponibile.");
  }

  if (!profile.is_active) {
    redirect("/auth/error?error=Account%20disattivato.");
  }

  return profile;
}

export async function requireRole(
  allowedRoles: AppRole | readonly AppRole[],
) {
  const profile = await requireCurrentProfile();

  if (!hasRole(profile, allowedRoles)) throw new ForbiddenError();

  return profile;
}

export async function requirePermission(permission: AppPermission) {
  const profile = await requireCurrentProfile();

  if (!can(profile, permission)) throw new ForbiddenError();

  return profile;
}
