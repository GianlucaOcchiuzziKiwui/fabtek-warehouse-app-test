import { pathToFileURL } from "node:url";

const BUCKET_ID = "generated-documents";
const CONFIRMATION_FLAG = "--confirm-generated-documents-removal";

export class GeneratedDocumentsBucketCleanupError extends Error {
  constructor(step, cause) {
    super(`Unable to ${step} the generated documents bucket.`, { cause });
    this.name = "GeneratedDocumentsBucketCleanupError";
    this.step = step;
  }
}

function isMissingBucketError(error) {
  if (!error || typeof error !== "object") return false;
  return String(error.statusCode ?? error.status) === "404";
}

async function runStorageOperation(step, operation) {
  let response;
  try {
    response = await operation();
  } catch (error) {
    throw new GeneratedDocumentsBucketCleanupError(step, error);
  }

  if (response?.error && !isMissingBucketError(response.error)) {
    throw new GeneratedDocumentsBucketCleanupError(step, response.error);
  }
  return response?.error ? "missing" : "complete";
}

export async function removeGeneratedDocumentsBucket(storage) {
  const emptyResult = await runStorageOperation(
    "empty",
    () => storage.emptyBucket(BUCKET_ID),
  );
  if (emptyResult === "missing") return "already-absent";

  const deleteResult = await runStorageOperation(
    "delete",
    () => storage.deleteBucket(BUCKET_ID),
  );
  return deleteResult === "missing" ? "already-absent" : "removed";
}

async function createStorageApi(env) {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage;
}

export async function runGeneratedDocumentsBucketCleanup({
  args = process.argv.slice(2),
  env = process.env,
  loadStorage = createStorageApi,
} = {}) {
  if (args.length !== 1 || args[0] !== CONFIRMATION_FLAG) {
    throw new Error(
      `Refusing cleanup without the explicit ${CONFIRMATION_FLAG} flag.`,
    );
  }

  return removeGeneratedDocumentsBucket(await loadStorage(env));
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  runGeneratedDocumentsBucketCleanup()
    .then((result) => {
      process.stdout.write(`generated-documents cleanup: ${result}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Cleanup failed."}\n`);
      process.exitCode = 1;
    });
}
