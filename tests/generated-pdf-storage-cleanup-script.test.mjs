import assert from "node:assert/strict";
import test from "node:test";

const {
  GeneratedDocumentsBucketCleanupError,
  removeGeneratedDocumentsBucket,
  runGeneratedDocumentsBucketCleanup,
} = await import("../scripts/remove-generated-documents-bucket.mjs");

function storageApi(responses) {
  const calls = [];

  return {
    calls,
    api: {
      async emptyBucket(bucket) {
        calls.push(["emptyBucket", bucket]);
        return responses.empty;
      },
      async deleteBucket(bucket) {
        calls.push(["deleteBucket", bucket]);
        return responses.delete;
      },
    },
  };
}

test("generated document cleanup empties the bucket before deleting it", async () => {
  const storage = storageApi({
    empty: { data: {}, error: null },
    delete: { data: {}, error: null },
  });

  const result = await removeGeneratedDocumentsBucket(storage.api);

  assert.equal(result, "removed");
  assert.deepEqual(storage.calls, [
    ["emptyBucket", "generated-documents"],
    ["deleteBucket", "generated-documents"],
  ]);
});

test("generated document cleanup is idempotent when the bucket is already absent", async () => {
  const storage = storageApi({
    empty: { data: null, error: { statusCode: "404", message: "Bucket not found" } },
    delete: { data: null, error: new Error("must not be called") },
  });

  const result = await removeGeneratedDocumentsBucket(storage.api);

  assert.equal(result, "already-absent");
  assert.deepEqual(storage.calls, [["emptyBucket", "generated-documents"]]);
});

test("generated document cleanup treats a delete race as already absent", async () => {
  const storage = storageApi({
    empty: { data: {}, error: null },
    delete: { data: null, error: { status: 404, message: "not found" } },
  });

  const result = await removeGeneratedDocumentsBucket(storage.api);

  assert.equal(result, "already-absent");
  assert.deepEqual(storage.calls, [
    ["emptyBucket", "generated-documents"],
    ["deleteBucket", "generated-documents"],
  ]);
});

test("generated document cleanup stops when emptying the bucket fails", async () => {
  const cause = { statusCode: "500", message: "storage unavailable" };
  const storage = storageApi({
    empty: { data: null, error: cause },
    delete: { data: {}, error: null },
  });

  await assert.rejects(
    removeGeneratedDocumentsBucket(storage.api),
    (error) => {
      assert.equal(error instanceof GeneratedDocumentsBucketCleanupError, true);
      assert.equal(error.step, "empty");
      assert.equal(error.cause, cause);
      return true;
    },
  );
  assert.deepEqual(storage.calls, [["emptyBucket", "generated-documents"]]);
});

test("generated document cleanup reports a non-idempotent delete failure", async () => {
  const cause = { statusCode: "409", message: "bucket not empty" };
  const storage = storageApi({
    empty: { data: {}, error: null },
    delete: { data: null, error: cause },
  });

  await assert.rejects(
    removeGeneratedDocumentsBucket(storage.api),
    (error) => {
      assert.equal(error instanceof GeneratedDocumentsBucketCleanupError, true);
      assert.equal(error.step, "delete");
      assert.equal(error.cause, cause);
      return true;
    },
  );
  assert.deepEqual(storage.calls, [
    ["emptyBucket", "generated-documents"],
    ["deleteBucket", "generated-documents"],
  ]);
});

test("generated document cleanup runner requires explicit confirmation", async () => {
  let storageLoads = 0;

  await assert.rejects(
    runGeneratedDocumentsBucketCleanup({
      args: [],
      loadStorage: async () => {
        storageLoads += 1;
        return {};
      },
    }),
    /Refusing cleanup without the explicit/iu,
  );
  assert.equal(storageLoads, 0);
});
