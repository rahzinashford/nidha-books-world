import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "vite";
import { signSession } from "../worker/sessions.js";

let server;
let worker;
const secret = "test-session-secret";
const env = {
  SESSION_SECRET: secret,
  GOOGLE_SHEETS_SPREADSHEET_ID: "sheet-id",
  GOOGLE_SHEETS_WORKSHEET: "Books",
};
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "writer@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: worker } = await server.ssrLoadModule("/worker/index.js"));
});

after(async () => {
  await server?.close();
});

async function adminCookie() {
  return `nbw_session=${await signSession({ admin: true, expiresAt: Date.now() + 60000 }, secret)}`;
}

function request(path, body, headers = {}) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://example.test", ...headers },
    body: JSON.stringify(body),
  });
}

function adminRequest(path, method, body, cookie, extraHeaders = {}) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: "https://example.test", ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function coverUploadRequest(path, imageBytes, mimeType, cookie) {
  const form = new FormData();
  form.append("cover", new Blob([imageBytes], { type: mimeType }), "cover-image");
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { Origin: "https://example.test", ...(cookie ? { Cookie: cookie } : {}) },
    body: form,
  });
}

const headers = ["id", "title", "subtitle", "author", "isbn", "publisher", "published_date", "description", "pages", "language", "cover_image", "preview_link", "price", "stock", "condition", "is_featured", "categories", "shelves", "created_at", "date_added"];
const existingBookRow = [4, "Before", "", "Author", "9780306406157", "Press", "2020", "", 100, "English", "", "", 30, 2, "Good", "false", "Fiction", "", "created", "added"];

test("write routes require an admin session", async () => {
  const response = await worker.fetch(request("/api/admin/catalog", { title: "Book" }), env);
  assert.equal(response.status, 401);
  const copy = await worker.fetch(request("/api/admin/catalog/import-copy", { book_id: 1, quantity: 1, price: 10, condition: "Good" }), env);
  assert.equal(copy.status, 401);
  for (const [path, method] of [
    ["/api/admin/catalog/4", "PUT"],
    ["/api/admin/catalog/4", "PATCH"],
    ["/api/admin/catalog/4", "DELETE"],
    ["/api/admin/catalog/4/cover", "POST"],
    ["/api/admin/settings", "PUT"],
  ]) {
    const response = await worker.fetch(adminRequest(path, method, {}), env);
    assert.equal(response.status, 401, `${method} ${path} must require an admin session`);
  }
});

test("admin login validates the password and issues a session accepted by admin APIs", async () => {
  const loginEnv = { ...env, ADMIN_PASSWORD: "test-admin-password" };
  const denied = await worker.fetch(request("/admin/login", { password: "wrong" }), loginEnv);
  assert.equal(denied.status, 401);

  const login = await worker.fetch(request("/admin/login", { password: "test-admin-password" }), loginEnv);
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);

  const unauthorized = await worker.fetch(new Request("https://example.test/api/admin/metadata/search?q=&source=all"), loginEnv);
  assert.equal(unauthorized.status, 401);
  const authorized = await worker.fetch(new Request("https://example.test/api/admin/metadata/search?q=&source=all", { headers: { Cookie: cookie.split(";")[0] } }), loginEnv);
  assert.equal(authorized.status, 200);
  assert.deepEqual((await authorized.json()).results, []);
});

test("metadata search rejects unknown sources and oversized queries at the API boundary", async () => {
  const cookie = await adminCookie();
  const unknownSource = await worker.fetch(new Request(
    "https://example.test/api/admin/metadata/search?q=Atomic+Habits&source=unknown",
    { headers: { Cookie: cookie } },
  ), env);
  assert.equal(unknownSource.status, 400);
  assert.equal((await unknownSource.json()).code, "INVALID_METADATA_SEARCH");

  const longQuery = new URLSearchParams({ q: "x".repeat(301), source: "all" });
  const oversized = await worker.fetch(new Request(
    `https://example.test/api/admin/metadata/search?${longQuery}`,
    { headers: { Cookie: cookie } },
  ), env);
  assert.equal(oversized.status, 400);
  assert.equal((await oversized.json()).code, "INVALID_METADATA_SEARCH");
});

