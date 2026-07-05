const PATTERNS = ["Push", "Pull", "Hinge", "Squat", "Carry", "Olympic"];
const LOADS = ["Light", "Moderate", "Heavy"];
const LEGACY_STORAGE_KEY = "strength-companion-sessions"; // old browser-local storage, pre server-side persistence

// ---------- auth gate ----------

const authGate = document.getElementById("auth-gate");
const authForm = document.getElementById("auth-form");
const authPassword = document.getElementById("auth-password");
const authError = document.getElementById("auth-error");
const appRoot = document.getElementById("app-root");

function showGate() {
  authGate.hidden = false;
  appRoot.hidden = true;
  authPassword.value = "";
  authPassword.focus();
}

function hideGate() {
  authGate.hidden = true;
  appRoot.hidden = false;
}

// treat any 401 as "session expired or never logged in" and re-show the gate
function handleUnauthorized(res) {
  if (res.status === 401) {
    showGate();
    return true;
  }
  return false;
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.hidden = true;
  const submitBtn = authForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: authPassword.value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      authError.textContent = data.error || "Incorrect password.";
      authError.hidden = false;
      return;
    }
    hideGate();
    await migrateLegacyLocalStorage();
    render();
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- storage (server-side — persists across restarts and browsers) ----------

async function fetchSessions() {
  const res = await fetch("/api/sessions");
  if (handleUnauthorized(res)) throw new Error("Please log in again.");
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

async function createSession(session) {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  if (handleUnauthorized(res)) throw new Error("Please log in again.");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server returned ${res.status}`);
  }
  return res.json();
}

async function deleteSession(id) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (handleUnauthorized(res)) throw new Error("Please log in again.");
  if (!res.ok && res.status !== 404) throw new Error(`Server returned ${res.status}`);
}

// one-time migration: move any sessions logged before server-side storage existed
async function migrateLegacyLocalStorage() {
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
  } catch {
    legacy = [];
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return;
  for (const s of legacy) {
    if (!s || !Array.isArray(s.patterns) || s.patterns.length === 0) continue;
    try {
      await createSession({ date: s.date, title: s.title, patterns: s.patterns });
    } catch {
      return; // leave localStorage intact; retry next load rather than lose data
    }
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

const trackerError = document.getElementById("tracker-error");
function showTrackerError(message) {
  trackerError.textContent = message;
  trackerError.hidden = false;
}
function hideTrackerError() {
  trackerError.hidden = true;
}

// ---------- tabs ----------

const views = { adapter: document.getElementById("view-adapter"), tracker: document.getElementById("view-tracker") };
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    Object.entries(views).forEach(([name, el]) => (el.hidden = name !== btn.dataset.view));
  });
});

// ---------- session adapter ----------

const adaptBtn = document.getElementById("adapt-btn");
const wodInput = document.getElementById("wod-input");
const adaptStatus = document.getElementById("adapt-status");
const adaptError = document.getElementById("adapt-error");
const adaptResult = document.getElementById("adapt-result");
const logSessionRow = document.getElementById("log-session-row");
const logSessionBtn = document.getElementById("log-session-btn");
const logSessionStatus = document.getElementById("log-session-status");

let lastAdaptedMarkdown = null;

adaptBtn.addEventListener("click", async () => {
  const wod = wodInput.value.trim();
  adaptError.hidden = true;
  adaptResult.hidden = true;
  logSessionRow.hidden = true;
  lastAdaptedMarkdown = null;
  if (!wod) {
    adaptError.textContent = "Paste a workout first.";
    adaptError.hidden = false;
    return;
  }
  adaptBtn.disabled = true;
  adaptStatus.hidden = false;
  try {
    const res = await fetch("/api/adapt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wod }),
    });
    if (handleUnauthorized(res)) throw new Error("Please log in again.");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    adaptResult.innerHTML = renderMarkdown(data.adapted);
    adaptResult.hidden = false;
    lastAdaptedMarkdown = data.adapted;
    resetLogSessionButton();
    logSessionRow.hidden = false;
  } catch (err) {
    adaptError.textContent = err.message;
    adaptError.hidden = false;
  } finally {
    adaptBtn.disabled = false;
    adaptStatus.hidden = true;
  }
});

function resetLogSessionButton() {
  logSessionBtn.disabled = false;
  logSessionBtn.textContent = "Log this session";
  logSessionStatus.hidden = true;
}

logSessionBtn.addEventListener("click", async () => {
  const patterns = parseLoggedPatterns(lastAdaptedMarkdown);
  if (patterns.length === 0) {
    logSessionStatus.textContent = "Couldn't find pattern tags in the response — log it manually in the Pattern Tracker tab.";
    logSessionStatus.hidden = false;
    return;
  }
  logSessionBtn.disabled = true;
  try {
    await createSession({
      date: new Date().toISOString().slice(0, 10),
      title: parseSessionTitle(lastAdaptedMarkdown),
      patterns,
    });
  } catch (err) {
    logSessionBtn.disabled = false;
    logSessionStatus.textContent = `Couldn't log session: ${err.message}`;
    logSessionStatus.hidden = false;
    return;
  }
  render();
  logSessionBtn.textContent = "Logged ✓";
  logSessionStatus.textContent = patterns.map(({ pattern, load }) => `${pattern} · ${load}`).join(", ");
  logSessionStatus.hidden = false;
});

