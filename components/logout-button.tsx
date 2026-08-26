"use client";

import { Button } from "@/components/ui/button";
import { clearRequestFlowStorage } from "@/lib/domain/requests/flow-storage";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const logout = async () => {
    setError(null);
    setIsLoading(true);

    try {
      clearRequestFlowStorage(localStorage);
    } catch {
      // Continue signing out even when browser storage is unavailable.
    }
    try {
      clearRequestFlowStorage(sessionStorage);
    } catch {
      // Continue signing out even when browser storage is unavailable.
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      router.replace("/auth/login");
      router.refresh();
    } catch {
      setError("Disconnessione non riuscita.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
      {error ? (
        <span role="alert" className="text-[11px] text-red-200">
          {error}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={isLoading ? "Disconnessione in corso" : "Esci"}
        onClick={logout}
        disabled={isLoading}
        className="border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/15 hover:text-white"
      >
        <LogOut aria-hidden="true" />
        <span className="hidden sm:inline">
          {isLoading ? "Uscita..." : "Esci"}
        </span>
      </Button>
    </div>
  );
}
