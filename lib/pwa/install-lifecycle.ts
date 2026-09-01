export type InstallAction = () => Promise<void>;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

interface PwaInstallLifecycleOptions {
  windowObject: Window;
  serviceWorker: ServiceWorkerContainer | null;
  onInstallAction: (action: InstallAction | null) => void;
  onError: (error: Error) => void;
}

export function startPwaInstallLifecycle({
  windowObject,
  serviceWorker,
  onInstallAction,
  onError,
}: PwaInstallLifecycleOptions): () => void {
  const displayMode = windowObject.matchMedia("(display-mode: standalone)");
  let currentPrompt: BeforeInstallPromptEvent | null = null;

  void serviceWorker
    ?.register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch((cause: unknown) => {
      onError(new Error("Impossibile registrare il service worker PWA.", { cause }));
    });

  const clearInstallAction = () => {
    currentPrompt = null;
    onInstallAction(null);
  };

  const handleBeforeInstallPrompt = (event: Event) => {
    const installPrompt = event as BeforeInstallPromptEvent;
    installPrompt.preventDefault();

    if (displayMode.matches) return;

    currentPrompt = installPrompt;
    onInstallAction(async () => {
      if (currentPrompt !== installPrompt) return;

      currentPrompt = null;
      onInstallAction(null);

      try {
        await installPrompt.prompt();
      } catch (cause) {
        onError(new Error("Impossibile aprire il prompt di installazione PWA.", { cause }));
      }
    });
  };

  const handleInstalledOrStandalone = () => {
    if (displayMode.matches || currentPrompt !== null) clearInstallAction();
  };

  windowObject.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  windowObject.addEventListener("appinstalled", clearInstallAction);
  displayMode.addEventListener("change", handleInstalledOrStandalone);

  return () => {
    currentPrompt = null;
    windowObject.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    windowObject.removeEventListener("appinstalled", clearInstallAction);
    displayMode.removeEventListener("change", handleInstalledOrStandalone);
  };
}
