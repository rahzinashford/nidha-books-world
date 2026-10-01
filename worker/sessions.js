const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function keyFor(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(payload, secret) {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function readSession(request, secret) {
  if (!secret) return null;
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)nbw_session=([^;]+)/);
  if (!match) return null;
  const [body, signature] = match[1].split(".");
  if (!body || !signature) return null;
  const valid = await crypto.subtle.verify("HMAC", await keyFor(secret), fromBase64Url(signature), encoder.encode(body));
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export async function createAdminCookie(secret) {
  const value = await signSession({ admin: true, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 }, secret);
  return `nbw_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
}

export function clearAdminCookie() {
  return "nbw_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}