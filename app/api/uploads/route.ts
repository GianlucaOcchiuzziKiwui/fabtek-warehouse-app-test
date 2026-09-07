import { getCurrentProfile } from "@/lib/auth/current-profile";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { isUploadPath, UPLOAD_BUCKET } from "@/lib/uploads/policy";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response(null, { status: 401 });
  if (!can(profile, "catalog:read")) return new Response(null, { status: 403 });
  const path = new URL(request.url).searchParams.get("path");
  if (!isUploadPath(path)) return new Response(null, { status: 400 });

  const client = await createClient();
  const { data, error } = await client.storage.from(UPLOAD_BUCKET).download(path);
  if (error || !data) {
    const status = error && "statusCode" in error ? Number(error.statusCode) : null;
    console.error("Upload download failed", { operation: "download", status });
    return new Response(null, { status: status === 404 || status === 403 ? 404 : 502 });
  }
  return new Response(data, {
    headers: {
      "Content-Type": path.endsWith(".png") ? "image/png" : "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