// pull the "<Pattern> · <Load>" bullets out of the "## Log this in the Pattern Tracker" section
function parseLoggedPatterns(markdown) {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^##\s*Log this in the Pattern Tracker/i.test(l.trim()));
  if (startIdx === -1) return [];
  const patterns = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break;
    const m = line.match(/^[-*]\s*([A-Za-z]+)\s*[·:\-–—]\s*([A-Za-z]+)/);
    if (!m) continue;
    const pattern = PATTERNS.find((p) => p.toLowerCase() === m[1].toLowerCase());
    const load = LOADS.find((l) => l.toLowerCase() === m[2].toLowerCase());
    if (pattern && load) patterns.push({ pattern, load });
  }
  return patterns;
}

// build a readable title from the block headings, e.g. "Back Squat + Conditioning"
function parseSessionTitle(markdown) {
  if (!markdown) return "Adapted session";
  const names = [];
  const re = /^##\s*Block\s*\d+:\s*(.+?)\s*\(.*?\)\s*$/gim;
  let m;
  while ((m = re.exec(markdown))) {
    names.push(m[1].trim());
  }
  return names.length ? `Adapted: ${names.join(" + ")}` : "Adapted session";
}

// minimal markdown renderer for the known output shape (## headings, - bullets, **bold**)
function renderMarkdown(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const lines = md.split(/\r?\n/);
  let html = "";
  let inList = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`;
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`;
    } else if (line.trim() === "") {
      if (inList) { html += "</ul>"; inList = false; }
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${inline(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

// ---------- tracker: log form ----------

const patternGrid = document.getElementById("pattern-grid");
PATTERNS.forEach((pattern) => {
  const name = document.createElement("div");
  name.className = "pattern-name";
  name.textContent = pattern;
  const options = document.createElement("div");
  options.className = "load-options";
  ["None", ...LOADS].forEach((load) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `load-${pattern}`;
    input.value = load;
    input.checked = load === "None";
    label.append(input, load);
    options.append(label);
  });
  patternGrid.append(name, options);
});

const logForm = document.getElementById("log-form");
const logDate = document.getElementById("log-date");
const logTitle = document.getElementById("log-title");
logDate.value = new Date().toISOString().slice(0, 10);

logForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const patterns = PATTERNS.map((p) => ({
    pattern: p,
    load: logForm.querySelector(`input[name="load-${p}"]:checked`).value,
  })).filter((x) => x.load !== "None");
  if (patterns.length === 0) {
    alert("Tag at least one movement pattern.");
    return;
  }
  try {
    await createSession({ date: logDate.value, title: logTitle.value.trim(), patterns });
  } catch (err) {
    showTrackerError(`Couldn't save session: ${err.message}`);
    return;
  }
  logForm.reset();
  logDate.value = new Date().toISOString().slice(0, 10);
  render();
});

// ---------- tracker: views ----------

let rangeDays = 7;
document.getElementById("range-7").addEventListener("click", () => setRange(7));
document.getElementById("range-28").addEventListener("click", () => setRange(28));

function setRange(days) {
  rangeDays = days;
  document.getElementById("range-7").classList.toggle("active", days === 7);
  document.getElementById("range-28").classList.toggle("active", days === 28);
  render();
}

function sessionsInLastDays(sessions, days) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return sessions.filter((s) => new Date(s.date + "T00:00:00") >= cutoff);
}

