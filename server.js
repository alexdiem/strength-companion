import Anthropic from "@anthropic-ai/sdk";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const PORT = process.env.PORT || 3000;

const PATTERNS = ["Push", "Pull", "Hinge", "Squat", "Carry", "Olympic"];
const LOADS = ["Light", "Moderate", "Heavy"];

const client = new Anthropic();

// ---------- session storage (JSON file on disk — durable across restarts, single-user) ----------

async function readSessions() {
  try {
    const raw = await fs.promises.readFile(SESSIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    console.error("Failed to read sessions.json, treating as empty:", err.message);
    return [];
  }
}

async function writeSessions(sessions) {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf8");
}

function isValidSessionInput(body) {
  if (!body || typeof body !== "object") return false;
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return false;
  if (typeof body.title !== "string" || !body.title.trim()) return false;
  if (!Array.isArray(body.patterns) || body.patterns.length === 0) return false;
  return body.patterns.every((p) => p && PATTERNS.includes(p.pattern) && LOADS.includes(p.load));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const SYSTEM_PROMPT = `You are a strength training coach who adapts CrossFit WODs (from sites like Kriger Training or Linchpin) into 60-minute sessions for an athlete who also does separate endurance training.

Adaptation rules — apply all of them, every time:
1. Total session = exactly 60 minutes, including a 12-minute warm-up. Budget the remaining 48 minutes across the work blocks.
2. Trim sets and rest periods proportionally so the original session's intent fits the time budget.
3. Flag and REMOVE any high-load Olympic lifting progressions: building snatch or clean complexes with increasing load, multiple heavy sets of snatch/clean/jerk. If an Olympic lift appears in a conditioning piece, keep it only at a light, technique-focused load.
4. NEVER include good mornings under any circumstances, in any block including the warm-up — this includes light, bodyweight, or "pattern practice" versions of the movement. If the original has them, substitute a safe hinge alternative (e.g. Romanian deadlift at moderate load, glute bridge, back extension) and say why.
5. Remove any post-WOD zone 1 / low-intensity cardio (30-60 min bike, row, run, etc.) — the athlete gets this from separate endurance training.
6. Cap barbell complexity: keep technical barbell lifts at controlled, submaximal loads (roughly 60-75% effort), never grinding maximal singles or complexes.
7. Metric units only: kg, metres, calories. Convert any lbs loads to sensible rounded kg.

Warm-up rules:
- Build the warm-up from the specific movements that appear in the day's blocks (e.g. if the session has back squats, include bodyweight squats and empty-bar/light-loaded squats; if it has a barbell hinge, include glute bridges and light RDLs; if it has a snatch or clean, include the relevant barbell progression drills; if it has a gymnastics or engine piece, include the relevant prep for that too).
- Every warm-up line must be a specific, prescribed movement with an exact rep count, distance, or duration — never a vague label. Do not write generic entries like "dynamic mobility", "general warm-up", "activation", or "movement prep" with no detail.
- Bad: "4 min dynamic mobility: hips, thoracic, shoulders, ankles"
- Good: "10 leg swings each side, 10 walking lunges w/ torso twist, 10 arm circles each direction, 30 sec each side deep squat hold"
- Bad: "3 min barbell drills: overhead squat, snatch balance with empty bar"
- Good: "Empty bar (20kg): 5 good-form overhead squats, 5 snatch balances, 5 hang power snatches"

Output format (use exactly these markdown sections):
## Warm-up (12 min)
- bullet list of warm-up items with rough minutes, each one a specific movement with an exact rep/distance/duration count as described above

## Block 1: <name> (~X min)
Sets/reps/loading, rest, and a one-line intent note. Repeat "## Block N" for each block. Time estimates must sum to 48 minutes.

## What changed and why
- short bullet list: each removal/substitution/trim and the one-line reason.

## Log this in the Pattern Tracker
- one bullet per movement pattern actually trained in the ADAPTED session (ignore the warm-up), formatted exactly as "<Pattern> · <Load>"
- Pattern must be exactly one of: Push, Pull, Hinge, Squat, Carry, Olympic — pick every pattern that applies (a session can hit more than one)
- Load must be exactly one of: Light, Moderate, Heavy, judged by the adapted session's actual prescribed effort (e.g. submaximal barbell work capped per rule 6 is usually Moderate, not Heavy; technique-focused Olympic lifts are Light, not Heavy)
- Do not include a pattern that doesn't appear in the adapted work blocks

Keep the tone plain and practical. No preamble before the first heading, nothing after the last section.`;

async function handleAdapt(req, res) {
  const rawBody = await readRequestBody(req);
  let wod;
  try {
    ({ wod } = JSON.parse(rawBody || "{}"));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }
  if (!wod || !wod.trim()) {
    sendJson(res, 400, { error: "No workout text provided." });
    return;
  }
  try {
    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Adapt this WOD to a 60-minute session following your rules:\n\n${wod}`,
        },
      ],
    });
    const message = await stream.finalMessage();
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    sendJson(res, 200, { adapted: text });
  } catch (err) {
    const missingKey =
      err instanceof Anthropic.AuthenticationError ||
      /apiKey|api key|authentication/i.test(String(err.message));
    sendJson(res, missingKey ? 401 : 500, {
      error: missingKey
        ? "Anthropic API key missing or invalid. Set the ANTHROPIC_API_KEY environment variable and restart the server."
        : `Adaptation failed: ${err.message}`,
    });
  }
}

async function handleListSessions(req, res) {
  const sessions = await readSessions();
  sendJson(res, 200, sessions);
}

async function handleCreateSession(req, res) {
  const rawBody = await readRequestBody(req);
  let input;
  try {
    input = JSON.parse(rawBody || "{}");
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }
  if (!isValidSessionInput(input)) {
    sendJson(res, 400, {
      error: "Session must include date (YYYY-MM-DD), title, and at least one valid pattern/load tag.",
    });
    return;
  }
  const session = {
    id: randomUUID(),
    date: input.date,
    title: input.title.trim(),
    patterns: input.patterns.map(({ pattern, load }) => ({ pattern, load })),
  };
  const sessions = await readSessions();
  sessions.push(session);
  await writeSessions(sessions);
  sendJson(res, 201, session);
}

async function handleDeleteSession(req, res, id) {
  const sessions = await readSessions();
  const next = sessions.filter((s) => s.id !== id);
  if (next.length === sessions.length) {
    sendJson(res, 404, { error: "Session not found." });
    return;
  }
  await writeSessions(next);
  res.writeHead(204);
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/adapt") {
      await handleAdapt(req, res);
      return;
    }
    if (req.method === "GET" && req.url === "/api/sessions") {
      await handleListSessions(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/api/sessions") {
      await handleCreateSession(req, res);
      return;
    }
    const deleteMatch = req.method === "DELETE" && req.url.match(/^\/api\/sessions\/([^/]+)$/);
    if (deleteMatch) {
      await handleDeleteSession(req, res, decodeURIComponent(deleteMatch[1]));
      return;
    }
  } catch (err) {
    sendJson(res, 500, { error: `Server error: ${err.message}` });
    return;
  }

  // static files
  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Strength Companion running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Warning: ANTHROPIC_API_KEY is not set — the session adapter will not work until it is.");
  }
});
