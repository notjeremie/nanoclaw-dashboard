const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3005;
const PUSH_TOKEN = process.env.PUSH_TOKEN || 'changeme';
const SNAPSHOT_FILE = path.join(__dirname, 'data/snapshot.json');
const HISTORY_FILE = path.join(__dirname, 'data/history.json');
const ACTIONS_FILE = path.join(__dirname, 'data/pending-actions.json');

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'nanoclaw-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true },
}));

// --- Auth middleware ---
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  if (req.path.startsWith('/push/')) return next();
  res.redirect('/login');
}

// --- Push token middleware ---
function requirePushToken(req, res, next) {
  if (req.headers['x-push-token'] === PUSH_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// --- Snapshot helpers ---
function readSnapshot() {
  try { return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8')); }
  catch { return {}; }
}
function writeSnapshot(data) {
  const current = readSnapshot();
  const merged = { ...current, ...data, lastUpdate: new Date().toISOString() };
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(merged, null, 2));
}

// --- History helpers (ring buffer, last 20 runs per script) ---
const MAX_HISTORY = 20;
function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')); }
  catch { return {}; }
}
function updateHistory(scripts) {
  if (!Array.isArray(scripts)) return;
  const history = readHistory();
  for (const s of scripts) {
    if (!s.name || !s.lastRun || !s.lastStatus) continue;
    if (!history[s.name]) history[s.name] = [];
    const last = history[s.name][0];
    // Only add if it's a new run
    if (last && last.lastRun === s.lastRun) continue;
    history[s.name].unshift({
      lastRun: s.lastRun,
      lastStatus: s.lastStatus,
      lastDuration: s.lastDuration || null,
      lastError: s.lastError || null,
    });
    history[s.name] = history[s.name].slice(0, MAX_HISTORY);
  }
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// --- Pending actions helpers ---
function readPendingActions() {
  try { return JSON.parse(fs.readFileSync(ACTIONS_FILE, 'utf-8')); }
  catch { return []; }
}
function addPendingAction(id) {
  const actions = readPendingActions();
  if (!actions.includes(id)) actions.push(id);
  fs.mkdirSync(path.dirname(ACTIONS_FILE), { recursive: true });
  fs.writeFileSync(ACTIONS_FILE, JSON.stringify(actions));
}
function clearPendingActions() {
  fs.mkdirSync(path.dirname(ACTIONS_FILE), { recursive: true });
  fs.writeFileSync(ACTIONS_FILE, JSON.stringify([]));
}

// --- Alerts computation ---
function computeAlerts(snap) {
  const alerts = [];
  const rpiPushedAt = snap.rpi?.pushedAt;
  if (rpiPushedAt) {
    const ageMin = (Date.now() - new Date(rpiPushedAt).getTime()) / 60000;
    if (ageMin > 15) alerts.push({ type: 'rpi_stale', msg: `RPi silent depuis ${Math.round(ageMin)} min`, severity: 'error' });
  } else {
    alerts.push({ type: 'rpi_never', msg: 'RPi jamais connecte', severity: 'warn' });
  }
  const disk = snap.rpi?.vps?.diskPct;
  if (disk > 85) alerts.push({ type: 'disk_high', msg: `Disk VPS a ${disk}%`, severity: 'error' });
  else if (disk > 70) alerts.push({ type: 'disk_warn', msg: `Disk VPS a ${disk}%`, severity: 'warn' });
  return alerts;
}

// --- Login routes ---
app.get('/login', (req, res) => {
  if (req.session?.authenticated) return res.redirect('/');
  res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NanoClaw - Login</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0d1117;color:#e6edf3;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px;width:340px}.logo{font-size:22px;font-weight:700;color:#58a6ff;margin-bottom:8px}.sub{color:#8b949e;font-size:14px;margin-bottom:28px}label{display:block;font-size:13px;color:#8b949e;margin-bottom:6px}input{width:100%;background:#21262d;border:1px solid #30363d;border-radius:8px;padding:10px 14px;color:#e6edf3;font-size:14px;outline:none;margin-bottom:16px}input:focus{border-color:#58a6ff}button{width:100%;background:#238636;border:none;border-radius:8px;padding:11px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px}button:hover{background:#2ea043}.err{color:#f85149;font-size:13px;margin-top:12px;text-align:center}</style></head><body><div class="card"><div class="logo">Antoine Sonof</div><div class="sub">Dashboard - Connexion</div><form method="POST" action="/login"><label>Mot de passe</label><input type="password" name="password" autofocus placeholder="..."><button type="submit">Se connecter</button>${req.query.err ? '<div class="err">Mot de passe incorrect</div>' : ''}</form></div></body></html>`);
});

app.post('/login', async (req, res) => {
  const { password } = req.body;
  const hash = process.env.PASSWORD_HASH;
  const valid = hash ? await bcrypt.compare(password, hash) : password === process.env.DASHBOARD_PASSWORD;
  if (valid) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.redirect('/login?err=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// --- Push endpoints ---
app.post('/push/rpi', requirePushToken, (req, res) => {
  const data = req.body;
  writeSnapshot({ rpi: { ...data, pushedAt: new Date().toISOString() } });
  updateHistory(data.scripts);
  const pendingActions = readPendingActions();
  clearPendingActions();
  res.json({ ok: true, pendingActions });
});

app.post('/push/nanoclaw', requirePushToken, (req, res) => {
  writeSnapshot({ nanoclaw: { ...req.body, pushedAt: new Date().toISOString() } });
  res.json({ ok: true });
});

// --- Action queue (Run now) ---
app.post('/action/run/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  addPendingAction(id);
  res.json({ ok: true, queued: id });
});

// --- API endpoints ---
app.get('/api/snapshot', requireAuth, (req, res) => {
  res.json(readSnapshot());
});

app.get('/api/history', requireAuth, (req, res) => {
  res.json(readHistory());
});

app.get('/api/alerts', requireAuth, (req, res) => {
  const alerts = computeAlerts(readSnapshot());
  res.json({ alerts });
});

// --- Static (protected) ---
app.use(requireAuth, express.static(path.join(__dirname, 'public')));
app.get('*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NanoClaw Dashboard running on port ${PORT}`);
});
