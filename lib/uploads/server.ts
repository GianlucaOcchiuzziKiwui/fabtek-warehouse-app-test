import "server-only";

import {
  UPLOAD_BUCKET, UPLOAD_POLICIES, UploadError, isUploadPath, validateUpload,
  type UploadPurpose,
} from "./policy.ts";

async function authorizedClient() {
  const { requirePermission } = await import("../auth/current-profile.ts");
  await requirePermission("catalog:manage");
  const { createClient } = await import("../supabase/server.ts");
  return createClient();
}

export async function uploadFile(file: File, purpose: UploadPurpose): Promise<string> {
  const client = await authorizedClient();
  const { bytes, contentType, extension } = await validateUpload(file, purpose);
  const path = `${UPLOAD_POLICIES[purpose].prefix}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from(UPLOAD_BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
    cacheControl: "0",
  });
  if (error) {
    console.error("Upload failed", { operation: "upload", purpose });
    throw new UploadError("Non è stato possibile caricare la foto. Riprova.");
  }
  return path;
}

export async function removeUpload(path: string): Promise<void> {
  const client = await authorizedClient();
  if (!isUploadPath(path)) throw new UploadError("Riferimento al file non valido.");
  const { data, error } = await client.storage.from(UPLOAD_BUCKET).remove([path]);
  if (error || !data?.some((item) => item.name === path)) {
    console.error("Upload failed", { operation: "remove" });
    throw new UploadError("Non è stato possibile completare la pulizia della foto archiviata.");
  }
}
