let snapshot = {};

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
    const parent = tab.closest('.section') || document.body;
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
    const res = await fetch('/api/snapshot');
    snapshot = await res.json();
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

// ---- HELPERS ----
function badge(status) {
  const map = { active: ['active', '● Actif'], paused: ['paused', '⏸ Pause'], error: ['error', '✕ Erreur'] };
  const [cls, lbl] = map[status] || ['paused', status];
  return `<span class="badge ${cls}">${lbl}</span>`;
}
function channelBadge(jid) {
  if (!jid) return '';
  if (jid.startsWith('tg:')) return '<span class="badge tg">Telegram</span>';
  if (jid.startsWith('wa:')) return '<span class="badge wa">WhatsApp</span>';
  return `<span class="badge">${jid.split(':')[0]}</span>`;
}
function humanCron(expr) {
  if (!expr) return '—';
  const map = {
    '0 2 * * *': 'Chaque nuit 2h', '0 3 * * *': 'Chaque nuit 3h',
    '0 8 * * *': 'Chaque matin 8h', '0 9 * * *': 'Chaque matin 9h',
    '15 9 * * *': 'Chaque jour 9h15', '0 12 * * *': 'Chaque jour 12h',
    '0 16 * * *': 'Chaque jour 16h', '0 18 * * *': 'Chaque soir 18h',
    '15 18 * * *': 'Chaque soir 18h15', '0 20 * * *': 'Chaque soir 20h',
    '0 7 * * 0': 'Dimanche 7h', '30 4 * * 0': 'Dimanche 4h30',
    '45 4 * * 0': 'Dimanche 4h45', '0 9 * * 4': 'Jeudi 9h',
    '0 9 * * 6': 'Samedi 9h', '0 10 * * 4': 'Jeudi 10h',
    '0 13 * * 4': 'Jeudi 13h', '0 8,12,20 * * *': '8h / 12h / 20h',
    '0 7 1 * *': '1er du mois 7h', '7 * * * *': 'Toutes les heures',
    '*/5 * * * *': 'Toutes les 5 min',
  };
  return map[expr] || expr;
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ---- OVERVIEW ----
function renderOverview() {
  const nc = snapshot.nanoclaw || {};
  const tasks = nc.tasks || [];
  const active = tasks.filter(t => t.status === 'active').length;
  const paused = tasks.filter(t => t.status === 'paused').length;
  const rpiScripts = (snapshot.rpi?.scripts || []).length;
  const people = (nc.people || []).length;
  const groups = (nc.groups || []).length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-active-tasks', active);
  set('stat-paused-tasks', paused);
  set('stat-rpi-scripts', rpiScripts);
  set('stat-people', people);
  set('stat-groups', groups);

  const vps = snapshot.rpi?.vps || {};
  const diskPct = vps.diskPct || 0;
  set('stat-vps-disk', diskPct ? diskPct + '%' : '—');
  const vpsIcon = document.getElementById('stat-vps-icon');
  if (vpsIcon) {
    vpsIcon.className = 'stat-icon ' + (diskPct > 85 ? 'red' : diskPct > 70 ? 'orange' : 'green');
  }

  // Next runs
  const nextRuns = tasks
    .filter(t => t.status === 'active' && t.nextRun)
    .sort((a, b) => new Date(a.nextRun) - new Date(b.nextRun))
    .slice(0, 6);
  const nrEl = document.getElementById('next-runs-list');
  if (nrEl) {
    nrEl.innerHTML = nextRuns.length ? nextRuns.map(t =>
      `<div class="next-run-item"><span>${t.group || t.id?.slice(0,20) || '?'}</span><span class="next-run-time">${fmtDate(t.nextRun)}</span></div>`
    ).join('') : '<div class="empty">Aucune donnee</div>';
  }

  // System status mini
  const ssEl = document.getElementById('system-status-mini');
  if (ssEl) {
    const rpiOk = !!snapshot.rpi?.pushedAt;
    const ncOk = !!snapshot.nanoclaw?.pushedAt;
    const vpsOk = (snapshot.rpi?.pm2 || []).length > 0;
    ssEl.innerHTML = [
      `<div class="sys-row"><span class="sys-label">NanoClaw</span>${badge(ncOk ? 'active' : 'error')}</div>`,
      `<div class="sys-row"><span class="sys-label">Raspberry Pi</span>${badge(rpiOk ? 'active' : 'error')}</div>`,
      `<div class="sys-row"><span class="sys-label">VPS PM2</span>${badge(vpsOk ? 'active' : 'paused')}</div>`,
    ].join('');
  }
}

// ---- TASKS ----
function renderTasks() {
  const tasks = (snapshot.nanoclaw?.tasks || []);
  const search = (document.getElementById('tasks-search')?.value || '').toLowerCase();
  const filter = document.getElementById('tasks-filter')?.value || '';

  let filtered = tasks.filter(t => {
    const txt = ((t.group || '') + (t.id || '') + (t.schedule || '')).toLowerCase();
    return (!search || txt.includes(search)) && (!filter || t.status === filter);
  });

  document.getElementById('tasks-tbody').innerHTML = filtered.length ?
    filtered.map(t => `
      <tr>
        <td><span class="mono">${t.group || '—'}</span></td>
        <td>${humanCron(t.schedule)}</td>
        <td>${badge(t.status)}</td>
        <td><span class="mono">${fmtDate(t.nextRun)}</span></td>
        <td><span class="mono" style="font-size:10px">${(t.id||'').slice(0,24)}…</span></td>
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
    scripts.map(s => `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td><span class="mono">${humanCron(s.cron)}</span></td>
        <td style="color:var(--muted)">${s.desc || '—'}</td>
        <td><span class="badge rpi">RPi</span></td>
      </tr>
    `).join('') :
    '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">Aucun script RPi — donnees en attente</td></tr>';
}

// ---- PEOPLE ----
function renderPeople() {
  const people = snapshot.nanoclaw?.people || [];
  document.getElementById('people-grid').innerHTML = people.length ?
    people.map(p => `
      <div class="person-card">
        <div class="person-avatar">${(p.name || '?')[0].toUpperCase()}</div>
        <div class="person-name">${p.name || '—'}</div>
        <div class="person-jid">${p.jid || '—'}</div>
        <div class="person-tags">
          ${channelBadge(p.jid)}
          ${(p.rights || []).map(r => `<span class="badge paused">${r}</span>`).join('')}
        </div>
      </div>
    `).join('') :
    '<div class="empty">Aucune donnee</div>';
}

// ---- GROUPS ----
function renderGroups() {
  const groups = snapshot.nanoclaw?.groups || [];
  document.getElementById('groups-tbody').innerHTML = groups.length ?
    groups.map(g => `
      <tr>
        <td><strong>${g.name || '—'}</strong></td>
        <td>${channelBadge(g.jid)}</td>
        <td><span class="mono">${g.trigger || '—'}</span></td>
        <td><span class="mono">${g.lastActivity ? fmtDate(g.lastActivity) : '—'}</span></td>
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

  document.getElementById('vps-detail').innerHTML = [
    ...pm2.map(app => `
      <div class="sys-row">
        <span class="sys-label">${app.name}</span>
        <span>${badge(app.status === 'online' ? 'active' : 'error')} <span class="mono">${app.uptime || ''}</span></span>
      </div>
    `),
    `<div class="sys-row"><span class="sys-label">Disk</span>
      <span style="display:flex;align-items:center;gap:8px">
        <div class="progress-bar"><div class="progress-fill ${vps.diskPct>85?'danger':vps.diskPct>70?'warn':''}" style="width:${vps.diskPct||0}%"></div></div>
        <span>${vps.diskPct || 0}%</span>
      </span>
    </div>`,
    `<div class="sys-row"><span class="sys-label">Memoire</span><span>${vps.memUsed || '—'} / ${vps.memTotal || '—'}</span></div>`,
  ].join('') || '<div class="empty">Donnees VPS en attente</div>';

  const ncPushedAt = snapshot.nanoclaw?.pushedAt;
  const rpiPushedAt = snapshot.rpi?.pushedAt;

  document.getElementById('rpi-detail').innerHTML = [
    `<div class="sys-row"><span class="sys-label">Connexion</span>${badge(rpiPushedAt ? 'active' : 'error')}</div>`,
    `<div class="sys-row"><span class="sys-label">Scripts</span><span>${(rpi.scripts || []).length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Derniere maj</span><span class="mono">${rpiPushedAt ? fmtDate(rpiPushedAt) : '—'}</span></div>`,
  ].join('');

  document.getElementById('nanoclaw-detail').innerHTML = [
    `<div class="sys-row"><span class="sys-label">Statut</span>${badge(ncPushedAt ? 'active' : 'paused')}</div>`,
    `<div class="sys-row"><span class="sys-label">Taches actives</span><span>${(snapshot.nanoclaw?.tasks || []).filter(t => t.status === 'active').length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Groupes</span><span>${(snapshot.nanoclaw?.groups || []).length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Derniere maj</span><span class="mono">${ncPushedAt ? fmtDate(ncPushedAt) : '—'}</span></div>`,
  ].join('');
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  fetchSnapshot();
  setInterval(fetchSnapshot, 5 * 60 * 1000); // refresh every 5 min
});
