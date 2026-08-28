import {
  getAuthorizedDocument,
  type DownloadableDocument,
} from "../../../../lib/data/documents.ts";
import type { UserProfile } from "../../../../lib/auth/permissions.ts";

type DocumentRouteContext = {
  params: Promise<{ documentId: string }>;
};

type DocumentDownloadDependencies = {
  getProfile: () => Promise<UserProfile | null>;
  getDocument: (documentId: string) => Promise<DownloadableDocument | null>;
  reportFailure: (event: { operation: string; errorCode: string }) => void;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function loadCurrentProfile() {
  const { getCurrentProfile } = await import(
    "../../../../lib/auth/current-profile.ts"
  );
  return getCurrentProfile();
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorCode(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    ? error.code
    : "DOCUMENT_DOWNLOAD_FAILED";
}

export function createDocumentDownloadHandler(
  overrides: Partial<DocumentDownloadDependencies> = {},
) {
  const dependencies: DocumentDownloadDependencies = {
    getProfile: loadCurrentProfile,
    getDocument: getAuthorizedDocument,
    reportFailure: (event) => {
      console.error("Official document download failed", event);
    },
    ...overrides,
  };

  return async function GET(
    _request: Request,
    context: DocumentRouteContext,
  ): Promise<Response> {
    try {
      const profile = await dependencies.getProfile();
      if (!profile) return errorResponse("Sessione non valida.", 401);
      if (!profile.is_active) return errorResponse("Operazione non consentita.", 403);

      const { documentId } = await context.params;
      if (!UUID_PATTERN.test(documentId)) {
        return errorResponse("Documento non trovato.", 404);
      }

      const document = await dependencies.getDocument(documentId);
      if (!document) return errorResponse("Documento non trovato.", 404);

      return new Response(new Uint8Array(document.buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${document.filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (error) {
      dependencies.reportFailure({
        operation: "download official document",
        errorCode: errorCode(error),
      });
      return errorResponse("Il documento non è disponibile in questo momento.", 500);
    }
  };
}

export const GET = createDocumentDownloadHandler();
