import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let server;
let worker;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: worker } = await server.ssrLoadModule("/worker/index.js"));
});

after(async () => {
  await server?.close();
});

test("unsupported full-catalog replacement remains blocked", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/catalog", { method: "PUT" }),
    {},
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, POST");
  assert.match((await response.json()).error, /entire catalog is not supported/i);
});

test("catalog reads fail explicitly when Sheets configuration is missing", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/catalog"),
    {},
  );

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Catalog storage is not configured/i);
});