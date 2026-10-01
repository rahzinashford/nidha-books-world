import { getCatalog, queryBooks } from "./catalog";
import { appendBook, deleteBook, importCopy, patchBook, readSettings, saveSettings, updateBook } from "./googleSheets";
import { metadataSearch } from "./metadata";
import { MAX_COVER_BYTES, saveBookCover, serveBookCover } from "./covers";
import { createAdminCookie, clearAdminCookie, readSession } from "./sessions";

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
const isAdminApiPath = (path) => path.startsWith("/api/admin");
const isWriteMethod = (method) => ["POST", "PUT", "PATCH", "DELETE"].includes(method);
function sameOriginError(request) {
  const originHeader = request.headers.get("Origin");
  if (!originHeader) return json({ error: "A same-origin request is required.", code: "CROSS_ORIGIN_REQUEST" }, 403);
  try {
    const origin = new URL(originHeader);
    const destination = new URL(request.url);
    if (origin.origin !== destination.origin
      || request.headers.get("Sec-Fetch-Site") === "cross-site") {
      return json({ error: "Cross-origin admin writes are not allowed.", code: "CROSS_ORIGIN_REQUEST" }, 403);
    }
  } catch {
    return json({ error: "A valid same-origin request is required.", code: "CROSS_ORIGIN_REQUEST" }, 403);
  }
  return null;
}
const writeError = (error) => {
  const message = error.message || "Catalog write failed.";
  const status = /permission denied|authentication failed|(?:read|write) failed \(403\)/i.test(message) ? 403
    : /not found/i.test(message) ? 404
      : /matching book already exists/i.test(message) ? 409
        : /configuration|read failed|write failed/i.test(message) ? 503 : 400;
  const code = status === 403 ? "CATALOG_PERMISSION_DENIED"
    : status === 404 ? "CATALOG_NOT_FOUND"
      : status === 409 ? "CATALOG_DUPLICATE"
        : status === 503 ? "CATALOG_UNAVAILABLE"
          : "CATALOG_WRITE_FAILED";
  return json({ error: message, code }, status);
};

async function requireAdmin(request, env) {
  return readSession(request, env.SESSION_SECRET);
}

