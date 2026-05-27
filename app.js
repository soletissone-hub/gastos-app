// ── State ──────────────────────────────────────────────────────────────────
let localExpenses = [];
let remotePending = [];
let remoteLoading = false;
let currentTab = 'add';
let selectedCategory = null;
let histMonth = new Date().toISOString().slice(0, 7);
let swReg = null;

// Per-card classification state: { [cardId]: { cat, hogar } }
const cardState = {};

// ── Local Storage ──────────────────────────────────────────────────────────
function saveLocal() { localStorage.setItem('gastos_local', JSON.stringify(localExpenses)); }
function loadLocal() {
  try { localExpenses = JSON.parse(localStorage.getItem('gastos_local') || '[]'); } catch { localExpenses = []; }
}

// ── Utilities ─────────────────────────────────────────────────────────────
function formatCurrency(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}
function uid() { return 'LOCAL_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = '', 2800);
}

// ── SW + Notifications ────────────────────────────────────────────────────
async function initSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('/sw.js');
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'OPEN_TAB') switchTab(e.data.tab);
    });
  } catch {}
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

function scheduleClassifyReminder(exp) {
  if (swReg && Notification.permission === 'granted') {
    swReg.active?.postMessage({
      type: 'SCHEDULE_NOTIFICATION',
      delay: 20 * 60 * 1000,
      title: '💸 Gasto sin clasificar',
      body: `${formatCurrency(exp.amount)} — ${exp.description || 'Sin descripción'}`,
      data: { action: 'pending' }
    });
  }
}

// ── Remote Sync ────────────────────────────────────────────────────────────
async function loadRemotePending() {
  if (remoteLoading) return;
  remoteLoading = true;
  const statusEl = document.getElementById('pending-status');
  if (statusEl) statusEl.textContent = '⟳ Actualizando desde la hoja...';

  try {
    remotePending = await apiFetchPendientes();
    updateNavBadge();
    renderPendingTab();
  } catch (err) {
    const errEl = document.getElementById('remote-error');
    if (errEl) { errEl.textContent = '⚠️ Sin conexión a la hoja.'; errEl.style.display = 'block'; }
    const statusEl2 = document.getElementById('pending-status');
    if (statusEl2) statusEl2.textContent = '';
  } finally {
    remoteLoading = false;
  }
}

// ── Add Tab ────────────────────────────────────────────────────────────────
function renderAddTab() {
  const el = document.getElementById('tab-add');
  el.innerHTML = `
    <div class="header">
      <div>
        <h1>Nuevo gasto</h1>
        <div class="subtitle" id="resumen-header">Cargando...</div>
      </div>
    </div>
    <div id="notif-banner" style="display:none">
      <p>🔔 Activá notificaciones para recordatorios de clasificación</p>
      <button onclick="enableNotifications()">Activar</button>
    </div>
    <div class="amount-wrap">
      <span class="currency">$</span>
      <input id="input-amount" type="number" inputmode="decimal" placeholder="0.00" autofocus>
    </div>
    <input id="input-prov" class="input-field" type="text"
      placeholder="Proveedor / Rubro (ej: McDonald's, SMDT Super...)" autocomplete="off">
    <input id="input-persona" class="input-field" type="text"
      placeholder="Persona (Tomi / Sole — opcional)">
    <div id="suggestion-slot"></div>
    <div class="section-label">Categoría</div>
    <div class="categories-grid" id="cat-grid"></div>
    <div class="section-label">Hogar</div>
    <div class="hogar-row" id="hogar-row-add"></div>
    <button class="btn-primary" id="btn-save" disabled>Guardar en la hoja</button>
  `;

  renderCatGrid('cat-grid', selectedCategory, key => { selectedCategory = key; renderCatGrid('cat-grid', selectedCategory, null); updateSaveBtn(); });
  renderHogarRow('hogar-row-add', null, key => {
    document.querySelectorAll('#hogar-row-add .hogar-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector(`#hogar-row-add [data-hogar="${key}"]`)?.classList.add('selected');
  });

  document.getElementById('input-prov').addEventListener('input', onProvInput);
  document.getElementById('input-amount').addEventListener('input', updateSaveBtn);
  document.getElementById('btn-save').addEventListener('click', saveExpense);
  initNotifications();
  setTimeout(() => document.getElementById('input-amount')?.focus(), 100);

  apiGetResumen()
    .then(d => {
      const el = document.getElementById('resumen-header');
      if (el && d) el.textContent = `Este mes: ${formatCurrency(d.totalMes)} · ${d.pendientes} para clasificar`;
    })
    .catch(() => {
      const el = document.getElementById('resumen-header');
      if (el) el.textContent = 'Sin conexión a la hoja';
    });
}

function renderCatGrid(containerId, selectedKey, onSelect) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = getAllCategories().map(c => `
    <div class="cat-chip${selectedKey === c.key ? ' selected' : ''}"
         data-key="${c.key}"
         onclick="(${onSelect ? onSelect.toString() : `function(k){}`})('${c.key}')"
         style="${selectedKey === c.key ? `border-color:${c.color};background:${c.color}22` : ''}">
      <div class="ci">${c.icon}</div>
      <div class="cl">${c.label}</div>
    </div>
  `).join('');
}

