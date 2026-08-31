"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type RequestPdfDownloadButtonProps = {
  requestId: string;
  kind: "initial_request" | "final_report";
  label: "Genera PDF richiesta" | "Genera report finale";
};

const DOWNLOAD_ERROR = "Non \u00e8 stato possibile generare il PDF. Riprova.";

export function RequestPdfDownloadButton({
  requestId,
  kind,
  label,
}: RequestPdfDownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = `request-pdf-${kind}-error`;

  async function downloadPdf() {
    if (isDownloading) return;

    setIsDownloading(true);
    setError(null);
    let objectUrl: string | null = null;

    try {
      const response = await fetch(`/api/requests/${requestId}/pdf/${kind}`);
      const contentType = response.headers.get("content-type");
      if (!response.ok || !contentType?.startsWith("application/pdf")) {
        throw new Error(DOWNLOAD_ERROR);
      }

      objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = kind === "initial_request"
        ? "fabtek-richiesta.pdf"
        : "fabtek-report-finale.pdf";
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
      }
    } catch {
      setError(DOWNLOAD_ERROR);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="min-h-10 w-full sm:w-auto"
        onClick={downloadPdf}
        disabled={isDownloading}
        aria-busy={isDownloading}
        aria-describedby={error ? errorId : undefined}
      >
        {isDownloading ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}
        {isDownloading ? "Generazione PDF..." : label}
      </Button>
      {error ? <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