async function catalogResponse(env) {
  try {
    const catalog = await getCatalog(env);
    return json({ ...catalog, source: "catalog", settings: await readSettings(env) });
  } catch (error) {
    return json({ error: error.message || "Catalog configuration error.", code: "CATALOG_UNAVAILABLE" }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith("/_covers/")) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      const cover = await serveBookCover(request, env);
      return request.method === "HEAD" ? new Response(null, { status: cover.status, headers: cover.headers }) : cover;
    }
    if (path === "/api/catalog" && request.method === "GET") return catalogResponse(env);
    if (path === "/api/admin/catalog" && request.method === "PUT") {
      return json({ error: "Replacing the entire catalog is not supported. Use the authenticated import route to add a book." }, 405, { Allow: "GET, POST" });
    }
    if (path === "/api/books" && request.method === "GET") {
      try { const catalog = await getCatalog(env); return json(queryBooks(catalog.books, url.searchParams.get("q") || "")); }
      catch (error) { return json({ error: error.message, code: "CATALOG_UNAVAILABLE" }, 503); }
    }
    if (path === "/api/suggest" && request.method === "GET") {
      const query = url.searchParams.get("q") || "";
      if (query.trim().length < 2) return json([]);
      try { const catalog = await getCatalog(env); return json(queryBooks(catalog.books, query).slice(0, 6).map((book) => ({ id: book.id, title: book.title, author: book.author, genre: book.categories?.[0] || "", cover_image: book.cover_image, price: book.price }))); }
      catch (error) { return json({ error: error.message, code: "CATALOG_UNAVAILABLE" }, 503); }
    }
    if (path === "/admin/login" && request.method === "POST") {
      const originError = sameOriginError(request);
      if (originError) return originError;
      const submitted = (await request.json().catch(() => ({}))).password || "";
      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "Admin authentication is not configured. Set ADMIN_PASSWORD and SESSION_SECRET." }, 503);
      if (submitted !== env.ADMIN_PASSWORD) return json({ error: "Incorrect password." }, 401);
      return json({ ok: true }, 200, { "Set-Cookie": await createAdminCookie(env.SESSION_SECRET) });
    }
    if (path === "/admin/logout" && request.method === "POST") {
      const originError = sameOriginError(request);
      if (originError) return originError;
      return json({ ok: true }, 200, { "Set-Cookie": clearAdminCookie() });
    }
    if (path.startsWith("/admin/") && path !== "/admin/login" && request.method === "GET") {
      const session = await requireAdmin(request, env);
      if (!session?.admin) return Response.redirect(new URL("/admin/login", request.url), 302);
    }
    if (isAdminApiPath(path)) {
      const session = await requireAdmin(request, env);
      if (!session?.admin) return json({ error: "Unauthorized admin request." }, 401);
      if (isWriteMethod(request.method)) {
        const originError = sameOriginError(request);
        if (originError) return originError;
      }
    }
    if (path === "/api/admin/session" && request.method === "GET") return json({ admin: true });
    if (path === "/api/admin/catalog" && request.method === "POST") {
      try {
        const result = await appendBook(env, await request.json());
        if (result.duplicate) return json({ error: "A matching book already exists in the catalog.", code: "CATALOG_DUPLICATE", duplicate: result.duplicate }, 409);
        return json(result, 201);
      } catch (error) {
        return writeError(error);
      }
    }
    if (path === "/api/admin/catalog/import-copy" && request.method === "POST") {
      try {
        return json(await importCopy(env, await request.json()));
      } catch (error) {
        return writeError(error);
      }
    }
    const coverRoute = path.match(/^\/api\/admin\/catalog\/(\d+)\/cover$/);
    if (coverRoute && request.method === "POST") {
      if (!env.COVERS || typeof env.COVERS.put !== "function" || typeof env.COVERS.delete !== "function") {
        return json({ error: "Cover uploads are not configured. Bind a Cloudflare R2 bucket as COVERS.", code: "COVER_STORAGE_NOT_CONFIGURED" }, 503);
      }
      const contentLength = Number(request.headers.get("Content-Length") || 0);
      if (contentLength > MAX_COVER_BYTES + 64 * 1024) {
        return json({ error: "Cover images must be 8 MB or smaller.", code: "COVER_TOO_LARGE" }, 413);
      }
      let form;
      try {
        form = await request.formData();
      } catch {
        return json({ error: "Send the image as multipart form data.", code: "INVALID_COVER_UPLOAD" }, 400);
      }
      const file = form.get("cover");
      if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
        return json({ error: "Choose an image file to upload.", code: "INVALID_COVER_UPLOAD" }, 400);
      }
      try {
        return json(await saveBookCover(env, coverRoute[1], file));
      } catch (error) {
        return writeError(error);
      }
    }
    const bookRoute = path.match(/^\/api\/admin\/catalog\/(\d+)$/);
    if (bookRoute && request.method === "PUT") {
      try {
        return json(await updateBook(env, bookRoute[1], await request.json()));
      } catch (error) {
        return writeError(error);
      }
    }
    if (bookRoute && request.method === "PATCH") {
      try {
        return json(await patchBook(env, bookRoute[1], await request.json()));
      } catch (error) {
        return writeError(error);
      }
    }
    if (bookRoute && request.method === "DELETE") {
      try {
        return json(await deleteBook(env, bookRoute[1]));
      } catch (error) {
        return writeError(error);
      }
    }
    if (path === "/api/admin/settings" && request.method === "PUT") {
      try {
        return json(await saveSettings(env, await request.json()));
      } catch (error) {
        return writeError(error);
      }
    }
    if (path === "/api/admin/catalog" && request.method === "GET") return catalogResponse(env);
    if (path === "/api/admin/metadata/search" && request.method === "GET") {
      try {
        return json(await metadataSearch(url.searchParams.get("q") || "", url.searchParams.get("source") || "all"));
      } catch (error) {
        return json({ error: error.message || "Invalid metadata search request.", code: "INVALID_METADATA_SEARCH" }, 400);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};