function renderHogarRow(containerId, selectedKey, onSelect) {
  const row = document.getElementById(containerId);
  if (!row) return;
  row.innerHTML = getAllHogares().map(h => `
    <button class="hogar-btn${selectedKey === h.key ? ' selected' : ''}"
            data-hogar="${h.key}"
            onclick="this.closest('.hogar-row').querySelectorAll('.hogar-btn').forEach(b=>b.classList.remove('selected')); this.classList.add('selected');"
            style="background:${h.color};border:1px solid ${h.border}">
      ${h.label}
    </button>
  `).join('');
}

function onProvInput(e) {
  const val = e.target.value.trim();
  const slot = document.getElementById('suggestion-slot');
  if (!val) { slot.innerHTML = ''; return; }
  const catKey = classify(val);
  const cat = getCategoryInfo(catKey);
  slot.innerHTML = `
    <div class="suggestion-bar" onclick="applyAddCat('${catKey}')">
      <span class="cat-icon">${cat.icon}</span>
      <div class="cat-text">
        <div class="cat-name">${cat.label}</div>
        <div class="cat-hint">Sugerencia — toca para confirmar</div>
      </div>
      <span class="check">✓</span>
    </div>
  `;
  applyAddCat(catKey);
}

function applyAddCat(key) {
  selectedCategory = key;
  const grid = document.getElementById('cat-grid');
  if (!grid) return;
  grid.querySelectorAll('.cat-chip').forEach(el => {
    const isSelected = el.dataset.key === key;
    el.classList.toggle('selected', isSelected);
    const cat = getCategoryInfo(key);
    if (isSelected) { el.style.borderColor = cat.color; el.style.background = cat.color + '22'; }
    else { el.style.borderColor = ''; el.style.background = ''; }
  });
  updateSaveBtn();
}

function updateSaveBtn() {
  const amt = parseFloat(document.getElementById('input-amount')?.value);
  const btn = document.getElementById('btn-save');
  if (btn) btn.disabled = !(amt > 0);
}

async function saveExpense() {
  const amt = parseFloat(document.getElementById('input-amount')?.value);
  const prov = document.getElementById('input-prov')?.value.trim();
  const persona = document.getElementById('input-persona')?.value.trim();
  const hogarEl = document.querySelector('#hogar-row-add .hogar-btn.selected');
  const hogar = hogarEl?.dataset.hogar || '';

  if (!amt || amt <= 0) { showToast('Ingresá un monto'); return; }

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const cat = selectedCategory ? getCategoryInfo(selectedCategory) : null;
  const fechaISO = new Date().toISOString().slice(0, 10);

  if (selectedCategory && hogar) {
    try {
      await apiAddExpense({
        fecha: fechaISO,
        monto: amt,
        categoria: cat.label,
        proveedor: prov || '',
        detalle: prov || 'Gasto manual',
        hogar,
        persona: persona || ''
      });
      showToast(`${cat.icon} ${formatCurrency(amt)} guardado como ${cat.label} · ${hogar}`);
      resetAddForm();
      return;
    } catch {
      showToast('Sin conexión — guardado localmente');
    }
  } else if (!selectedCategory || !hogar) {
    const missing = [];
    if (!selectedCategory) missing.push('categoría');
    if (!hogar) missing.push('hogar');
    showToast(`💾 Guardado local — falta: ${missing.join(', ')}`);
    scheduleClassifyReminder({ amount: amt, description: prov });
  }

  // Fallback / incomplete → save locally
  localExpenses.unshift({
    id: uid(), amount: amt, description: prov, persona, hogar,
    category: selectedCategory, date: new Date().toISOString(), synced: false
  });
  saveLocal();
  updateNavBadge();
  resetAddForm();
}

