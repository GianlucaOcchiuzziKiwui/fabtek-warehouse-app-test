import {
  loadAuthorizedOfficialPdfSource,
  type OfficialDocumentKind,
  type OfficialPdfSource,
} from "../../../../../../lib/data/documents.ts";
import { OnDemandPdfError, createOnDemandPdf } from "../../../../../../lib/domain/documents/on-demand-pdf.ts";
import { can, type UserProfile } from "../../../../../../lib/auth/permissions.ts";
import type { PdfDocument } from "../../../../../../lib/pdf/contracts.ts";

type RequestPdfRouteContext = {
  params: Promise<{ requestId: string; kind: string }>;
};

type RequestPdfRouteDependencies = {
  getProfile: () => Promise<UserProfile | null>;
  loadSource: (
    requestId: string,
    kind: OfficialDocumentKind,
  ) => Promise<OfficialPdfSource | null>;
  renderPdf?: (document: PdfDocument) => Promise<Buffer>;
  reportFailure: (event: { operation: string; errorCode: string }) => void;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function loadCurrentProfile() {
  const { getCurrentProfile } = await import(
    "../../../../../../lib/auth/current-profile.ts"
  );
  return getCurrentProfile();
}

function isOfficialDocumentKind(value: string): value is OfficialDocumentKind {
  return value === "initial_request" || value === "final_report";
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
    : "REQUEST_PDF_DOWNLOAD_FAILED";
}

export function createRequestPdfHandler(
  overrides: Partial<RequestPdfRouteDependencies> = {},
) {
  const dependencies: RequestPdfRouteDependencies = {
    getProfile: loadCurrentProfile,
    loadSource: loadAuthorizedOfficialPdfSource,
    reportFailure: (event) => {
      console.error("On-demand request PDF download failed", event);
    },
    ...overrides,
  };

  return async function GET(
    _request: Request,
    context: RequestPdfRouteContext,
  ): Promise<Response> {
    try {
      const profile = await dependencies.getProfile();
      if (!profile) return errorResponse("Sessione non valida.", 401);
      if (!profile.is_active || !can(profile, "requests:read-own")) {
        return errorResponse("Operazione non consentita.", 403);
      }

      const { requestId, kind } = await context.params;
      if (!UUID_PATTERN.test(requestId) || !isOfficialDocumentKind(kind)) {
        return errorResponse("Documento non trovato.", 404);
      }

      const source = await dependencies.loadSource(requestId, kind);
      if (!source) return errorResponse("Documento non trovato.", 404);

      const pdf = await createOnDemandPdf(source, kind, {
        render: dependencies.renderPdf,
      });
      return new Response(new Uint8Array(pdf.buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${pdf.filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (error) {
      if (error instanceof OnDemandPdfError && error.code === "FINAL_REPORT_NOT_READY") {
        return errorResponse("Il report finale non è ancora disponibile.", 409);
      }
      dependencies.reportFailure({
        operation: "download on-demand request PDF",
        errorCode: errorCode(error),
      });
      return errorResponse("Il documento non è disponibile in questo momento.", 500);
    }
  };
}

export const GET = createRequestPdfHandler();
