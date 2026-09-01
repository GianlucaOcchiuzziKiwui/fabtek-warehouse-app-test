"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  startPwaInstallLifecycle,
  type InstallAction,
} from "@/lib/pwa/install-lifecycle";

export function InstallAppButton() {
  const [install, setInstall] = useState<InstallAction | null>(null);

  useEffect(() => {
    return startPwaInstallLifecycle({
      windowObject: window,
      serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : null,
      onInstallAction: (action) => setInstall(() => action),
      onError: (error) => console.error(error.message, error),
    });
  }, []);

  if (!install) return null;

  return (
    <Button
      type="button"
      variant="accent"
      size="icon"
      className="fixed right-4 bottom-4 z-50 shadow-lg print:hidden"
      aria-label="Installa app"
      title="Installa app"
      onClick={() => void install()}
    >
      <Download aria-hidden="true" />
    </Button>
  );
}
