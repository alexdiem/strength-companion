import { adaptWod, isMissingKeyError, MISSING_KEY_MESSAGE } from "../lib/adapt.js";
import { isAuthenticated } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!isAuthenticated(req, process.env.SESSION_SECRET)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const wod = req.body?.wod;
  if (!wod || typeof wod !== "string" || !wod.trim()) {
    res.status(400).json({ error: "No workout text provided." });
    return;
  }
  try {
    const adapted = await adaptWod(wod);
    res.status(200).json({ adapted });
  } catch (err) {
    if (isMissingKeyError(err)) {
      res.status(401).json({ error: MISSING_KEY_MESSAGE });
    } else {
      res.status(500).json({ error: `Adaptation failed: ${err.message}` });
    }
  }
}
