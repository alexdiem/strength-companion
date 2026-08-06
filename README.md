# Strength Companion

A local strength training companion app with two integrated features:

- **Session Adapter** — paste a raw CrossFit WOD (Kriger Training, Linchpin, …) and get a 60-minute adapted version back from Claude.
- **Movement Pattern Tracker** — log sessions tagged with movement patterns (Push, Pull, Hinge, Squat, Carry, Olympic) and load (Light, Moderate, Heavy), with rolling 7/28-day frequency charts and overtraining warnings.

## Adaptation rules

Every adapted session follows these rules:

- Total session = 60 min, including a fixed 12-min warm-up, which always includes a fixed oly-prep drill from the athlete's Olympic lifting coach (asymmetric stretches + empty-bar overhead squats/snatch work), reproduced exactly as prescribed and placed wherever it best fits that day's warm-up rather than forced to open it.
- Volume is trimmed to fit the time budget by cutting sets, never by cutting rest on heavy work — full recovery is what keeps a heavy set heavy. Rest is only trimmed on light/moderate accessory and conditioning work.
- High-load Olympic lifting progressions (heavy snatch/clean complexes) are flagged and removed.
- Good mornings are never included — a safe hinge alternative is substituted.
- Kipping/swinging gymnastics (kipping or butterfly pull-ups, kipping toes-to-bar, kipping HSPU, muscle-ups) are never included — the gym has no safe space for kipping, so strict versions at reduced reps are substituted.
- Post-WOD zone 1 cardio (30–60 min bike/row/run) is removed.
- The day's main movement pattern is trained Heavy (demanding top sets, 1-2 reps in reserve — no grinding maxes); technical/Olympic lifts stay capped at controlled, submaximal loads and are never the heavy main lift.
- Loads for weighted exercises are always prescribed as % of 1RM (fixed implements like wall balls and kettlebells keep a kg weight).
- Session intensity averages out to Moderate, with variation — the main movement is Heavy while accessories and conditioning sit lighter, so a session never comes out all-Light (unless the original was a deliberate light day).
- Metric units only.
- Every session ends with a short (3–5 min) down-regulation close — breathing plus one or two easy positions for the day's main movers. It sits on top of the 60 minutes and is never counted into the warm-up or work budget.

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

## Password protection

The whole app (UI + API) sits behind a single shared password. Enter it once and it's cached in a signed, `HttpOnly` session cookie for 30 days — the cookie can't be read or tampered with by page JavaScript (immune to XSS token theft), never contains the password itself, and is verified with a constant-time comparison to resist timing attacks. Logging in again is only needed after the cookie expires, if you clear cookies, or on a new device/browser.

Requires two environment variables, both used only server-side:

- `APP_PASSWORD` — the password you type in.
- `SESSION_SECRET` — a random key used to sign session cookies (never the password itself).

Generate both with:

```powershell
node scripts/generate-password.js
```

This prints a fresh `APP_PASSWORD=...` (three random words + a number) and `SESSION_SECRET=...` line. Add both to your local `.env` and, for a deployed copy, to the Vercel project's Environment Variables — they're not committed to git, so they won't appear anywhere in this repo. Run the script again any time you want to rotate the password; a new `SESSION_SECRET` immediately invalidates all previously issued session cookies.

## Deploying to Vercel

The repo is Vercel-ready: `public/` is served as static files, and the routes under `api/` run as serverless functions (`vercel.json` raises the adapt function's `maxDuration` to 60s for the Claude call). Setup in the Vercel dashboard:

1. **Import the GitHub repo** as a new project (no framework preset / build step needed).
2. **Storage** — add the **Upstash for Redis** integration to the project (Storage tab). The filesystem on Vercel is ephemeral, so the tracker refuses to run there without Redis; the integration's env vars (`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_URL`/`KV_REST_API_TOKEN`) are picked up automatically.
3. **Environment variables** — add `ANTHROPIC_API_KEY`, `APP_PASSWORD`, and `SESSION_SECRET` (Settings → Environment Variables). Without the latter two, every request is rejected — see Password protection above.
4. **Access protection (optional, extra layer)** — you can also enable Deployment Protection → **Vercel Authentication** (Settings → Deployment Protection), but it's no longer required for security since the app-level password now guards the whole thing; it would just add a second Vercel-account login on top.

Local dev is unchanged: `npm start` runs `server.js` with the JSON-file backend — no Redis needed. Note the two backends are separate stores: sessions logged locally stay local and vice versa.
