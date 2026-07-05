import { verifyPassword, createSessionToken, buildSessionCookie } from "../lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const expected = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expected || !secret) {
    res.status(500).json({ error: "Server is not configured with APP_PASSWORD / SESSION_SECRET." });
    return;
  }
  if (!verifyPassword(req.body?.password, expected)) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }
  const token = createSessionToken(secret);
  res.setHeader("Set-Cookie", buildSessionCookie(token, { secure: !!process.env.VERCEL }));
  res.status(200).json({ ok: true });
}
