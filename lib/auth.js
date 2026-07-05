import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE_NAME = "sc_session";

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

// Session token is "<expiry>.<hmac>" — stateless, no server-side session store needed.
// The cookie never contains the password itself, only a signed, time-limited token.
export function createSessionToken(secret) {
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS);
  return `${expiry}.${sign(expiry, secret)}`;
}

export function verifySessionToken(token, secret) {
  if (!secret || !token || typeof token !== "string") return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const expiry = Number(payload);
  return Number.isFinite(expiry) && expiry > Math.floor(Date.now() / 1000);
}

export function verifyPassword(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function buildSessionCookie(token, { secure }) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function isAuthenticated(req, secret) {
  if (!secret) return false;
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionToken(cookies[SESSION_COOKIE_NAME], secret);
}