test("admin writes reject requests without a same-origin browser origin", async () => {
  const cookie = await adminCookie();
  const crossOrigin = await worker.fetch(adminRequest(
    "/api/admin/catalog",
    "POST",
    { title: "Forged", author: "Attacker", price: 10, stock: 1 },
    cookie,
    { Origin: "https://attacker.example" },
  ), env);
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).code, "CROSS_ORIGIN_REQUEST");

  const loginEnv = { ...env, ADMIN_PASSWORD: "test-admin-password" };
  const crossOriginLogin = await worker.fetch(request("/admin/login", { password: "test-admin-password" }, {
    Origin: "https://attacker.example",
  }), loginEnv);
  assert.equal(crossOriginLogin.status, 403);

  const crossOriginLogout = await worker.fetch(adminRequest(
    "/admin/logout",
    "POST",
    {},
    cookie,
    { Origin: "https://attacker.example" },
  ), env);
  assert.equal(crossOriginLogout.status, 403);

  const schemeMismatch = await worker.fetch(new Request("http://example.test/api/admin/catalog", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://example.test", Cookie: cookie },
    body: JSON.stringify({ title: "Scheme mismatch", author: "Attacker", price: 10, stock: 1 }),
  }), env);
  assert.equal(schemeMismatch.status, 403);

  const missingOrigin = await worker.fetch(new Request("https://example.test/api/admin/catalog", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title: "Missing origin", author: "Attacker", price: 10, stock: 1 }),
  }), env);
  assert.equal(missingOrigin.status, 403);
});

