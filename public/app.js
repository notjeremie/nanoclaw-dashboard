let snapshot = {};
let history = {};
let rpiNames = {};
let taskNames = {};
let editingRpiId = null;

// ---- SCRIPT PREVIEW MODAL ----
function showModal(title, content) {
  let modal = document.getElementById('preview-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'preview-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title" id="modal-title"></span>
          <button class="modal-close" onclick="closeModal()">&#10005;</button>
        </div>
        <pre class="modal-body" id="modal-body"></pre>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = content;
  modal.style.display = 'flex';
}
function closeModal() {
  const m = document.getElementById('preview-modal');
  if (m) m.style.display = 'none';
}

const previewData = {};
function showPreview(id) {
  if (previewData[id] !== undefined) showModal(id, previewData[id]);
}



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
  item.addEventListener('click', e => { e.preventDefault(); showSection(item.dataset.section); });
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
      fetch('/api/snapshot'), fetch('/api/history'), fetch('/api/alerts'),
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
  if (errors > 0) { badge.textContent = errors; badge.className = 'sidebar-badge error'; badge.style.display = ''; }
  else if (warns > 0) { badge.textContent = warns; badge.className = 'sidebar-badge warn'; badge.style.display = ''; }
  else { badge.style.display = 'none'; }
}

// ---- HELPERS ----
function isPersonalChat(jid) {
  if (!jid) return false;
  if (jid.includes('@g.us')) return false;                   // WA group
  if (jid.startsWith('tg:-')) return false;                  // TG group (negative ID)
  if (jid.startsWith('wa:') && jid.includes('@s.whatsapp.net')) return true;
  if (jid.startsWith('wa:') && jid.includes('@lid')) return true;
  if (jid.startsWith('tg:') && !jid.startsWith('tg:-')) return true;
  return false;
}

function badge(status) {
  const map = { active: 'active', paused: 'paused', error: 'error', online: 'active', offline: 'error', ok: 'active' };
  const labels = { active: 'Actif', paused: 'Pause', error: 'Erreur', online: 'Online', offline: 'Offline', ok: 'OK' };
  return `<span class="badge ${map[status] || 'paused'}">${labels[status] || status}</span>`;
}

function statusDot(status) {
  if (!status) return '<span class="status-dot grey"></span>';
  return `<span class="status-dot ${status === 'ok' ? 'green' : 'red'}" title="${status}"></span>`;
}

function channelBadge(jid) {
  if (!jid) return '';
  if (jid.startsWith('wa:')) return '<span class="badge wa">WA</span>';
  if (jid.startsWith('tg:')) return '<span class="badge tg">TG</span>';
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
  return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
}

function humanCron(expr) {
  if (!expr) return '--';
  const map = {
    '*/5 * * * *': 'Toutes les 5 min', '7 * * * *': 'Toutes les heures',
    '0 3 * * *': '3h (nuit)', '0 8,12,20 * * *': '8h / 12h / 20h',
    '0 7 1 * *': '1er du mois 7h', '15 18 * * *': '18h15 quotidien',
    '0 18 * * *': '18h quotidien', '*/30 * * * *': 'Toutes les 30 min',
    '0 8 * * *': '8h quotidien', '0 9 * * *': '9h quotidien',
    '0 9 * * 6': 'Samedi 9h', '0 9 * * 4': 'Jeudi 9h',
    '0 2 * * *': '2h (nuit)', '0 7 * * 0': 'Dimanche 7h',
    '15 9 * * *': '9h15 quotidien', '0 16 * * *': '16h quotidien',
    '0 13 * * 4': 'Jeudi 13h', '30 4 * * 0': 'Dimanche 4h30',
    '45 4 * * 0': 'Dimanche 4h45',
  };
  return map[expr] || expr;
}

