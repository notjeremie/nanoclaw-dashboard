const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3005;
const PUSH_TOKEN = process.env.PUSH_TOKEN || 'changeme';
const DATA_DIR = path.join(__dirname, 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const ACTIONS_FILE = path.join(DATA_DIR, 'pending-actions.json');
const NAMES_FILE = path.join(DATA_DIR, 'task-names.json');
const PENDING_NAMES_FILE = path.join(DATA_DIR, 'pending-names.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
const FileStore = require('session-file-store')(session);
app.use(session({
  store: new FileStore({
    path: path.join(__dirname, 'data/sessions'),
    ttl: 7 * 24 * 60 * 60,
    retries: 0,
    logFn: () => {},
  }),
  secret: process.env.SESSION_SECRET || 'nanoclaw-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true },
}));

// --- Auth ---
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  if (req.path.startsWith('/push/')) return next();
  res.redirect('/login');
}
function requirePushToken(req, res, next) {
  if (req.headers['x-push-token'] === PUSH_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// --- Generic file helpers ---
function readJson(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return def; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Snapshot ---
function readSnapshot() { return readJson(SNAPSHOT_FILE, {}); }
function writeSnapshot(data) {
  const merged = { ...readSnapshot(), ...data, lastUpdate: new Date().toISOString() };
  writeJson(SNAPSHOT_FILE, merged);
}

// --- History (ring buffer 20 runs per script) ---
function updateHistory(scripts) {
  if (!Array.isArray(scripts)) return;
  const history = readJson(HISTORY_FILE, {});
  for (const s of scripts) {
    if (!s.name || !s.lastRun || !s.lastStatus) continue;
    if (!history[s.name]) history[s.name] = [];
    if (history[s.name][0]?.lastRun === s.lastRun) continue;
    history[s.name].unshift({ lastRun: s.lastRun, lastStatus: s.lastStatus, lastDuration: s.lastDuration || null, lastError: s.lastError || null });
    history[s.name] = history[s.name].slice(0, 20);
  }
  writeJson(HISTORY_FILE, history);
}

// --- Pending actions (RPi) ---
function readPendingActions() { return readJson(ACTIONS_FILE, []); }
function addPendingAction(id) {
  const a = readPendingActions();
  if (!a.includes(id)) a.push(id);
  writeJson(ACTIONS_FILE, a);
}
function clearPendingActions() { writeJson(ACTIONS_FILE, []); }

// --- Task names ---
function readNames() { return readJson(NAMES_FILE, {}); }
function readPendingNames() { return readJson(PENDING_NAMES_FILE, {}); }
function clearPendingNames() { writeJson(PENDING_NAMES_FILE, {}); }

// --- Alerts ---
function computeAlerts(snap) {
  const alerts = [];
  const rpiAt = snap.rpi?.pushedAt;
  if (rpiAt) {
    const age = (Date.now() - new Date(rpiAt).getTime()) / 60000;
    if (age > 15) alerts.push({ type: 'rpi_stale', msg: `RPi silent depuis ${Math.round(age)} min`, severity: 'error' });
  } else {
    alerts.push({ type: 'rpi_never', msg: 'RPi jamais connecte', severity: 'warn' });
  }
  const disk = snap.rpi?.vps?.diskPct;
  if (disk > 85) alerts.push({ type: 'disk_high', msg: `Disk VPS a ${disk}%`, severity: 'error' });
  else if (disk > 70) alerts.push({ type: 'disk_warn', msg: `Disk VPS a ${disk}%`, severity: 'warn' });
  return alerts;
}

// --- Login ---
app.get('/login', (req, res) => {
  if (req.session?.authenticated) return res.redirect('/');
  res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NanoClaw - Login</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0d1117;color:#e6edf3;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px;width:340px}.logo{font-size:22px;font-weight:700;color:#58a6ff;margin-bottom:8px}.sub{color:#8b949e;font-size:14px;margin-bottom:28px}label{display:block;font-size:13px;color:#8b949e;margin-bottom:6px}input{width:100%;background:#21262d;border:1px solid #30363d;border-radius:8px;padding:10px 14px;color:#e6edf3;font-size:14px;outline:none;margin-bottom:16px}input:focus{border-color:#58a6ff}button{width:100%;background:#238636;border:none;border-radius:8px;padding:11px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px}button:hover{background:#2ea043}.err{color:#f85149;font-size:13px;margin-top:12px;text-align:center}</style></head><body><div class="card"><div class="logo">Antoine Sonof</div><div class="sub">Dashboard - Connexion</div><form method="POST" action="/login"><label>Mot de passe</label><input type="password" name="password" autofocus placeholder="..."><button type="submit">Se connecter</button>${req.query.err ? '<div class="err">Mot de passe incorrect</div>' : ''}</form></div></body></html>`);
});
app.post('/login', async (req, res) => {
  const { password } = req.body;
  const hash = process.env.PASSWORD_HASH;
  const valid = hash ? await bcrypt.compare(password, hash) : password === process.env.DASHBOARD_PASSWORD;
  if (valid) { req.session.authenticated = true; res.redirect('/'); }
  else res.redirect('/login?err=1');
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// --- Push endpoints ---
app.post('/push/rpi', requirePushToken, (req, res) => {
  writeSnapshot({ rpi: { ...req.body, pushedAt: new Date().toISOString() } });
  updateHistory(req.body.scripts);
  const pendingActions = readPendingActions();
  clearPendingActions();
  res.json({ ok: true, pendingActions });
});

app.post('/push/nanoclaw', requirePushToken, (req, res) => {
  // Merge task names from push into our names file
  const incoming = req.body;
  const currentNames = readNames();
  if (Array.isArray(incoming.tasks)) {
    for (const t of incoming.tasks) {
      if (t.id && t.name && !currentNames[t.id]) {
        currentNames[t.id] = t.name;
      }
    }
    writeJson(NAMES_FILE, currentNames);
  }
  writeSnapshot({ nanoclaw: { ...incoming, pushedAt: new Date().toISOString() } });
  const syncNames = readPendingNames();
  clearPendingNames();
  res.json({ ok: true, syncNames });
});

// --- Action queue (Run now for RPi scripts) ---
app.post('/action/run/:id', requireAuth, (req, res) => {
  addPendingAction(req.params.id);
  res.json({ ok: true, queued: req.params.id });
});

// --- Task names API ---
app.get('/api/task-names', requireAuth, (req, res) => {
  res.json(readNames());
});

app.put('/api/task-name/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  // Update local names file
  const names = readNames();
  names[id] = name.trim();
  writeJson(NAMES_FILE, names);
  // Queue sync back to NanoClaw workspace
  const pending = readPendingNames();
  pending[id] = name.trim();
  writeJson(PENDING_NAMES_FILE, pending);
  res.json({ ok: true, id, name: name.trim() });
});

// --- Other APIs ---
app.get('/api/snapshot', requireAuth, (req, res) => res.json(readSnapshot()));
app.get('/api/history', requireAuth, (req, res) => res.json(readJson(HISTORY_FILE, {})));
app.get('/api/alerts', requireAuth, (req, res) => res.json({ alerts: computeAlerts(readSnapshot()) }));

// --- Static ---
app.use(requireAuth, express.static(path.join(__dirname, 'public')));
app.get('*', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`NanoClaw Dashboard running on port ${PORT}`));
