// Local dev server. On Vercel the api/ functions and public/ static hosting
// replace this file; both paths share the logic in lib/.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adaptWod, isMissingKeyError, MISSING_KEY_MESSAGE } from "./lib/adapt.js";
import {
  readSessions,
  writeSessions,
  isValidSessionInput,
  buildSession,
  SESSION_INPUT_ERROR,
} from "./lib/storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.PORT || 3000;

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

async function parseJsonBody(req, res) {
  try {
    return JSON.parse((await readRequestBody(req)) || "{}");
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return null;
  }
}

async function handleAdapt(req, res) {
  const input = await parseJsonBody(req, res);
  if (input === null) return;
  const wod = input.wod;
  if (!wod || typeof wod !== "string" || !wod.trim()) {
    sendJson(res, 400, { error: "No workout text provided." });
    return;
  }
  try {
    sendJson(res, 200, { adapted: await adaptWod(wod) });
  } catch (err) {
    if (isMissingKeyError(err)) {
      sendJson(res, 401, { error: MISSING_KEY_MESSAGE });
    } else {
      sendJson(res, 500, { error: `Adaptation failed: ${err.message}` });
    }
  }
}

async function handleCreateSession(req, res) {
  const input = await parseJsonBody(req, res);
  if (input === null) return;
  if (!isValidSessionInput(input)) {
    sendJson(res, 400, { error: SESSION_INPUT_ERROR });
    return;
  }
  const session = buildSession(input);
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
      sendJson(res, 200, await readSessions());
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