// ---- SMART NAME FROM PROMPT ----
function smartName(task) {
  if (task.name) return task.name;
  const p = (task.prompt || '').trim();
  const dash = p.match(/[—-]\s*([A-Za-zÀ-ÿ].{4,50}?)[\.\n]/);
  if (dash) return dash[1].trim().slice(0, 45);
  const h2 = p.match(/^##\s+(.+)/m);
  if (h2) return h2[1].trim().slice(0, 45);
  const eng = p.match(/^You are (monitoring|generating) (.{5,50}?)[\.\n]/m);
  if (eng) return (eng[1][0].toUpperCase() + eng[1].slice(1) + ' ' + eng[2]).slice(0, 45);
  const exec = p.match(/Exécut\w+ le script (?:de |d')(.{3,40}?)[\.\n`]/i);
  if (exec) return exec[1].trim().slice(0, 45);
  const node = p.match(/node\s+[\w./\-]+\/([\w\-]+)\.(?:mjs|js|cjs)/);
  if (node) return node[1].replace(/-/g, ' ');
  return p.replace(/^Tu es Antoine Sonof\.?\s*/i, '').split('\n')[0].trim().slice(0, 45) || task.id.slice(0, 20);
}

// ---- RUN NOW (RPi) ----
async function runNow(scriptId) {
  const btn = document.querySelector(`[data-run="${scriptId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    await fetch(`/action/run/${scriptId}`, { method: 'POST' });
    if (btn) { btn.textContent = 'Queued'; btn.style.background = '#3fb950'; }
    setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = 'Run'; btn.style.background = ''; } }, 3000);
  } catch { if (btn) { btn.textContent = 'Err'; btn.disabled = false; } }
}

// ---- TASK NAME EDITING ----
let editingTaskId = null;

function startEdit(id, currentName) {
  if (editingTaskId && editingTaskId !== id) cancelEdit();
  editingTaskId = id;
  const cell = document.getElementById('name-' + id);
  if (!cell) return;
  cell.innerHTML = `<input class="name-input" id="ni-${id}" value="${currentName.replace(/"/g, '&quot;')}" maxlength="50">
    <button class="save-btn" onclick="saveEdit('${id}')">OK</button>
    <button class="cancel-btn" onclick="cancelEdit()">x</button>`;
  const inp = document.getElementById('ni-' + id);
  if (inp) {
    inp.focus(); inp.select();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') saveEdit(id); if (e.key === 'Escape') cancelEdit(); });
  }
}

function cancelEdit() { editingTaskId = null; renderTasks(); }

async function saveEdit(id) {
  const inp = document.getElementById('ni-' + id);
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) { cancelEdit(); return; }
  try {
    await fetch('/api/task-name/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const tasks = snapshot.nanoclaw?.tasks || [];
    const task = tasks.find(t => t.id === id);
    if (task) task.name = name;
  } catch (e) { console.error(e); }
  editingTaskId = null;
  renderTasks();
}

// ---- OVERVIEW ----
function renderOverview() {
  const tasks = snapshot.nanoclaw?.tasks || [];
  const active = tasks.filter(t => t.status === 'active').length;
  const paused = tasks.filter(t => t.status !== 'active').length;
  const scripts = snapshot.rpi?.scripts || [];
  const people = snapshot.nanoclaw?.people || [];
  const allGroups = snapshot.nanoclaw?.groups || [];
  const realGroups = allGroups.filter(g => !isPersonalChat(g.jid));
  const disk = snapshot.rpi?.vps?.diskPct || 0;

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setVal('stat-active-tasks', active || '--');
  setVal('stat-paused-tasks', paused || '--');
  setVal('stat-rpi-scripts', scripts.length || '--');
  setVal('stat-people', people.length || '--');
  setVal('stat-groups', realGroups.length || '--');
  setVal('stat-vps-disk', disk ? disk + '%' : '--');
  const icon = document.getElementById('stat-vps-icon');
  if (icon) icon.className = 'stat-icon ' + (disk > 85 ? 'red' : disk > 70 ? 'orange' : 'teal');

  // Prochaines executions — use smartName
  const nrl = document.getElementById('next-runs-list');
  if (nrl) {
    const activeTasks = tasks.filter(t => t.status === 'active').slice(0, 6);
    nrl.innerHTML = activeTasks.length ? activeTasks.map(t => `
      <div class="next-run-item">
        <span>${smartName(t)}</span>
        <span class="next-run-time">${humanCron(t.schedule)}</span>
      </div>
    `).join('') : '<div class="empty">Aucune tache active</div>';
  }

  // System status mini
  const ssm = document.getElementById('system-status-mini');
  if (ssm) {
    const rpiAge = snapshot.rpi?.pushedAt ? Math.round((Date.now() - new Date(snapshot.rpi.pushedAt).getTime()) / 60000) : null;
    const ncAge = snapshot.nanoclaw?.pushedAt ? Math.round((Date.now() - new Date(snapshot.nanoclaw.pushedAt).getTime()) / 60000) : null;
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
    if (search) {
      const name = smartName(t).toLowerCase();
      if (!name.includes(search) && !t.id.toLowerCase().includes(search) && !(t.group||'').toLowerCase().includes(search)) return false;
    }
    return true;
  });

  document.getElementById('tasks-tbody').innerHTML = filtered.length ?
    filtered.map(t => {
      const name = smartName(t);
      const isEditing = editingTaskId === t.id;
      return `<tr>
        <td id="name-${t.id}" class="task-name-cell">
          ${isEditing ? '' : `<span class="task-name-display" title="Cliquer pour renommer">${name}</span>
          <button class="edit-name-btn" onclick="startEdit('${t.id}', '${name.replace(/'/g, "\\'")}')" title="Renommer">✎</button>`}
        </td>
        <td><span class="tag-who">${t.forWho || '--'}</span></td>
        <td title="${t.schedule || ''}">${humanCron(t.schedule)}</td>
        <td>${badge(t.status || 'active')}</td>
        <td><span class="mono" style="font-size:10px;color:var(--muted)">${(t.id || '').slice(0, 22)}</span></td>
        <td>${t.prompt ? (() => { previewData[t.id] = t.prompt; return `<button class="view-btn" onclick="showPreview('${t.id}')">View</button>`; })() : ''}</td>
      </tr>`;
    }).join('') :
    '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Aucune tache</td></tr>';

  // Re-trigger editing state if needed
  if (editingTaskId) {
    const task = filtered.find(t => t.id === editingTaskId);
    if (task) startEdit(editingTaskId, smartName(task));
  }
}

document.getElementById('tasks-search')?.addEventListener('input', renderTasks);
document.getElementById('tasks-filter')?.addEventListener('change', renderTasks);


// ---- RPi NAME EDIT ----
function startEditRpi(id, currentName) {
  editingRpiId = id;
  renderRpi();
  const cell = document.getElementById('rpi-name-' + id);
  if (!cell) return;
  const inp = document.createElement('input');
  inp.className = 'name-input';
  inp.value = currentName;
  inp.onkeydown = e => {
    if (e.key === 'Enter') saveRpiName(id, inp.value);
    if (e.key === 'Escape') { editingRpiId = null; renderRpi(); }
  };
  inp.onblur = () => saveRpiName(id, inp.value);
  cell.innerHTML = '';
  cell.appendChild(inp);
  inp.focus();
  inp.select();
}

async function saveRpiName(id, newName) {
  newName = (newName || '').trim();
  if (!newName) { editingRpiId = null; renderRpi(); return; }
  editingRpiId = null;
  try {
    const res = await fetch('/api/rpi-name/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    const data = await res.json();
    if (data.ok) rpiNames[id] = newName;
  } catch (e) { console.error('saveRpiName error', e); }
  renderRpi();
}

// ---- RPi ----
function renderRpi() {
  const scripts = snapshot.rpi?.scripts || [];
  document.getElementById('rpi-tbody').innerHTML = scripts.length ?
    scripts.map(s => {
      const h = history[s.name] || [];
      const lastRun = s.lastRun || h[0]?.lastRun || null;
      const lastStatus = s.lastStatus || h[0]?.lastStatus || null;
      const lastDur = s.lastDuration || h[0]?.lastDuration || null;
      const rpiDisplayName = rpiNames[s.name] || null;
      const isEditingRpi = editingRpiId === s.name;
      return `<tr>
        <td>
          <div id="rpi-name-${s.name}" class="task-name-cell" style="margin-bottom:3px">
            ${isEditingRpi ? '' : `
              <span class="task-name-display">${rpiDisplayName || s.name}</span>
              <button class="edit-name-btn" onclick="startEditRpi('${s.name}', '${(rpiDisplayName || s.name).replace(/'/g, "\'")}')">&#9998;</button>
            `}
          </div>
          <span class="mono" style="font-size:11px;color:var(--muted)">${s.name}</span>
        </td>
        <td><span class="tag-who">${s.forWho || '--'}</span></td>
        <td><span class="mono" style="font-size:11px">${humanCron(s.cron)}</span></td>
        <td style="color:var(--muted);font-size:12px">${s.desc || '--'}</td>
        <td>${badge(s.status === 'active' ? 'active' : 'paused')}</td>
        <td>${statusDot(lastStatus)}<span class="mono" style="font-size:11px">${lastRun ? fmtDate(lastRun) : '--'}</span>${lastDur ? ' <span style="color:var(--muted);font-size:10px">' + fmtDuration(lastDur) + '</span>' : ''}</td>
        <td style="white-space:nowrap">
          <button class="run-btn" data-run="${s.name}" onclick="runNow('${s.name}')">Run</button>
          ${snapshot.rpi?.scriptSources?.[s.name] ? (() => { previewData[s.name] = snapshot.rpi.scriptSources[s.name]; return `<button class="view-btn" onclick="showPreview('${s.name}')">View</button>`; })() : ''}
        </td>
      </tr>`;
    }).join('') :
    '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Aucun script RPi</td></tr>';
  renderRpiHistory();
}

function renderRpiHistory() {
  const panel = document.getElementById('rpi-history');
  if (!panel) return;
  const keys = Object.keys(history);
  if (!keys.length) { panel.innerHTML = '<div class="empty">Aucun historique disponible</div>'; return; }
  panel.innerHTML = keys.map(name => {
    const runs = history[name] || [];
    return `<div style="margin-bottom:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px">${name}</div>
      ${runs.slice(0, 5).map(r => `<div class="history-row">${statusDot(r.lastStatus)}<span class="mono" style="font-size:11px">${fmtDate(r.lastRun)}</span>${r.lastDuration ? ' <span style="color:var(--muted);font-size:10px">' + fmtDuration(r.lastDuration) + '</span>' : ''}${r.lastError ? ' <span style="color:var(--red);font-size:10px">' + r.lastError.slice(0, 40) + '</span>' : ''}</div>`).join('')}
    </div>`;
  }).join('');
}

// ---- PEOPLE ----
function renderPeople() {
  const people = snapshot.nanoclaw?.people || [];
  const allGroups = snapshot.nanoclaw?.groups || [];
  // Add personal chats from groups that aren't already in people
  const personalChats = allGroups.filter(g => isPersonalChat(g.jid));
  const existingJids = new Set(people.map(p => p.jid));
  const extra = personalChats.filter(g => !existingJids.has(g.jid)).map(g => ({
    name: g.name, jid: g.jid, rights: [], email: '',
  }));
  const allPeople = [...people, ...extra];

  document.getElementById('people-grid').innerHTML = allPeople.length ?
    allPeople.map(p => `
      <div class="person-card">
        <div class="person-avatar">${(p.name || '?')[0].toUpperCase()}</div>
        <div class="person-name">${p.name || '--'}</div>
        <div class="person-jid">${p.jid || '--'}</div>
        <div class="person-tags">
          ${channelBadge(p.jid)}
          ${isPersonalChat(p.jid) ? '<span class="badge paused">DM</span>' : ''}
          ${(p.rights || []).map(r => `<span class="badge paused">${r}</span>`).join('')}
        </div>
        ${p.permissions ? `<div class="person-perms">${p.permissions}</div>` : ''}
        ${p.email ? `<div style="font-size:10px;color:var(--muted);margin-top:4px">${p.email}</div>` : ''}
      </div>
    `).join('') :
    '<div class="empty">Aucune donnee</div>';
}

// ---- GROUPS ----
function renderGroups() {
  const allGroups = snapshot.nanoclaw?.groups || [];
  const groups = allGroups.filter(g => !isPersonalChat(g.jid));
  document.getElementById('groups-tbody').innerHTML = groups.length ?
    groups.map(g => `<tr>
      <td><strong>${g.name || '--'}</strong>${g.isMain ? ' <span class="badge active" style="font-size:9px">MAIN</span>' : ''}</td>
      <td>${channelBadge(g.jid)}</td>
      <td><span class="mono">${g.trigger || '--'}</span></td>
      <td><span class="mono" style="font-size:11px">${g.lastActivity ? fmtDate(g.lastActivity) : '--'}</span></td>
      <td>${badge(g.active ? 'active' : 'paused')}</td>
    </tr>`).join('') :
    '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Aucune donnee</td></tr>';
}

// ---- SYSTEM ----
function renderSystem() {
  const rpi = snapshot.rpi || {};
  const vps = rpi.vps || {};
  const pm2 = rpi.pm2 || [];
  const rpiAt = rpi.pushedAt;
  const ncAt = snapshot.nanoclaw?.pushedAt;
  const rpiAge = rpiAt ? Math.round((Date.now() - new Date(rpiAt).getTime()) / 60000) : null;
  const isStale = rpiAge !== null && rpiAge > 15;

  document.getElementById('vps-detail').innerHTML = [
    ...pm2.map(app => `<div class="sys-row"><span class="sys-label">${app.name}</span>
      <span style="display:flex;align-items:center;gap:8px">${badge(app.status==='online'?'active':'error')}
      <span class="mono" style="font-size:11px">${app.uptime||''}</span>
      <span style="color:var(--muted);font-size:11px">${app.cpu}% CPU ${app.mem}</span></span></div>`),
    `<div class="sys-row"><span class="sys-label">Disk</span><span style="display:flex;align-items:center;gap:8px"><div class="progress-bar"><div class="progress-fill ${vps.diskPct>85?'danger':vps.diskPct>70?'warn':''}" style="width:${vps.diskPct||0}%"></div></div>${vps.diskPct||0}%</span></div>`,
    `<div class="sys-row"><span class="sys-label">Memoire</span><span>${vps.memUsed||'--'} / ${vps.memTotal||'--'}</span></div>`,
  ].join('') || '<div class="empty">VPS en attente</div>';

  document.getElementById('rpi-detail').innerHTML = [
    `<div class="sys-row"><span class="sys-label">Connexion</span>${isStale?badge('error')+' <span style="color:var(--red);font-size:11px">'+rpiAge+' min</span>':badge(rpiAt?'active':'paused')}</div>`,
    `<div class="sys-row"><span class="sys-label">Scripts</span><span>${(rpi.scripts||[]).length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Node.js</span><span class="mono">${rpi.nodeVersion||'--'}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Derniere maj</span><span class="mono" style="font-size:11px">${rpiAt?fmtDate(rpiAt):'--'}</span></div>`,
  ].join('');

  document.getElementById('nanoclaw-detail').innerHTML = [
    `<div class="sys-row"><span class="sys-label">Statut</span>${badge(ncAt?'active':'paused')}</div>`,
    `<div class="sys-row"><span class="sys-label">Taches actives</span><span>${(snapshot.nanoclaw?.tasks||[]).filter(t=>t.status==='active').length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Groupes</span><span>${(snapshot.nanoclaw?.groups||[]).filter(g=>!isPersonalChat(g.jid)).length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Personnes</span><span>${(snapshot.nanoclaw?.people||[]).length}</span></div>`,
    `<div class="sys-row"><span class="sys-label">Derniere maj</span><span class="mono" style="font-size:11px">${ncAt?fmtDate(ncAt):'--'}</span></div>`,
  ].join('');

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