async function render() {
  let sessions;
  try {
    sessions = await fetchSessions();
  } catch (err) {
    showTrackerError(`Couldn't load sessions from the server: ${err.message}`);
    return;
  }
  hideTrackerError();
  sessions.sort((a, b) => b.date.localeCompare(a.date));
  renderWarnings(sessions);
  renderChart(sessions);
  renderList(sessions);
}

function renderWarnings(sessions) {
  const container = document.getElementById("heavy-warnings");
  container.innerHTML = "";
  const recent = sessionsInLastDays(sessions, 7);
  const heavyCounts = {};
  for (const s of recent) {
    for (const { pattern, load } of s.patterns) {
      if (load === "Heavy") heavyCounts[pattern] = (heavyCounts[pattern] || 0) + 1;
    }
  }
  for (const [pattern, count] of Object.entries(heavyCounts)) {
    if (count > 2) {
      const div = document.createElement("div");
      div.className = "warning";
      div.textContent = `⚠ ${pattern} trained Heavy ${count}× in the last 7 days — consider backing off.`;
      container.append(div);
    }
  }
}

function renderChart(sessions) {
  const chart = document.getElementById("chart");
  chart.innerHTML = "";
  const recent = sessionsInLastDays(sessions, rangeDays);

  // counts[pattern][load]
  const counts = {};
  PATTERNS.forEach((p) => (counts[p] = { Light: 0, Moderate: 0, Heavy: 0 }));
  for (const s of recent) {
    for (const { pattern, load } of s.patterns) {
      if (counts[pattern]) counts[pattern][load]++;
    }
  }
  const max = Math.max(1, ...PATTERNS.map((p) => LOADS.reduce((sum, l) => sum + counts[p][l], 0)));

  for (const pattern of PATTERNS) {
    const total = LOADS.reduce((sum, l) => sum + counts[pattern][l], 0);
    const row = document.createElement("div");
    row.className = "bar-row";

    const name = document.createElement("div");
    name.textContent = pattern;

    const track = document.createElement("div");
    track.className = "bar-track";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = `${(total / max) * 100}%`;
    for (const load of LOADS) {
      if (counts[pattern][load] === 0) continue;
      const seg = document.createElement("div");
      seg.className = `bar-seg ${load.toLowerCase()}`;
      seg.style.flex = counts[pattern][load];
      seg.title = `${load}: ${counts[pattern][load]}`;
      bar.append(seg);
    }
    track.append(bar);

    const count = document.createElement("div");
    count.className = "bar-count";
    count.textContent = total;

    row.append(name, track, count);
    chart.append(row);
  }

  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.innerHTML = `<span class="light">Light</span><span class="moderate">Moderate</span><span class="heavy">Heavy</span>`;
  chart.append(legend);

  if (recent.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = `No sessions in the last ${rangeDays} days.`;
    chart.prepend(empty);
  }
}

function renderList(sessions) {
  const list = document.getElementById("session-list");
  list.innerHTML = "";
  if (sessions.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No sessions logged yet.";
    list.append(li);
    return;
  }
  for (const s of sessions) {
    const li = document.createElement("li");

    const meta = document.createElement("div");
    meta.className = "session-meta";
    const title = document.createElement("div");
    title.textContent = s.title;
    const date = document.createElement("div");
    date.className = "session-date";
    date.textContent = s.date;
    meta.append(title, date);

    const tags = document.createElement("div");
    tags.className = "session-tags";
    for (const { pattern, load } of s.patterns) {
      const tag = document.createElement("span");
      tag.className = `tag ${load.toLowerCase()}`;
      tag.textContent = `${pattern} · ${load}`;
      tags.append(tag);
    }

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.title = "Delete session";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      del.disabled = true;
      try {
        await deleteSession(s.id);
      } catch (err) {
        showTrackerError(`Couldn't delete session: ${err.message}`);
        del.disabled = false;
        return;
      }
      render();
    });

    li.append(meta, tags, del);
    list.append(li);
  }
}

async function checkAuth() {
  try {
    const res = await fetch("/api/sessions");
    return res.status !== 401;
  } catch {
    return false;
  }
}

(async function init() {
  if (await checkAuth()) {
    hideGate();
    await migrateLegacyLocalStorage();
    render();
  } else {
    showGate();
  }
})();
