import { patchBook } from "./googleSheets";

export const MAX_COVER_BYTES = 8 * 1024 * 1024;
const COVER_PREFIX = "/_covers/";
const IMAGE_TYPES = [
  { extension: "jpg", mime: "image/jpeg", matches: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { extension: "png", mime: "image/png", matches: (bytes) => bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) },
  { extension: "webp", mime: "image/webp", matches: (bytes) => bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" },
];

export async function saveBookCover(env, bookIdValue, file) {
  if (!env.COVERS || typeof env.COVERS.put !== "function" || typeof env.COVERS.delete !== "function") {
    throw new Error("Cover uploads are not configured. Bind a Cloudflare R2 bucket as COVERS.");
  }
  const bookId = Number(bookIdValue);
  if (!Number.isInteger(bookId) || bookId < 1) throw new Error("book_id must be a positive integer.");
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("Choose an image file to upload.");
  if (!Number.isFinite(file.size) || file.size < 1) throw new Error("The selected image is empty.");
  if (file.size > MAX_COVER_BYTES) throw new Error("Cover images must be 8 MB or smaller.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_COVER_BYTES) throw new Error("The selected image has an invalid size.");
  const type = IMAGE_TYPES.find((candidate) => candidate.matches(bytes));
  if (!type) throw new Error("Use a JPEG, PNG, or WebP image. SVG and other formats are not supported.");

  const key = `covers/${bookId}/${crypto.randomUUID()}.${type.extension}`;
  const coverImage = `${COVER_PREFIX}${key}`;
  await env.COVERS.put(key, bytes, {
    httpMetadata: {
      contentType: type.mime,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: { bookId: String(bookId) },
  });

  try {
    const result = await patchBook(env, bookId, { cover_image: coverImage });
    return { ...result, cover_image: coverImage };
  } catch (error) {
    try { await env.COVERS.delete(key); } catch { /* Preserve the catalog error. */ }
    throw error;
  }
}

export async function serveBookCover(request, env) {
  if (!env.COVERS || typeof env.COVERS.get !== "function") {
    return new Response("Cover storage is not configured.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  let key;
  try {
    key = decodeURIComponent(new URL(request.url).pathname.slice(COVER_PREFIX.length));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!/^covers\/[1-9]\d*\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(key)) {
    return new Response("Not found", { status: 404 });
  }
  const object = await env.COVERS.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", object.httpMetadata?.contentType || headers.get("Content-Type") || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", "inline");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}