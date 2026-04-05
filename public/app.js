let snapshot = {};
let history = {};

// ---- ROUTING ----
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('section-' + name);
  const nav = document.querySelector('[data-section="' + name + '"]');
  if (sec) sec.classList.add('active');
  if (nav) nav.classList.add('active');
  renderSection(name);
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    showSection(item.dataset.section);
  });
});

// ---- TABS ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const parent = tab.closest('.tabs-container') || document.body;
    parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const target = document.getElementById(tab.dataset.tab);
    if (target) target.classList.add('active');
  });
});

// ---- FETCH ----
async function fetchSnapshot() {
  try {
    const [snapRes, histRes, alertsRes] = await Promise.all([
      fetch('/api/snapshot'),
      fetch('/api/history'),
      fetch('/api/alerts'),
    ]);
    snapshot = await snapRes.json();
    history = await histRes.json();
    const alertData = await alertsRes.json();
    renderAlertBadge(alertData.alerts || []);
    renderAll();
    const lu = document.getElementById('lastUpdate');
    if (lu && snapshot.lastUpdate) {
      const d = new Date(snapshot.lastUpdate);
      lu.textContent = 'Maj ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
  } catch (e) { console.error('Fetch error', e); }
}

function renderAll() {
  const active = document.querySelector('.section.active');
  const id = active ? active.id.replace('section-', '') : 'overview';
  renderSection(id);
}

function renderSection(name) {
  if (name === 'overview') renderOverview();
  if (name === 'automations') { renderTasks(); renderRpi(); }
  if (name === 'contacts') { renderPeople(); renderGroups(); }
  if (name === 'system') renderSystem();
}

// ---- ALERT BADGE ----
function renderAlertBadge(alerts) {
  const badge = document.getElementById('alert-badge');
  if (!badge) return;
  const errors = alerts.filter(a => a.severity === 'error').length;
  const warns = alerts.filter(a => a.severity === 'warn').length;
  if (errors > 0) {
    badge.textContent = errors;
    badge.className = 'sidebar-badge error';
    badge.style.display = '';
  } else if (warns > 0) {
    badge.textContent = warns;
    badge.className = 'sidebar-badge warn';
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// ---- HELPERS ----
function badge(status) {
  const map = { active: 'active', paused: 'paused', error: 'error', online: 'active', offline: 'error', ok: 'active' };
  const cls = map[status] || 'paused';
  const labels = { active: 'Actif', paused: 'Pause', error: 'Erreur', online: 'Online', offline: 'Offline', ok: 'OK' };
  return `<span class="badge ${cls}">${labels[status] || status}</span>`;
}

function statusDot(status) {
  if (!status) return '<span class="status-dot grey"></span>';
  if (status === 'ok') return '<span class="status-dot green" title="OK"></span>';
  if (status === 'error') return '<span class="status-dot red" title="Erreur"></span>';
  return '<span class="status-dot grey"></span>';
}

function channelBadge(jid) {
  if (!jid) return '';
  if (jid.startsWith('wa:') || jid.includes('whatsapp')) return '<span class="badge wa">WA</span>';
  if (jid.startsWith('tg:') || jid.includes('telegram')) return '<span class="badge tg">TG</span>';
  return '';
}

function fmtDate(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms) {
  if (!ms) return '';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

function humanCron(expr) {
  if (!expr) return '--';
  const map = {
    '*/5 * * * *': 'Toutes les 5 min',
    '7 * * * *': 'Toutes les heures (:07)',
    '0 3 * * *': 'Chaque nuit a 3h',
    '0 8,12,20 * * *': '8h, 12h, 20h',
    '0 7 1 * *': '1er du mois 7h',
    '15 18 * * *': 'Chaque jour 18h15',
    '0 18 * * *': 'Chaque jour 18h',
    '*/30 * * * *': 'Toutes les 30 min',
    '0 8 * * *': 'Chaque jour 8h',
    '0 12 * * *': 'Chaque jour 12h',
    '0 20 * * *': 'Chaque jour 20h',
    '0 9 * * 6': 'Samedi 9h',
    '0 9 * * 4': 'Jeudi 9h',
    '0 2 * * *': 'Chaque nuit 2h',
    '0 7 * * 0': 'Dimanche 7h',
    '15 9 * * *': 'Chaque jour 9h15',
    '0 9 * * *': 'Chaque jour 9h',
    '0 16 * * *': 'Chaque jour 16h',
    '0 10 * * 4': 'Jeudi 10h',
    '30 4 * * 0': 'Dimanche 4h30',
    '45 4 * * 0': 'Dimanche 4h45',
  };
  return map[expr] || expr;
}


// ---- TASK LABEL ----
function taskLabel(t) {
  if (t.desc) return t.desc;   // RPi scripts
  if (t.name) return t.name;   // RPi scripts fallback
  // Extract script name from bash command in prompt
  const m = (t.prompt || '').match(/node [^\s]*\/([a-z][a-z0-9-]*)(?:\.m?js)?/i);
  if (m) return m[1];
  // Fall back to group folder name
  if (t.group) return t.group.replace(/^(telegram|whatsapp|discord)_/, '').replace(/-/g, ' ');
  return t.id ? t.id.slice(0, 20) + '...' : '--';
}

// ---- PRIVATE CHAT DETECTION ----
function isPrivateChat(g) {
  const jid = g.jid || '';
  if (jid.includes('@s.whatsapp.net')) return true;
  if (jid.startsWith('tg:') && !jid.startsWith('tg:-')) return true;
  return false;
}

// ---- RUN NOW ----
async function runNow(scriptId) {
  const btn = document.querySelector(`[data-run="${scriptId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const res = await fetch(`/action/run/${scriptId}`, { method: 'POST' });
    const data = await res.json();
    if (btn) { btn.textContent = 'Queued'; btn.style.background = '#3fb950'; }
    setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = 'Run'; btn.style.background = ''; } }, 3000);
  } catch (e) {
    if (btn) { btn.textContent = 'Err'; btn.disabled = false; }
  }
}

// ---- OVERVIEW ----
function renderOverview() {
  const tasks = snapshot.nanoclaw?.tasks || [];
  const active = tasks.filter(t => t.status === 'active').length;
  const paused = tasks.filter(t => t.status !== 'active').length;
  const scripts = snapshot.rpi?.scripts || [];
  const people = snapshot.nanoclaw?.people || [];
  const groups = snapshot.nanoclaw?.groups || [];
  const disk = snapshot.rpi?.vps?.diskPct || 0;

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setVal('stat-active-tasks', active || '--');
  setVal('stat-paused-tasks', paused || '--');
  setVal('stat-rpi-scripts', scripts.length || '--');
  setVal('stat-people', people.length || '--');
  setVal('stat-groups', groups.length || '--');
  setVal('stat-vps-disk', disk ? disk + '%' : '--');

  const icon = document.getElementById('stat-vps-icon');
  if (icon) icon.className = 'stat-icon ' + (disk > 85 ? 'red' : disk > 70 ? 'orange' : 'teal');

  // Next runs
  const allTasks = [...tasks, ...scripts.map(s => ({ ...s, id: s.name, schedule: s.cron, scheduleType: 'cron' }))];
  const nrl = document.getElementById('next-runs-list');
  if (nrl) {
    const recent = allTasks.slice(0, 6);
    nrl.innerHTML = recent.length ? recent.map(t => `
      <div class="next-run-item">
        <span>${taskLabel(t)}</span>
        <span class="next-run-time">${humanCron(t.schedule || t.cron)}</span>
      </div>
    `).join('') : '<div class="empty">Aucune tache</div>';
  }

  // System status mini
  const ssm = document.getElementById('system-status-mini');
  if (ssm) {
    const rpiAge = snapshot.rpi?.pushedAt
      ? Math.round((Date.now() - new Date(snapshot.rpi.pushedAt).getTime()) / 60000)
      : null;
    const ncAge = snapshot.nanoclaw?.pushedAt
      ? Math.round((Date.now() - new Date(snapshot.nanoclaw.pushedAt).getTime()) / 60000)
      : null;
    ssm.innerHTML = [
      `<div class="sys-row"><span class="sys-label">RPi</span><span>${rpiAge !== null ? badge(rpiAge < 15 ? 'active' : 'error') + ' ' + rpiAge + ' min' : badge('paused')}</span></div>`,
      `<div class="sys-row"><span class="sys-label">NanoClaw</span><span>${ncAge !== null ? badge('active') + ' ' + ncAge + ' min' : badge('paused')}</span></div>`,
      `<div class="sys-row"><span class="sys-label">Disk VPS</span><span><div class="progress-bar" style="display:inline-block;width:80px;vertical-align:middle"><div class="progress-fill ${disk>85?'danger':disk>70?'warn':''}" style="width:${disk}%"></div></div> ${disk}%</span></div>`,
    ].join('');
  }
}

// ---- TASKS (NanoClaw) ----
function renderTasks() {
  const tasks = snapshot.nanoclaw?.tasks || [];
  const search = (document.getElementById('tasks-search')?.value || '').toLowerCase();
  const filter = document.getElementById('tasks-filter')?.value || '';

  const filtered = tasks.filter(t => {
    if (filter && t.status !== filter) return false;
    if (search && !t.id?.toLowerCase().includes(search) && !t.group?.toLowerCase().includes(search)) return false;
    return true;
  });

  document.getElementById('tasks-tbody').innerHTML = filtered.length ?
    filtered.map(t => `
      <tr>
        <td><span class="mono">${t.group || '--'}</span></td>
        <td title="${t.schedule || ''}">${humanCron(t.schedule)}</td>
        <td>${badge(t.status || 'active')}</td>
        <td class="mono" style="font-size:11px">${t.nextRun ? fmtDate(t.nextRun) : '--'}</td>
        <td><span class="mono" style="font-size:10px;color:var(--muted)">${(t.id || '').slice(0, 28)}</span></td>
      </tr>
    `).join('') :
    '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Aucune tache</td></tr>';
}

document.getElementById('tasks-search')?.addEventListener('input', renderTasks);
document.getElementById('tasks-filter')?.addEventListener('change', renderTasks);

// ---- RPi ----
function renderRpi() {
  const scripts = snapshot.rpi?.scripts || [];
  document.getElementById('rpi-tbody').innerHTML = scripts.length ?
    scripts.map(s => {
      const h = history[s.name] || [];
      const lastRun = s.lastRun || (h[0]?.lastRun) || null;
      const lastStatus = s.lastStatus || (h[0]?.lastStatus) || null;
      const lastDur = s.lastDuration || (h[0]?.lastDuration) || null;
      return `<tr>
        <td><strong>${s.name}</strong></td>
        <td><span class="mono" style="font-size:11px">${humanCron(s.cron)}</span></td>
        <td style="color:var(--muted);font-size:12px">${s.desc || '--'}</td>
        <td>
          ${statusDot(lastStatus)}
          <span class="mono" style="font-size:11px">${lastRun ? fmtDate(lastRun) : '--'}</span>
          ${lastDur ? '<span style="color:var(--muted);font-size:10px"> ' + fmtDuration(lastDur) + '</span>' : ''}
        </td>
        <td>
          <button class="run-btn" data-run="${s.name}" onclick="runNow('${s.name}')">Run</button>
        </td>
      </tr>`;
    }).join('') :
    '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Aucun script RPi</td></tr>';

  // History panel
  renderRpiHistory();
}

function renderRpiHistory() {
  const panel = document.getElementById('rpi-history');
  if (!panel) return;
  const keys = Object.keys(history);
  if (!keys.length) {
    panel.innerHTML = '<div class="empty">Aucun historique disponible</div>';
    return;
  }
  panel.innerHTML = keys.map(name => {
    const runs = history[name] || [];
    return `<div style="margin-bottom:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px">${name}</div>
      ${runs.slice(0, 5).map(r => `
        <div class="history-row">
          ${statusDot(r.lastStatus)}
          <span class="mono" style="font-size:11px">${fmtDate(r.lastRun)}</span>
          ${r.lastDuration ? '<span style="color:var(--muted);font-size:10px"> ' + fmtDuration(r.lastDuration) + '</span>' : ''}
          ${r.lastError ? '<span style="color:var(--red);font-size:10px"> ' + r.lastError.slice(0, 40) + '</span>' : ''}
        </div>
      `).join('')}
    </div>`;
  }).join('');
}

// ---- PEOPLE ----
function renderPeople() {
  const people = snapshot.nanoclaw?.people || [];
  const groups = snapshot.nanoclaw?.groups || [];
  // Add 1-on-1 conversations as people entries (deduplicate by jid)
  const knownJids = new Set(people.map(p => p.jid));
  const dmCards = groups
    .filter(g => isPrivateChat(g) && !knownJids.has(g.jid))
    .map(g => ({
      name: g.name.replace(/ \(WhatsApp\)| \(Telegram\)/, ''),
      jid: g.jid,
      rights: g.isMain ? ['admin'] : [],
      isDm: true,
    }));
  const all = [...people, ...dmCards];
  document.getElementById('people-grid').innerHTML = all.length ?
    all.map(p => `
      <div class="person-card">
        <div class="person-avatar">${(p.name || '?')[0].toUpperCase()}</div>
        <div class="person-name">${p.name || '--'}</div>
        <div class="person-jid">${p.jid || '--'}</div>
        <div class="person-tags">
          ${channelBadge(p.jid)}
          ${(p.rights || []).map(r => `<span class="badge paused">${r}</span>`).join('')}
          ${p.isDm ? '<span class="badge paused" style="font-size:9px">DM</span>' : ''}
        </div>
      </div>
    `).join('') :
    '<div class="empty">Aucune donnee</div>';
}

// ---- GROUPS ----
function renderGroups() {
  const groups = (snapshot.nanoclaw?.groups || []).filter(g => !isPrivateChat(g));
  document.getElementById('groups-tbody').innerHTML = groups.length ?
    groups.map(g => `
      <tr>
        <td><strong>${g.name || '--'}</strong>${g.isMain ? ' <span class="badge active" style="font-size:9px">MAIN</span>' : ''}</td>
        <td>${channelBadge(g.jid)}</td>
        <td><span class="mono">${g.trigger || '--'}</span></td>
        <td><span class="mono" style="font-size:11px">${g.lastActivity ? fmtDate(g.lastActivity) : '--'}</span></td>
        <td>${badge(g.active ? 'active' : 'paused')}</td>
      </tr>
    `).join('') :
    '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Aucune donnee</td></tr>';
}

// ---- SYSTEM ----
function renderSystem() {
  const rpi = snapshot.rpi || {};
  const pm2 = rpi.pm2 || [];
  const vps = rpi.vps || {};
  const rpiPushedAt = rpi.pushedAt;
  const ncPushedAt = snapshot.nanoclaw?.pushedAt;
  const rpiAge = rpiPushedAt ? Math.round((Date.now() - new Date(rpiPushedAt).getTime()) / 60000) : null;
  const isStale = rpiAge !== null && rpiAge > 15;

  document.getElementById('vps-detail').innerHTML = [
    ...pm2.map(app => `
      <div class="sys-row">
        <span class="sys-label">${app.name}</span>
        <span style="display:flex;align-items:center;gap:8px">
          ${badge(app.status === 'online' ? 'active' : 'error')}
          <span class="mono" style="font-size:11px">${app.uptime || ''}</span>
          <span style="color:var(--muted);font-size:11px">${app.cpu}% CPU</span>
          <span style="color:var(--muted);font-size:11px">${app.mem}</span>
        </span>
      </div>
    `),
    `<div class="sys-row"><span class="sys-label">Disk</span>
      <span style="display:flex;align-items:center;gap:8px">
        <div class="progress-bar"><div class="progress-fill ${vps.diskPct>85?'danger':vps.diskPct>70?'warn':''}" style="width:${vps.diskPct||0}%"></div></div>
        <span>${vps.diskPct || 0}%</span>
      </span>
    </div>`,
    `<div class="sys-row"><span class="sys-label">Memoire</span><span>${vps.memUsed || '--'} / ${vps.memTotal || '--'}</span></div>`,
  ].join('') || '<div class="empty">VPS en attente</div>';

  document.getElementById('rpi-detail').innerHTML = [
    `<div class="sys-row"><span class="sys-label">Connexion</span>${isStale ? badge('error') + ' <span style="font-size:11px;color:var(--red)">' + rpiAge + ' min</span>' : badge(rpiPushedAt ? 'active' : 'paused')}</div>`,
    `<div class="sys-row"><span class="sys-label">Scripts</span><span>${(rpi.scripts || []).length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Node.js</span><span class="mono">${rpi.nodeVersion || '--'}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Derniere maj</span><span class="mono" style="font-size:11px">${rpiPushedAt ? fmtDate(rpiPushedAt) : '--'}</span></div>`,
  ].join('');

  document.getElementById('nanoclaw-detail').innerHTML = [
    `<div class="sys-row"><span class="sys-label">Statut</span>${badge(ncPushedAt ? 'active' : 'paused')}</div>`,
    `<div class="sys-row"><span class="sys-label">Taches actives</span><span>${(snapshot.nanoclaw?.tasks || []).filter(t => t.status === 'active').length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Groupes</span><span>${(snapshot.nanoclaw?.groups || []).length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Personnes</span><span>${(snapshot.nanoclaw?.people || []).length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Derniere maj</span><span class="mono" style="font-size:11px">${ncPushedAt ? fmtDate(ncPushedAt) : '--'}</span></div>`,
  ].join('');

  // Logs viewer
  const logsEl = document.getElementById('logs-content');
  if (logsEl) {
    const logs = (rpi.recentLogs || []).slice().reverse();
    logsEl.textContent = logs.length ? logs.join('\n') : 'Aucun log disponible';
    if (logs.length) logsEl.scrollTop = logsEl.scrollHeight;
  }
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  fetchSnapshot();
  setInterval(fetchSnapshot, 5 * 60 * 1000);
});
