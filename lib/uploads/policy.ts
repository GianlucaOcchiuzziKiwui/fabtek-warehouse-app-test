export const UPLOAD_BUCKET = "uploads";
export const UPLOAD_POLICIES = {
  "component-photo": {
    prefix: "components",
    maxBytes: 2 * 1024 * 1024,
    accept: "image/jpeg,image/png",
  },
} as const;
export type UploadPurpose = keyof typeof UPLOAD_POLICIES;

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export function validateUploadMetadata(file: File, purpose: UploadPurpose) {
  const policy = Object.hasOwn(UPLOAD_POLICIES, purpose) ? UPLOAD_POLICIES[purpose] : null;
  if (!policy) throw new UploadError("Tipo di caricamento non supportato.");
  if (!(file instanceof File) || file.size === 0) throw new UploadError("Seleziona una foto non vuota.");
  if (file.size > policy.maxBytes) throw new UploadError(`La foto deve pesare al massimo ${policy.maxBytes / (1024 * 1024)} MB.`);
  if (!policy.accept.split(",").includes(file.type)) throw new UploadError("Sono ammesse solo foto JPG e PNG.");
  return policy;
}

export async function validateUpload(file: File, purpose: UploadPurpose) {
  validateUploadMetadata(file, purpose);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  const isPng = bytes.length > 24 && pngSignature.every((byte, index) => bytes[index] === byte);
  const isJpeg = bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((file.type === "image/png" && !isPng) || (file.type === "image/jpeg" && !isJpeg)) {
    throw new UploadError("Il contenuto del file non corrisponde a una foto JPG o PNG.");
  }
  return { bytes, contentType: file.type, extension: isPng ? "png" : "jpg" };
}

export function isUploadPath(path: unknown): path is string {
  return typeof path === "string"
    && /^components\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/.test(path);
}

export function getUploadUrl(path: unknown): string | null {
  return isUploadPath(path) ? `/api/uploads?path=${encodeURIComponent(path)}` : null;
}
