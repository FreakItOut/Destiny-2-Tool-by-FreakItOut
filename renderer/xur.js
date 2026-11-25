// Xûr-Overlay: kompakte, immer sichtbare Händler-Ansicht.
const api = window.d2;
if (api && typeof api.getUiLanguage === 'function') {
  api.getUiLanguage().then((lang) => { if (window.i18n) window.i18n.setLanguage(lang); }).catch(() => {});
  if (typeof api.onUiLanguage === 'function') {
    api.onUiLanguage((lang) => { if (window.i18n) window.i18n.setLanguage(lang); });
  }
}
const statusEl = document.getElementById('xurStatus');
const listEl = document.getElementById('xurList');
const resetEl = document.getElementById('xurReset');
const countEl = document.getElementById('xurCount');
const refreshBtn = document.getElementById('xurRefresh');
const closeBtn = document.getElementById('xurClose');
const tipEl = document.getElementById('xurTip');
let xurItemsByKey = new Map();

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(value) {
  return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatWhen(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const RARITY = ['', '', 'Standard', 'Gewöhnlich', 'Selten', 'Legendär', 'Exotisch'];

function tipHtml(item) {
  if (!item) return '';
  const rarity = Math.max(0, Math.min(6, Number(item.rarity) || 0));
  const rarityLabel = RARITY[rarity] || '';
  const costs = (item.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name || 'Währung'}`).join(' · ');
  let html = `<strong>${esc(item.name || 'Item')}${item.owned ? ' · im Besitz' : ''}</strong>`;
  html += `<span class="tip-meta">${esc(item.typeName || 'Item')}${rarityLabel ? ` · ${esc(rarityLabel)}` : ''}</span>`;
  html += `<span class="tip-meta">${esc(item.seller || 'Xûr')}${item.owned ? ' · im Besitz' : ''}${item.ownedCount ? ` (${item.ownedCount}×)` : ''}</span>`;
  if (item.godRoll) html += `<span class="tip-god">✓ Godroll${item.godNotes ? ` — ${esc(item.godNotes)}` : ''}</span>`;
  else if (item.nearGodRoll) html += `<span class="tip-near">≈ Fast-Godroll</span>`;
  if (item.betterThanOwned) html += `<span class="tip-better">Besser als deine beste Kopie</span>`;
  if (item.affordable === false) html += `<span class="tip-missing">Fehlt: ${esc((item.missingCosts || []).map((cost) => cost.name).join(', '))}</span>`;
  if (Array.isArray(item.stats) && item.stats.length) {
    html += `<span class="tip-stats">` + item.stats.map((stat) =>
      `<span><span>${esc(stat.label || 'Wert')}</span><b>${Math.round(Number(stat.value) || 0)}</b></span>`
    ).join('') + `</span>`;
  }
  if (Array.isArray(item.perks) && item.perks.length) {
    html += `<span class="tip-perks">` + item.perks.map((perk) =>
      `<span>${perk.i ? `<img src="https://www.bungie.net${esc(perk.i)}" alt="">` : ''}${esc(perk.n || 'Perk')}</span>`
    ).join('') + `</span>`;
  }
  if (item.description) html += `<span class="tip-desc">${esc(item.description)}</span>`;
  if (item.flavor) html += `<span class="tip-flavor">${esc(item.flavor)}</span>`;
  if (costs) html += `<span class="tip-meta">Preis: ${esc(costs)}</span>`;
  return html;
}

function hideTip() {
  if (!tipEl) return;
  tipEl.classList.remove('show');
  tipEl.innerHTML = '';
}

function showTip(key, event, row) {
  const item = xurItemsByKey.get(String(key));
  if (!item || !tipEl) return;
  tipEl.innerHTML = tipHtml(item);
  tipEl.classList.add('show');
  tipEl.style.visibility = 'hidden';
  const box = tipEl.getBoundingClientRect();
  const rect = row ? row.getBoundingClientRect() : null;
  const baseX = event && event.clientX > 0 ? event.clientX : (rect ? rect.left : 20);
  const baseY = event && event.clientY > 0 ? event.clientY : (rect ? rect.top : 20);
  tipEl.style.left = `${Math.max(8, Math.min(window.innerWidth - box.width - 8, baseX + 12))}px`;
  tipEl.style.top = `${Math.max(8, Math.min(window.innerHeight - box.height - 8, baseY + 12))}px`;
  tipEl.style.visibility = '';
}

function render(state) {
  if (!state) {
    statusEl.className = 'xur-status';
    statusEl.textContent = 'Xûr-Daten werden geladen …';
    return;
  }
  if (state.ok === false) {
    statusEl.className = 'xur-status bad';
    statusEl.textContent = state.error || 'Xûr konnte nicht geladen werden.';
    listEl.innerHTML = '';
    countEl.textContent = '';
    return;
  }
  const items = Array.isArray(state.items) ? state.items : [];
  const when = formatWhen(state.nextRefreshDate);
  if (state.active) {
    statusEl.className = 'xur-status ok';
    statusEl.textContent = `Xûr ist da${when ? ` · Wechsel: ${when}` : ''}`;
  } else {
    statusEl.className = 'xur-status warn';
    statusEl.textContent = `Xûr ist gerade nicht da${when ? ` · nächster Wechsel: ${when}` : ''}`;
  }
  resetEl.textContent = state.vendorName || 'Agent der Neun';
  countEl.textContent = `${items.length} Angebot${items.length === 1 ? '' : 'e'}`;
  const sellers = Array.isArray(state.sellers) && state.sellers.length
    ? state.sellers
    : [...new Set(items.map((item) => item.seller || 'Xûr'))];
  const rarity = ['', '', 'Standard', 'Gewöhnlich', 'Selten', 'Legendär', 'Exotisch'];
  xurItemsByKey = new Map();
  let keyIndex = 0;
  listEl.innerHTML = sellers.map((seller) => {
    const group = items.filter((item) => (item.seller || 'Xûr') === seller);
    if (!group.length) return '';
    return `<div class="xur-group">${esc(seller)}</div>` + group.map((item) => {
      const costs = (item.costs || [])
        .map((cost) => `${fmt(cost.quantity)} ${cost.name || 'Währung'}`)
        .join(' · ');
      const icon = item.icon ? `<img src="https://www.bungie.net${esc(item.icon)}" alt="">` : '<img alt="">';
      const typeLine = [item.typeName, rarity[Math.max(0, Math.min(6, Number(item.rarity) || 0))]].filter(Boolean).join(' · ');
      const key = String(keyIndex++);
      xurItemsByKey.set(key, item);
      return `<div class="xur-item" data-xur-tip="${key}" tabindex="0">${icon}` +
        `<div class="xur-item-main"><strong>${esc(item.name || 'Item')}${item.owned ? ' <span class="xur-owned">im Besitz</span>' : ''}${item.godRoll ? ' <span class="xur-god">Godroll</span>' : item.nearGodRoll ? ' <span class="xur-near">Fast</span>' : ''}${item.betterThanOwned ? ' <span class="xur-better">besser</span>' : ''}</strong>` +
        `<span>${esc(typeLine)}</span></div>` +
        `<div class="xur-item-cost">${costs || 'Preis unbekannt'}</div></div>`;
    }).join('');
  }).join('');
}

async function load(force) {
  if (refreshBtn) refreshBtn.disabled = true;
  statusEl.className = 'xur-status';
  statusEl.textContent = 'Xûr-Daten werden geladen …';
  try {
    const state = force ? await api.xurRefresh() : await api.xurGetState();
    render(state);
  } catch (error) {
    render({ ok: false, error: error && error.message ? error.message : String(error) });
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

if (refreshBtn) refreshBtn.addEventListener('click', () => load(true));
if (closeBtn) closeBtn.addEventListener('click', () => api.xurClose());
if (listEl) {
  listEl.addEventListener('mouseover', (event) => {
    const row = event.target.closest('[data-xur-tip]');
    if (row) showTip(row.dataset.xurTip, event, row);
  });
  listEl.addEventListener('mouseout', (event) => {
    const row = event.target.closest('[data-xur-tip]');
    if (!row) return;
    const to = event.relatedTarget;
    if (to && row.contains(to)) return;
    hideTip();
  });
  listEl.addEventListener('focusin', (event) => {
    const row = event.target.closest('[data-xur-tip]');
    if (row) showTip(row.dataset.xurTip, event, row);
  });
  listEl.addEventListener('focusout', (event) => {
    if (event.target.closest('[data-xur-tip]')) hideTip();
  });
}
document.addEventListener('scroll', hideTip, true);
if (api && typeof api.onXurState === 'function') api.onXurState(render);
load(false);
