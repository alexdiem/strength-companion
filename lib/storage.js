import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

export const PATTERNS = ["Push", "Pull", "Hinge", "Squat", "Carry", "Olympic"];
export const LOADS = ["Light", "Moderate", "Heavy"];

// Two backends behind the same interface:
// - Upstash Redis when its env vars are present (Vercel marketplace integration)
// - a local JSON file otherwise (local dev — data/sessions.json, git-ignored)
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const REDIS_KEY = "strength-companion:sessions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

let redis = null;
function getRedis() {
  if (!REDIS_URL || !REDIS_TOKEN) {
    if (process.env.VERCEL) {
      // The filesystem on Vercel is ephemeral — refuse rather than silently lose data.
      throw new Error(
        "No persistent storage configured. Add the Upstash Redis integration to this Vercel project (Storage tab)."
      );
    }
    return null;
  }
  if (!redis) redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
  return redis;
}

export async function readSessions() {
  const r = getRedis();
  if (r) {
    const value = await r.get(REDIS_KEY);
    return Array.isArray(value) ? value : [];
  }
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

export async function writeSessions(sessions) {
  const r = getRedis();
  if (r) {
    await r.set(REDIS_KEY, sessions);
    return;
  }
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf8");
}

export function isValidSessionInput(body) {
  if (!body || typeof body !== "object") return false;
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return false;
  if (typeof body.title !== "string" || !body.title.trim()) return false;
  if (!Array.isArray(body.patterns) || body.patterns.length === 0) return false;
  return body.patterns.every((p) => p && PATTERNS.includes(p.pattern) && LOADS.includes(p.load));
}

export function buildSession(input) {
  return {
    id: randomUUID(),
    date: input.date,
    title: input.title.trim(),
    patterns: input.patterns.map(({ pattern, load }) => ({ pattern, load })),
  };
}

export const SESSION_INPUT_ERROR =
  "Session must include date (YYYY-MM-DD), title, and at least one valid pattern/load tag.";