function resetAddForm() {
  ['input-amount', 'input-prov', 'input-persona'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('suggestion-slot').innerHTML = '';
  selectedCategory = null;
  renderAddTab();
}

// ── Pending Tab ─────────────────────────────────────────────────────────────
function renderPendingTab() {
  const el = document.getElementById('tab-pending');
  const localUnclassified = localExpenses.filter(e => !e.category || !e.hogar);
  const total = localUnclassified.length + remotePending.length;

  const headerHTML = `
    <div style="padding:16px 20px 8px;display:flex;justify-content:space-between;align-items:center">
      <span class="section-label">${total > 0 ? total + ' pendiente' + (total !== 1 ? 's' : '') : 'Pendientes'}</span>
      <button onclick="loadRemotePending()" style="background:var(--bg2);border:1px solid var(--bg3);border-radius:8px;color:var(--text2);padding:5px 12px;cursor:pointer;font-size:12px">↻ Actualizar</button>
    </div>
    <div id="pending-status" style="text-align:center;font-size:12px;color:var(--text2);padding:2px 20px 8px;min-height:16px">${remoteLoading ? '⟳ Cargando de la hoja...' : ''}</div>
    <div id="remote-error" style="display:none;margin:0 20px 12px;background:#450a0a;border-radius:var(--radius);padding:10px 14px;font-size:12px;color:#fca5a5"></div>
  `;

  if (!total && !remoteLoading) {
    el.innerHTML = headerHTML + `<div class="empty-state"><div class="big">🎉</div><p>¡Todo clasificado!</p></div>`;
    return;
  }

  let html = headerHTML;

  if (remotePending.length) {
    html += `
      <div style="padding:0 20px 6px">
        <div class="section-label" style="display:flex;align-items:center;gap:6px">
          De Gmail / Banco
          <span class="badge-pill badge-warn">${remotePending.length}</span>
        </div>
      </div>
    `;
    remotePending.forEach(r => {
      html += buildRemoteCard(r);
    });
  }

  if (localUnclassified.length) {
    html += `
      <div style="padding:${remotePending.length ? '8px' : '0'} 20px 6px">
        <div class="section-label" style="display:flex;align-items:center;gap:6px">
          Guardados localmente
          <span class="badge-pill" style="background:var(--bg3);color:var(--text2)">${localUnclassified.length}</span>
        </div>
      </div>
    `;
    localUnclassified.forEach(exp => {
      html += buildLocalCard(exp);
    });
  }

  el.innerHTML = html;
}

function buildRemoteCard(r) {
  const id = 'r_' + String(r.Gmail_ID || '').replace(/[^a-z0-9]/gi, '_');
  const dest = r.Destinatario || r.Detalle || '—';
  const prov = r.Proveedor || dest;
  const sugCatKey = classify(dest);
  const hogar = r.Hogar || '';

  if (!cardState[id]) {
    cardState[id] = { cat: sugCatKey, hogar };
  }

  const origen = String(r.Origen || '');
  const medioBadge = origen === 'Santander'
    ? `<span class="medio-tag visa">Visa ${String(r.Medio_Pago || '').split(' ').pop()}</span>`
    : origen === 'MP' || origen === 'CSV_MP'
      ? `<span class="medio-tag mp">MP</span>`
      : origen === 'Banco'
        ? `<span class="medio-tag banco">Banco</span>`
        : `<span class="medio-tag">${origen}</span>`;

  return `
    <div class="classify-card" id="${id}">
      <div class="cc-top">
        <div class="cc-dest" title="${dest}">${dest}</div>
        <div class="cc-right">
          <div class="cc-amount">${r.Monto ? formatCurrency(r.Monto) : '<span style="color:var(--warn)">sin monto</span>'}</div>
          <div class="cc-meta">${medioBadge}${r.Persona ? ` · ${r.Persona}` : ''}</div>
        </div>
      </div>
      <div class="cc-date">${formatDate(r.Fecha_Pago || r.Fecha_Registro)}</div>

      <div class="form-group" style="margin-bottom:12px">
        <div class="section-label" style="margin-bottom:6px">Proveedor / Rubro</div>
        <input id="${id}_prov" class="input-field" style="margin-bottom:0" type="text"
          value="${(prov || '').replace(/"/g,'&quot;')}" placeholder="Ej: Coto, McDonald's...">
      </div>

      <div class="section-label">Categoría</div>
      <div class="cat-pick-grid" id="${id}_cats">
        ${getAllCategories().map(c => `
          <button class="cat-pick-btn${cardState[id].cat === c.key ? ' selected' : ''}"
            style="${cardState[id].cat === c.key ? `background:${c.color}22;border-color:${c.color};color:${c.color}` : ''}"
            onclick="pickCardCat('${id}', '${c.key}', '${c.color}')">
            ${c.icon} ${c.label}
          </button>
        `).join('')}
      </div>

      <div class="section-label" style="margin-top:12px">Hogar</div>
      <div class="hogar-row" id="${id}_hogar">
        ${getAllHogares().map(h => `
          <button class="hogar-btn${cardState[id].hogar === h.key ? ' selected' : ''}"
            data-hogar="${h.key}"
            style="background:${h.color};border-color:${cardState[id].hogar === h.key ? '#333' : h.border}"
            onclick="pickCardHogar('${id}', '${h.key}')">
            ${h.label}
          </button>
        `).join('')}
      </div>

      <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
        <button class="btn-primary" style="padding:12px;font-size:14px"
          onclick="saveRemoteCard('${id}', '${String(r.Gmail_ID || '').replace(/'/g,"\\'")}', '${dest.replace(/'/g,"\\'")}')">
          ✓ Guardar
        </button>
        <div id="${id}_msg" style="font-size:12px;color:var(--text2)"></div>
      </div>
    </div>
  `;
}

function buildLocalCard(exp) {
  const id = 'l_' + exp.id;
  const desc = exp.description || 'Sin descripción';
  const sugCatKey = exp.category || classify(desc);

  if (!cardState[id]) {
    cardState[id] = { cat: sugCatKey, hogar: exp.hogar || '' };
  }

  return `
    <div class="classify-card" id="${id}">
      <div class="cc-top">
        <div class="cc-dest">${desc}</div>
        <div class="cc-right">
          <div class="cc-amount">${formatCurrency(exp.amount)}</div>
          <div class="cc-meta"><span class="medio-tag">Local</span>${exp.persona ? ` · ${exp.persona}` : ''}</div>
        </div>
      </div>
      <div class="cc-date">${formatDate(exp.date)}</div>

      <div class="form-group" style="margin-bottom:12px">
        <div class="section-label" style="margin-bottom:6px">Proveedor / Rubro</div>
        <input id="${id}_prov" class="input-field" style="margin-bottom:0" type="text"
          value="${(desc || '').replace(/"/g,'&quot;')}" placeholder="Ej: Coto, McDonald's...">
      </div>

      <div class="section-label">Categoría</div>
      <div class="cat-pick-grid" id="${id}_cats">
        ${getAllCategories().map(c => `
          <button class="cat-pick-btn${cardState[id].cat === c.key ? ' selected' : ''}"
            style="${cardState[id].cat === c.key ? `background:${c.color}22;border-color:${c.color};color:${c.color}` : ''}"
            onclick="pickCardCat('${id}', '${c.key}', '${c.color}')">
            ${c.icon} ${c.label}
          </button>
        `).join('')}
      </div>

      <div class="section-label" style="margin-top:12px">Hogar</div>
      <div class="hogar-row" id="${id}_hogar">
        ${getAllHogares().map(h => `
          <button class="hogar-btn${cardState[id].hogar === h.key ? ' selected' : ''}"
            data-hogar="${h.key}"
            style="background:${h.color};border-color:${cardState[id].hogar === h.key ? '#333' : h.border}"
            onclick="pickCardHogar('${id}', '${h.key}')">
            ${h.label}
          </button>
        `).join('')}
      </div>

      <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
        <button class="btn-primary" style="padding:12px;font-size:14px"
          onclick="saveLocalCard('${id}', '${exp.id}')">
          ✓ Guardar
        </button>
        <div id="${id}_msg" style="font-size:12px;color:var(--text2)"></div>
      </div>
    </div>
  `;
}

function pickCardCat(cardId, catKey, color) {
  if (!cardState[cardId]) cardState[cardId] = {};
  cardState[cardId].cat = catKey;
  const grid = document.getElementById(cardId + '_cats');
  if (!grid) return;
  grid.querySelectorAll('.cat-pick-btn').forEach(btn => {
    const btnKey = btn.textContent.trim().split(' ').slice(1).join(' ');
    const cat = getAllCategories().find(c => c.label === btnKey);
    const isMe = cat && cat.key === catKey;
    btn.classList.toggle('selected', isMe);
    btn.style.background = isMe ? color + '22' : '';
    btn.style.borderColor = isMe ? color : '';
    btn.style.color = isMe ? color : '';
  });
}

function pickCardHogar(cardId, hogarKey) {
  if (!cardState[cardId]) cardState[cardId] = {};
  cardState[cardId].hogar = hogarKey;
  const row = document.getElementById(cardId + '_hogar');
  if (!row) return;
  const hogares = getAllHogares();
  row.querySelectorAll('.hogar-btn').forEach(btn => {
    const isMe = btn.dataset.hogar === hogarKey;
    btn.classList.toggle('selected', isMe);
    const h = hogares.find(x => x.key === btn.dataset.hogar);
    btn.style.borderColor = isMe ? '#333' : (h ? h.border : '');
  });
}

async function saveRemoteCard(cardId, gmailId, destinatario) {
  const state = cardState[cardId] || {};
  const prov = document.getElementById(cardId + '_prov')?.value.trim() || '';
  const cat = getCategoryInfo(state.cat || 'variable');
  const hogar = state.hogar || '';
  const msgEl = document.getElementById(cardId + '_msg');
  const btn = document.querySelector(`#${cardId} .btn-primary`);

  if (!hogar) { if (msgEl) msgEl.textContent = '⚠️ Elegí un hogar'; return; }
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    await apiClasificar(gmailId, cat.label, prov || destinatario, destinatario, hogar);
    remotePending = remotePending.filter(r => r.Gmail_ID !== gmailId);
    delete cardState[cardId];
    animateCardOut(cardId, () => { updateNavBadge(); renderPendingTab(); });
    showToast(`${cat.icon} Guardado como ${cat.label} · ${hogar}`);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Guardar'; }
    if (msgEl) msgEl.textContent = '⚠️ ' + err.message;
  }
}

