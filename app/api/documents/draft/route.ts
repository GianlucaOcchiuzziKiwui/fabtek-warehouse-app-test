import { getCurrentProfile } from "@/lib/auth/current-profile";
import { can } from "@/lib/auth/permissions";
import { createDraftPdf } from "@/lib/domain/documents/draft-pdf";

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return Response.json({ error: "Sessione non valida." }, { status: 401 });
    }
    if (!profile.is_active || !can(profile, "requests:create")) {
      return Response.json({ error: "Operazione non consentita." }, { status: 403 });
    }

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return Response.json({ error: "Dati non validi." }, { status: 400 });
    }

    const result = await createDraftPdf(input, { requesterName: profile.full_name });
    if (!result.ok) {
      return Response.json({ error: result.error.message }, { status: 422 });
    }

    return new Response(new Uint8Array(result.data.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.data.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    console.error("Draft PDF route failed", { code: "DRAFT_PDF_GENERATION_FAILED" });
    return Response.json({ error: "Si è verificato un errore imprevisto." }, { status: 500 });
  }
}
