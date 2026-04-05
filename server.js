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

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'nanoclaw-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
}));

// --- Auth middleware ---
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  if (req.path.startsWith('/push/')) return next(); // push endpoints use token
  res.redirect('/login');
}

// --- Push token middleware ---
function requirePushToken(req, res, next) {
  if (req.headers['x-push-token'] === PUSH_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// --- Read/write snapshot ---
function readSnapshot() {
  try { return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8')); }
  catch { return {}; }
}
function writeSnapshot(data) {
  const current = readSnapshot();
  const merged = { ...current, ...data, lastUpdate: new Date().toISOString() };
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(merged, null, 2));
}

// --- Login routes ---
app.get('/login', (req, res) => {
  if (req.session?.authenticated) return res.redirect('/');
  res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NanoClaw — Login</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0d1117;color:#e6edf3;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px;width:340px}.logo{font-size:22px;font-weight:700;color:#58a6ff;margin-bottom:8px}.sub{color:#8b949e;font-size:14px;margin-bottom:28px}label{display:block;font-size:13px;color:#8b949e;margin-bottom:6px}input{width:100%;background:#21262d;border:1px solid #30363d;border-radius:8px;padding:10px 14px;color:#e6edf3;font-size:14px;outline:none;margin-bottom:16px}input:focus{border-color:#58a6ff}button{width:100%;background:#238636;border:none;border-radius:8px;padding:11px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px}button:hover{background:#2ea043}.err{color:#f85149;font-size:13px;margin-top:12px;text-align:center}</style></head><body><div class="card"><div class="logo">Antoine Sonof</div><div class="sub">Dashboard — Connexion</div><form method="POST" action="/login"><label>Mot de passe</label><input type="password" name="password" autofocus placeholder="••••••••"><button type="submit">Se connecter</button>${req.query.err ? '<div class="err">Mot de passe incorrect</div>' : ''}</form></div></body></html>`);
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

// --- Push endpoints (no session needed, token auth) ---
app.post('/push/rpi', requirePushToken, (req, res) => {
  writeSnapshot({ rpi: { ...req.body, pushedAt: new Date().toISOString() } });
  res.json({ ok: true });
});

app.post('/push/nanoclaw', requirePushToken, (req, res) => {
  writeSnapshot({ nanoclaw: { ...req.body, pushedAt: new Date().toISOString() } });
  res.json({ ok: true });
});

// --- API ---
app.get('/api/snapshot', requireAuth, (req, res) => {
  res.json(readSnapshot());
});

// --- Static files (protected) ---
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// --- SPA fallback ---
app.get('*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NanoClaw Dashboard running on port ${PORT}`);
});
