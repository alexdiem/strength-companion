# Strength Companion

A local strength training companion app with two integrated features:

- **Session Adapter** — paste a raw CrossFit WOD (Kriger Training, Linchpin, …) and get a 60-minute adapted version back from Claude.
- **Movement Pattern Tracker** — log sessions tagged with movement patterns (Push, Pull, Hinge, Squat, Carry, Olympic) and load (Light, Moderate, Heavy), with rolling 7/28-day frequency charts and overtraining warnings.

## Adaptation rules

Every adapted session follows these rules:

- Total session = 60 min, including a fixed 12-min warm-up.
- Sets and rest periods are trimmed proportionally to fit the time budget.
- High-load Olympic lifting progressions (heavy snatch/clean complexes) are flagged and removed.
- Good mornings are never included — a safe hinge alternative is substituted.
- Post-WOD zone 1 cardio (30–60 min bike/row/run) is removed.
- Technical barbell lifts are capped at controlled, submaximal loads.
- Metric units only (kg).

## Tracker

- Sessions are saved server-side — locally to `data/sessions.json` (git-ignored), on Vercel to Upstash Redis. No login, no account.
- Persists across app restarts and across browsers, since it's stored server-side rather than in the browser.
- Each session: date, title, and pattern tags with load.
- Bar chart shows pattern distribution over the last 7 or 28 days, stacked by load.
- A warning appears if any pattern is trained at Heavy load more than twice in 7 days.
- Sessions previously saved in browser localStorage (an earlier version of the app) are migrated automatically to `data/sessions.json` on first load.

## Setup

Requires Node.js 18+.

```powershell
cd strength-companion
npm install
$env:ANTHROPIC_API_KEY = "sk-ant-..."   # needed for the Session Adapter
npm start
```

Then open http://localhost:3000.

To set the key permanently (so you don't have to set it each time):

```powershell
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
```

The tracker works without an API key; only the adapter needs one.

## Deploying to Vercel

The repo is Vercel-ready: `public/` is served as static files, and the routes under `api/` run as serverless functions (`vercel.json` raises the adapt function's `maxDuration` to 60s for the Claude call). Setup in the Vercel dashboard:

1. **Import the GitHub repo** as a new project (no framework preset / build step needed).
2. **Storage** — add the **Upstash for Redis** integration to the project (Storage tab). The filesystem on Vercel is ephemeral, so the tracker refuses to run there without Redis; the integration's env vars (`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_URL`/`KV_REST_API_TOKEN`) are picked up automatically.
3. **Environment variable** — add `ANTHROPIC_API_KEY` (Settings → Environment Variables).
4. **Access protection** — enable Deployment Protection → **Vercel Authentication** (Settings → Deployment Protection) so only you can open the app. Without this, anyone with the URL can use your Anthropic API key.

Local dev is unchanged: `npm start` runs `server.js` with the JSON-file backend — no Redis needed. Note the two backends are separate stores: sessions logged locally stay local and vice versa.