async function saveLocalCard(cardId, expId) {
  const state = cardState[cardId] || {};
  const prov = document.getElementById(cardId + '_prov')?.value.trim() || '';
  const cat = getCategoryInfo(state.cat || 'variable');
  const hogar = state.hogar || '';
  const exp = localExpenses.find(e => e.id === expId);
  const msgEl = document.getElementById(cardId + '_msg');
  const btn = document.querySelector(`#${cardId} .btn-primary`);

  if (!hogar) { if (msgEl) msgEl.textContent = '⚠️ Elegí un hogar'; return; }
  if (!exp) return;
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    await apiAddExpense({
      fecha: exp.date.slice(0, 10),
      monto: exp.amount,
      categoria: cat.label,
      proveedor: prov || exp.description || '',
      detalle: prov || exp.description || 'Gasto manual',
      hogar,
      persona: exp.persona || ''
    });
    localExpenses = localExpenses.filter(e => e.id !== expId);
    saveLocal();
    delete cardState[cardId];
    animateCardOut(cardId, () => { updateNavBadge(); renderPendingTab(); });
    showToast(`${cat.icon} Sincronizado como ${cat.label} · ${hogar}`);
  } catch {
    // Save classification locally
    exp.category = state.cat;
    exp.hogar = hogar;
    saveLocal();
    delete cardState[cardId];
    animateCardOut(cardId, () => { updateNavBadge(); renderPendingTab(); });
    showToast(`${cat.icon} Clasificado localmente`);
  }
}

