"use client";

import {
  can as canPerform,
  hasRole as profileHasRole,
  isAdmin as profileIsAdmin,
  type AppPermission,
  type AppRole,
  type UserProfile,
} from "@/lib/auth/permissions";
import { createContext, useContext, useMemo } from "react";

type ProfileContextValue = {
  profile: UserProfile;
  isAdmin: boolean;
  can: (permission: AppPermission) => boolean;
  hasRole: (roles: AppRole | readonly AppRole[]) => boolean;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({
  profile,
  children,
}: Readonly<{
  profile: UserProfile;
  children: React.ReactNode;
}>) {
  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      isAdmin: profileIsAdmin(profile),
      can: (permission) => canPerform(profile, permission),
      hasRole: (roles) => profileHasRole(profile, roles),
    }),
    [profile],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);

  if (!context) {
    throw new Error("useProfile deve essere usato dentro ProfileProvider.");
  }

  return context;
}
