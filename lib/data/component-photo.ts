import "server-only";

import type { ActionResult } from "../domain/action-result.ts";
import type { CatalogMutationResult, ComponentInput } from "../domain/admin-catalog/contracts.ts";
import { UploadError } from "../uploads/policy.ts";

export type ComponentPhotoChange = { path: string | null; expectedPath: string | null };
type Dependencies = {
  currentPath: (id: string) => Promise<string | null>;
  upload: (file: File) => Promise<string>;
  remove: (path: string) => Promise<void>;
  save: (input: ComponentInput, change?: ComponentPhotoChange) => Promise<ActionResult<CatalogMutationResult>>;
};

export async function getComponentPhotoPath(id: string): Promise<string | null> {
  const { createClient } = await import("../supabase/server.ts");
  const client = await createClient();
  const { data, error } = await client.from("components").select("photo_path").eq("id", id).maybeSingle();
  if (error || !data) throw new UploadError("Non è stato possibile caricare la foto attuale del componente.");
  return data.photo_path;
}

const defaults: Dependencies = {
  currentPath: getComponentPhotoPath,
  async upload(file) {
    const { uploadFile } = await import("../uploads/server.ts");
    return uploadFile(file, "component-photo");
  },
  async remove(path) {
    const { removeUpload } = await import("../uploads/server.ts");
    return removeUpload(path);
  },
  async save(input, change) {
    const { saveComponent } = await import("./admin-catalog.ts");
    return saveComponent(input, {}, change);
  },
};

export async function cleanupComponentPhoto(
  result: ActionResult<CatalogMutationResult>,
  path: string | null,
  remove = defaults.remove,
): Promise<ActionResult<CatalogMutationResult>> {
  if (!result.ok || !path) return result;
  try {
    await remove(path);
    return result;
  } catch {
    console.error("Component photo cleanup failed", { componentId: result.data.id });
    return { ok: true, data: { ...result.data, warning: "Operazione completata, ma la pulizia della vecchia foto non è riuscita. Contatta l’amministratore." } };
  }
}

export async function saveComponentWithPhoto(
  input: ComponentInput,
  form?: FormData,
  dependencies: Dependencies = defaults,
): Promise<ActionResult<CatalogMutationResult>> {
  if (form !== undefined && !(form instanceof FormData)) throw new UploadError("Dati della foto non validi.");
  const file = form?.get("file");
  const remove = form?.get("remove") === "true";
  if (file !== undefined && file !== null && !(file instanceof File)) throw new UploadError("Seleziona una foto valida.");
  if (file && remove) throw new UploadError("Scegli se sostituire o rimuovere la foto.");
  if (!file && !remove) return dependencies.save(input);

  const expectedPath = input.id ? await dependencies.currentPath(input.id) : null;
  const newPath = file ? await dependencies.upload(file) : null;
  let result: ActionResult<CatalogMutationResult>;
  try {
    result = await dependencies.save(input, { path: newPath, expectedPath });
  } catch (error) {
    if (newPath) await dependencies.remove(newPath);
    throw error;
  }
  if (!result.ok) {
    if (newPath) await dependencies.remove(newPath);
    return result;
  }
  return cleanupComponentPhoto(result, expectedPath, dependencies.remove);
}