function animateCardOut(cardId, cb) {
  const card = document.getElementById(cardId);
  if (card) {
    card.style.transition = 'all .3s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.97)';
    setTimeout(cb, 320);
  } else { cb(); }
}

// ── History Tab ─────────────────────────────────────────────────────────────
function renderHistoryTab() {
  const el = document.getElementById('tab-history');
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/16qOIlugqbIJYAN-gdWxMxzBfnkSmKSLSMD2hOiLTnS8';
  const [y, m] = histMonth.split('-').map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const now = new Date();

  const navHTML = `
    <div class="month-nav">
      <button onclick="changeMonth(-1)">‹</button>
      <span>${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</span>
      <button onclick="changeMonth(1)" ${histMonth >= now.toISOString().slice(0,7) ? 'disabled style="opacity:.3"' : ''}>›</button>
    </div>
  `;

  const local = localExpenses.filter(e => e.category && e.hogar && e.date.startsWith(histMonth));

  el.innerHTML = navHTML + `
    <div style="padding:0 20px 12px">
      <a href="${sheetUrl}/edit#gid=0" target="_blank"
        style="display:block;background:var(--bg2);border:1px solid var(--bg3);border-radius:var(--radius);padding:14px 16px;text-decoration:none;color:var(--text);display:flex;justify-content:space-between;align-items:center">
        <span>📊 Ver historial completo en la hoja</span>
        <span style="color:var(--text2)">→</span>
      </a>
    </div>
    ${local.length ? `
      <div style="padding:0 20px">
        <div class="month-title flex-between">
          <span style="font-size:12px;color:var(--text2)">${local.length} gastos locales guardados</span>
          <span style="font-weight:700">${formatCurrency(local.reduce((s,e)=>s+e.amount,0))}</span>
        </div>
        ${local.map(exp => {
          const cat = getCategoryInfo(exp.category);
          return `
            <div class="hist-card">
              <div class="hist-cat-dot" style="background:${cat.color}22">${cat.icon}</div>
              <div class="hist-info">
                <div class="hist-desc">${exp.description || 'Sin descripción'}</div>
                <div class="hist-meta">${cat.label} · ${exp.hogar || '—'} · ${formatDate(exp.date)}</div>
              </div>
              <div class="hist-amount">${formatCurrency(exp.amount)}</div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `<div class="empty-state"><div class="big">📋</div><p style="color:var(--text2)">Gastos locales de este mes:<br>ninguno. El historial está en la hoja.</p></div>`}
  `;
}

function changeMonth(delta) {
  const [y, m] = histMonth.split('-').map(Number);
  histMonth = new Date(y, m - 1 + delta, 1).toISOString().slice(0, 7);
  renderHistoryTab();
}

// ── Stats Tab ───────────────────────────────────────────────────────────────
function renderStatsTab() {
  const el = document.getElementById('tab-stats');
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/16qOIlugqbIJYAN-gdWxMxzBfnkSmKSLSMD2hOiLTnS8';
  const scriptUrl = 'https://script.google.com/macros/s/AKfycbyxkBwOV7qAJTV9HjrOyu1CBaSbqUXIHTECEx1Ljaa-BgY0DO27ZhwHfBfiZmNXLldV/exec';

  el.innerHTML = `
    <div class="header"><div><h1>Stats & Accesos</h1></div></div>
    <div style="padding:0 0 20px">
      <a href="${scriptUrl}" target="_blank" class="btn-primary"
        style="display:block;text-align:center;text-decoration:none;margin:0 20px 12px">
        📊 Abrir Dashboard completo →
      </a>
      <a href="${sheetUrl}/edit#gid=0" target="_blank"
        style="display:block;text-align:center;text-decoration:none;margin:0 20px 12px;padding:14px;background:var(--bg2);border:1px solid var(--bg3);border-radius:var(--radius);color:var(--text)">
        📋 Abrir hoja de cálculo →
      </a>
    </div>
    <div id="stats-content" style="padding:0 20px 20px">
      <div style="text-align:center;padding:20px;color:var(--text2)">Cargando...</div>
    </div>
  `;

  apiGetResumen().then(d => {
    document.getElementById('stats-content').innerHTML = `
      <div class="stat-cards">
        <div class="stat-card">
          <div class="sc-label">Este mes</div>
          <div class="sc-value">${formatCurrency(d.totalMes)}</div>
          <div class="sc-sub">Clasificados en la hoja</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">Para clasificar</div>
          <div class="sc-value" style="color:${d.pendientes > 0 ? 'var(--warn)' : 'var(--success)'}">${d.pendientes}</div>
          <div class="sc-sub">${d.pendientes > 0 ? 'en la hoja' : 'Todo al día ✓'}</div>
        </div>
      </div>
      ${d.pendientes > 0 ? `
        <div style="background:#451a03;border-radius:var(--radius);padding:14px 16px">
          <p style="font-size:13px;color:var(--warn);font-weight:700">⚠️ ${d.pendientes} gastos sin clasificar en la hoja</p>
          <button onclick="switchTab('pending')" style="margin-top:10px;padding:8px 16px;background:var(--warn);border:none;border-radius:8px;color:#000;font-weight:700;cursor:pointer;font-size:13px">Clasificar ahora →</button>
        </div>
      ` : ''}
    `;
  }).catch(() => {
    document.getElementById('stats-content').innerHTML =
      `<p style="color:var(--text2);font-size:13px">Sin conexión a la hoja. Usá los accesos directos de arriba.</p>`;
  });
}

// ── Navigation ──────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('[data-tab]').forEach(el => el.style.display = el.dataset.tab === tab ? '' : 'none');
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.target === tab));
  if (tab === 'add') renderAddTab();
  else if (tab === 'pending') { renderPendingTab(); loadRemotePending(); }
  else if (tab === 'history') renderHistoryTab();
  else if (tab === 'stats') renderStatsTab();
}

