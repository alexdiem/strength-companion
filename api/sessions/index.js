import {
  readSessions,
  writeSessions,
  isValidSessionInput,
  buildSession,
  SESSION_INPUT_ERROR,
} from "../../lib/storage.js";
import { isAuthenticated } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (!isAuthenticated(req, process.env.SESSION_SECRET)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.method === "GET") {
    res.status(200).json(await readSessions());
    return;
  }
  if (req.method === "POST") {
    if (!isValidSessionInput(req.body)) {
      res.status(400).json({ error: SESSION_INPUT_ERROR });
      return;
    }
    const session = buildSession(req.body);
    const sessions = await readSessions();
    sessions.push(session);
    await writeSessions(sessions);
    res.status(201).json(session);
    return;
  }
  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}
