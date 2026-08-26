export const APP_ROLES = ["user", "admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type UserProfile = {
  id: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
};

export const APP_PERMISSIONS = [
  "catalog:read",
  "requests:create",
  "requests:read-own",
  "requests:manage",
  "catalog:manage",
  "inventory:manage",
  "users:manage",
  "imports:manage",
  "audit:read",
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<AppRole, ReadonlySet<AppPermission>> = {
  user: new Set(["catalog:read", "requests:create", "requests:read-own"]),
  admin: new Set(APP_PERMISSIONS),
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function hasRole(
  profile: UserProfile,
  allowedRoles: AppRole | readonly AppRole[],
) {
  if (!profile.is_active) return false;

  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return roles.includes(profile.role);
}

export function isAdmin(profile: UserProfile) {
  return hasRole(profile, "admin");
}

export function can(profile: UserProfile, permission: AppPermission) {
  return profile.is_active && ROLE_PERMISSIONS[profile.role].has(permission);
}
