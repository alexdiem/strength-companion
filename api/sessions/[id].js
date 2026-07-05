import { readSessions, writeSessions } from "../../lib/storage.js";
import { isAuthenticated } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!isAuthenticated(req, process.env.SESSION_SECRET)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const id = req.query.id;
  const sessions = await readSessions();
  const next = sessions.filter((s) => s.id !== id);
  if (next.length === sessions.length) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  await writeSessions(next);
  res.status(204).end();
}