test("new book validation fails before contacting Sheets", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("network must not be called"); };
  try {
    const response = await worker.fetch(request("/api/admin/catalog", { title: "", author: "Author", price: 10, stock: 1 }, { Cookie: await adminCookie() }), env);
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("book imports reject invalid ISBNs and persist valid ISBNs canonically", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let appendedRow;
  globalThis.fetch = async (url, options) => {
    calls++;
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    if (String(url).includes(":append")) {
      appendedRow = JSON.parse(options.body).values[0];
      return new Response(JSON.stringify({ updates: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ values: [headers] }), { status: 200 });
  };
  try {
    const cookie = await adminCookie();
    const invalid = await worker.fetch(request("/api/admin/catalog", {
      title: "Bad ISBN", author: "Writer", isbn: "ISBN 9780735211293", price: 10, stock: 1,
    }, { Cookie: cookie }), env);
    assert.equal(invalid.status, 400);
    assert.equal(calls, 0, "invalid data must be rejected before contacting Sheets");

    const valid = await worker.fetch(request("/api/admin/catalog", {
      title: "Valid ISBN", author: "Writer", isbn: "0-7352-1129-9", price: 10, stock: 1,
    }, { Cookie: cookie }), env);
    assert.equal(valid.status, 201);
    const saved = await valid.json();
    assert.equal(saved.book.isbn, "9780735211292");
    assert.equal(appendedRow[4], "9780735211292");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("duplicate books return a safe conflict without append", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options?.method]);
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    return new Response(JSON.stringify({ values: [
      ["id", "title", "subtitle", "author", "isbn", "publisher", "published_date", "description", "pages", "language", "cover_image", "preview_link", "price", "stock", "condition", "is_featured", "categories", "shelves", "created_at", "date_added"],
      [3, "Existing Book", "", "An Author", "9780306406157", "", "", "", 100, "English", "", "", 100, 2, "Good", "false", "", "", "", ""],
    ] }), { status: 200 });
  };
  try {
    const response = await worker.fetch(request("/api/admin/catalog", { title: "Existing Book", author: "An Author", isbn: "9780306406157", price: 10, stock: 1 }, { Cookie: await adminCookie() }), env);
    assert.equal(response.status, 409);
    assert.equal(calls.filter(([url]) => url.includes(":append")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ISBN-10 and ISBN-13 variants identify the same book", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options?.method]);
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    return new Response(JSON.stringify({ values: [
      ["id", "title", "subtitle", "author", "isbn", "publisher", "published_date", "description", "pages", "language", "cover_image", "preview_link", "price", "stock", "condition", "is_featured", "categories", "shelves", "created_at", "date_added"],
      [3, "Existing Title", "", "An Author", "9780735211292", "", "", "", 100, "English", "", "", 100, 2, "Good", "false", "", "", "", ""],
    ] }), { status: 200 });
  };
  try {
    const response = await worker.fetch(request("/api/admin/catalog", { title: "Different Display Title", author: "Another Author", isbn: "0-7352-1129-9", price: 10, stock: 1 }, { Cookie: await adminCookie() }), env);
    assert.equal(response.status, 409);
    assert.equal(calls.filter(([url]) => url.includes(":append")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authenticated append uses RAW INSERT_ROWS and returns 201", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    if (String(url).includes(":append")) return new Response(JSON.stringify({ updates: {} }), { status: 200 });
    return new Response(JSON.stringify({ values: [["id", "title", "subtitle", "author", "isbn", "publisher", "published_date", "description", "pages", "language", "cover_image", "preview_link", "price", "stock", "condition", "is_featured", "categories", "shelves", "created_at", "date_added"]] }), { status: 200 });
  };
  try {
    const response = await worker.fetch(request("/api/admin/catalog", { title: "A New Book", author: "Writer", price: 100, stock: 2 }, { Cookie: await adminCookie() }), env);
    assert.equal(response.status, 201);
    const append = calls.find(([url]) => url.includes(":append"));
    assert.match(append[0], /valueInputOption=RAW/);
    assert.match(append[0], /insertDataOption=INSERT_ROWS/);
    assert.equal(JSON.parse(append[1].body).values.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("duplicate confirmation updates only price, stock, and condition", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    if (options?.method === "PUT") return new Response(JSON.stringify({ updatedRows: 1 }), { status: 200 });
    return new Response(JSON.stringify({ values: [
      ["id", "title", "subtitle", "author", "isbn", "publisher", "published_date", "description", "pages", "language", "cover_image", "preview_link", "price", "stock", "condition", "is_featured", "categories", "shelves", "created_at", "date_added"],
      [7, "Existing", "", "Author", "", "", "", "", 100, "English", "", "", 80, 2, "Good", "false", "", "", "", ""],
    ] }), { status: 200 });
  };
  try {
    const response = await worker.fetch(request("/api/admin/catalog/import-copy", { book_id: 7, quantity: 3, price: 95, condition: "Like New" }, { Cookie: await adminCookie() }), env);
    assert.equal(response.status, 200);
    const update = calls.find(([, options]) => options?.method === "PUT");
    assert.match(update[0], /Books!M2%3AO2/);
    assert.match(update[0], /valueInputOption=RAW/);
    assert.deepEqual(JSON.parse(update[1].body).values, [[95, 5, "Like New"]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("duplicate confirmation updates the actual row after an empty sheet row", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    if (options?.method === "PUT") return new Response(JSON.stringify({ updatedRows: 1 }), { status: 200 });
    return new Response(JSON.stringify({ values: [
      ["id", "title", "subtitle", "author", "isbn", "publisher", "published_date", "description", "pages", "language", "cover_image", "preview_link", "price", "stock", "condition", "is_featured", "categories", "shelves", "created_at", "date_added"],
      [7, "First row", "", "Author", "", "", "", "", 100, "English", "", "", 80, 2, "Good", "false", "", "", "", ""],
      [],
      [8, "Existing", "", "Writer", "", "", "", "", 100, "English", "", "", 80, 2, "Good", "false", "", "", "", ""],
    ] }), { status: 200 });
  };
  try {
    const response = await worker.fetch(request("/api/admin/catalog/import-copy", { book_id: 8, quantity: 1, price: 95, condition: "Good" }, { Cookie: await adminCookie() }), env);
    assert.equal(response.status, 200);
    const update = calls.find(([, options]) => options?.method === "PUT");
    assert.match(update[0], /Books!M4%3AO4/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("editing a book writes its editable fields to the existing Google Sheets row", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    if (options?.method === "PUT") return new Response(JSON.stringify({ updatedRows: 1 }), { status: 200 });
    return new Response(JSON.stringify({ values: [headers, existingBookRow] }), { status: 200 });
  };
  try {
    const body = {
      title: "After", subtitle: "", author: "New Author", isbn: "9780306406157", publisher: "New Press",
      published_date: "2024", description: "Updated description", pages: 220, language: "English",
      cover_image: "/images/covers/cover-02.jpg", preview_link: "", price: 55, stock: 3,
      condition: "Like New", is_featured: true, categories: ["Fiction", "Classics"], shelves: [],
    };
    const response = await worker.fetch(adminRequest("/api/admin/catalog/4", "PUT", body, await adminCookie()), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).book.title, "After");
    const update = calls.find(([, options]) => options?.method === "PUT");
    assert.match(update[0], /Books!B2%3AR2/);
    assert.match(update[0], /valueInputOption=RAW/);
    const savedValues = JSON.parse(update[1].body).values[0];
    assert.equal(savedValues.length, 17);
    assert.equal(savedValues[0], "After");
    assert.equal(savedValues[11], 55);
    assert.equal(savedValues[12], 3);
    assert.equal(savedValues[15], "Fiction|Classics");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cover upload stores the file and changes only the selected book cover cell", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const objects = new Map();
  const covers = {
    async put(key, body, options) {
      objects.set(key, { bytes: new Uint8Array(body), httpMetadata: options.httpMetadata });
    },
    async get(key) {
      const object = objects.get(key);
      return object ? {
        body: object.bytes,
        httpMetadata: object.httpMetadata,
        httpEtag: '"test-etag"',
        writeHttpMetadata(responseHeaders) {
          responseHeaders.set("Content-Type", object.httpMetadata.contentType);
        },
      } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  const coverEnv = { ...env, COVERS: covers };
  const selectedRow = [...existingBookRow];
  selectedRow[10] = "https://legacy.example/old-cover.jpg";
  const untouchedRow = [...existingBookRow];
  untouchedRow[0] = 5;
  untouchedRow[1] = "Untouched";
  untouchedRow[4] = "";
  untouchedRow[10] = "https://legacy.example/keep-this-cover.jpg";
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    if (options?.method === "PUT") return new Response(JSON.stringify({ updatedRows: 1 }), { status: 200 });
    return new Response(JSON.stringify({ values: [headers, selectedRow, untouchedRow] }), { status: 200 });
  };
  try {
    const response = await worker.fetch(
      coverUploadRequest("/api/admin/catalog/4/cover", png, "image/png", await adminCookie()),
      coverEnv,
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(payload.book.cover_image, /^\/_covers\/covers\/4\/[a-f0-9-]{36}\.png$/);

    const sheetUpdate = calls.find(([, options]) => options?.method === "PUT");
    assert.match(sheetUpdate[0], /Books!K2%3AK2/);
    assert.deepEqual(JSON.parse(sheetUpdate[1].body).values, [[payload.book.cover_image]]);

    const key = payload.book.cover_image.slice("/_covers/".length);
    assert.deepEqual(objects.get(key).bytes, png);
    assert.equal(objects.get(key).httpMetadata.contentType, "image/png");
    const imageResponse = await worker.fetch(new Request(`https://example.test${payload.book.cover_image}`), coverEnv);
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get("Content-Type"), "image/png");
    assert.deepEqual(new Uint8Array(await imageResponse.arrayBuffer()), png);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cover upload rejects non-image bytes and clearly reports missing R2 storage", async () => {
  const cookie = await adminCookie();
  const invalid = await worker.fetch(
    coverUploadRequest("/api/admin/catalog/4/cover", new TextEncoder().encode("<svg/>"), "image/svg+xml", cookie),
    { ...env, COVERS: { put: async () => assert.fail("invalid image must not be stored"), delete: async () => {} } },
  );
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /JPEG, PNG, or WebP/i);

  const unavailable = await worker.fetch(
    coverUploadRequest("/api/admin/catalog/4/cover", Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png", cookie),
    env,
  );
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, "COVER_STORAGE_NOT_CONFIGURED");
});

test("inventory patches update only the changed Google Sheets columns", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    if (options?.method === "PUT") return new Response(JSON.stringify({ updatedRows: 1 }), { status: 200 });
    return new Response(JSON.stringify({ values: [headers, existingBookRow] }), { status: 200 });
  };
  try {
    const response = await worker.fetch(adminRequest("/api/admin/catalog/4", "PATCH", { stock: 9, is_featured: true }, await adminCookie()), env);
    assert.equal(response.status, 200);
    const update = calls.find(([, options]) => options?.method === "PUT");
    assert.match(update[0], /Books!N2%3AP2/);
    assert.deepEqual(JSON.parse(update[1].body).values, [[9, "Good", "true"]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deleting a book clears only its matching Google Sheets row", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    if (String(url).includes(":clear")) return new Response(JSON.stringify({ clearedRange: "Books!A2:T2" }), { status: 200 });
    return new Response(JSON.stringify({ values: [headers, existingBookRow] }), { status: 200 });
  };
  try {
    const response = await worker.fetch(adminRequest("/api/admin/catalog/4", "DELETE", undefined, await adminCookie()), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, id: 4 });
    const clear = calls.find(([url]) => url.includes(":clear"));
    assert.match(clear[0], /Books!A2%3AT2:clear/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("saving settings creates the Settings worksheet and writes RAW key/value rows", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    if (String(url).includes("?fields=")) return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: "Books" } }] }), { status: 200 });
    if (String(url).includes(":batchUpdate")) return new Response(JSON.stringify({ replies: [{ addSheet: { properties: { sheetId: 2, title: "Settings" } } }] }), { status: 200 });
    return new Response(JSON.stringify({ updatedRows: 6 }), { status: 200 });
  };
  try {
    const values = { store_name: "Nidha Books", store_tagline: "Read more", delivery_info: "Message to arrange delivery", whatsapp_number: "+91 7306 266 761", currency_symbol: "₹" };
    const response = await worker.fetch(adminRequest("/api/admin/settings", "PUT", values, await adminCookie()), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).settings.whatsapp_number, "917306266761");
    const createSheet = calls.find(([url]) => url.includes(":batchUpdate"));
    assert.equal(JSON.parse(createSheet[1].body).requests[0].addSheet.properties.title, "Settings");
    const update = calls.find(([url]) => url.includes("/values/Settings!"));
    assert.match(update[0], /valueInputOption=RAW/);
    assert.deepEqual(JSON.parse(update[1].body).values[0], ["setting", "value"]);
    assert.equal(JSON.parse(update[1].body).values.length, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalog reads the persisted Settings worksheet", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    if (String(url).includes("/values/Books!")) return new Response(JSON.stringify({ values: [headers] }), { status: 200 });
    if (String(url).includes("?fields=")) return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: "Books" } }, { properties: { sheetId: 2, title: "Settings" } }] }), { status: 200 });
    if (String(url).includes("/values/Settings!")) return new Response(JSON.stringify({ values: [
      ["setting", "value"],
      ["store_name", "Updated store"],
      ["store_tagline", "Updated tagline"],
      ["delivery_info", "Local delivery"],
      ["whatsapp_number", "917000000000"],
      ["currency_symbol", "₹"],
    ] }), { status: 200 });
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/catalog"), env);
    assert.equal(response.status, 200);
    const catalog = await response.json();
    assert.equal(catalog.settings.store_name, "Updated store");
    assert.equal(catalog.settings.whatsapp_number, "917000000000");
  } finally {
    globalThis.fetch = originalFetch;
  }
});