function updateNavBadge() {
  const local = localExpenses.filter(e => !e.category || !e.hogar).length;
  const total = local + remotePending.length;
  const btn = document.querySelector('.nav-btn[data-target="pending"]');
  if (!btn) return;
  btn.classList.toggle('has-pending', total > 0);
  const badge = btn.querySelector('.badge-pill');
  if (badge) { badge.textContent = total || ''; badge.style.display = total ? '' : 'none'; }
}

async function enableNotifications() {
  const ok = await requestNotifPermission();
  document.getElementById('notif-banner').style.display = 'none';
  showToast(ok ? '🔔 Notificaciones activadas' : 'Revisá los permisos del navegador');
}

async function initNotifications() {
  const banner = document.getElementById('notif-banner');
  if (banner) banner.style.display = ('Notification' in window && Notification.permission === 'default') ? 'block' : 'none';
}

// ── Boot ────────────────────────────────────────────────────────────────────
function boot() {
  loadLocal();

  document.getElementById('app').innerHTML = `
    <div id="main">
      <div data-tab="add"     id="tab-add"></div>
      <div data-tab="pending" id="tab-pending"  style="display:none"></div>
      <div data-tab="history" id="tab-history"  style="display:none"></div>
      <div data-tab="stats"   id="tab-stats"    style="display:none"></div>
    </div>
    <nav id="nav">
      <button class="nav-btn active" data-target="add"     onclick="switchTab('add')">
        <span class="icon">➕</span><span>Agregar</span><span class="dot"></span>
      </button>
      <button class="nav-btn"        data-target="pending" onclick="switchTab('pending')">
        <span class="icon">🕐</span><span>Pendientes</span>
        <span class="badge-pill badge-warn" style="font-size:10px;padding:1px 7px;display:none"></span>
        <span class="dot"></span>
      </button>
      <button class="nav-btn"        data-target="history" onclick="switchTab('history')">
        <span class="icon">📋</span><span>Historial</span><span class="dot"></span>
      </button>
      <button class="nav-btn"        data-target="stats"   onclick="switchTab('stats')">
        <span class="icon">📊</span><span>Stats</span><span class="dot"></span>
      </button>
    </nav>
    <div id="toast"></div>
  `;

  switchTab(new URLSearchParams(location.search).get('tab') || 'add');
  updateNavBadge();
  initSW();

  apiFetchPendientes().then(data => { remotePending = data; updateNavBadge(); }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', boot);
