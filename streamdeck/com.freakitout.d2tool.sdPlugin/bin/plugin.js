'use strict';

// Stream-Deck-Client für die lokale Destiny-2-Tool-API.
// Kein SDK-Zwang: Stream Deck startet das Plugin mit Port/UUID und
// dieses Skript verbindet sich per WebSocket. Aktionen und Status
// laufen über die normale HTTP-API; Token nur per Header.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { WebSocket } = require('ws');

const LOG_FILE = path.join(os.tmpdir(), 'd2tool-streamdeck.log');
function log(event, detail) {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 512 * 1024) {
      fs.writeFileSync(LOG_FILE, '', 'utf8');
    }
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${event} ${detail ? JSON.stringify(detail) : ''}\n`, 'utf8');
  } catch (error) { /* Log ist optional */ }
}

const args = {};
for (let i = 0; i < process.argv.length; i += 1) {
  const value = process.argv[i];
  if (!value || !value.startsWith('-')) continue;
  args[value.replace(/^-+/, '')] = process.argv[i + 1];
}

const socket = new WebSocket(`ws://127.0.0.1:${Number(args.port) || 0}`);

function send(payload) {
  try { socket.send(JSON.stringify(payload)); } catch (error) { /* Stream Deck weg */ }
}

const DEFAULT_GLOBAL = { apiUrl: 'http://127.0.0.1:7331', token: '', lang: 'de', theme: 'dark', autoProfile: false, profilePrefix: '', profileMode: 'activity' };
const DEFAULT_SETTINGS = {
  view: 'overview',
  loadout: '',
  key: 'postmaster',
  path: '',
  longPath: '',
  showBadge: false,
  slot: 0,
  mode: 'streamer',
  goal: '',
  recipe: 'standard',
  autoProfile: false,
  profilePrefix: ''
};
const KEY_CYCLE = ['postmaster', 'vault', 'checklist', 'week', 'reset', 'xur', 'focus', 'controller', 'activity', 'game', 'godrolls', 'loadouts', 'loadout', 'nightfall', 'season', 'crafting', 'champion', 'data', 'security', 'backup', 'session', 'watch'];
const LABELS = {
  postmaster: 'Postfach', vault: 'Tresor', checklist: 'Checkliste', week: 'Woche',
  reset: 'Reset', weekly: 'Weekly', xur: 'Xûr', focus: 'Fokus', controller: 'Controller',
  activity: 'Aktivität', game: 'Spiel', godrolls: 'Godrolls', loadouts: 'Loadouts',
  loadout: 'Loadout', nightfall: 'Nightfall', season: 'Saison', crafting: 'Crafting',
  'xur-wishlist': 'Xûr-Wunschliste', champion: 'Champion', data: 'Daten', security: 'Sicherheit', backup: 'Backup', session: 'Session-Ziel', watch: 'Beobachtung',
  health: 'Verbindung'
};
const LABELS_EN = {
  postmaster: 'Postmaster', vault: 'Vault', checklist: 'Checklist', week: 'Week',
  reset: 'Reset', weekly: 'Weekly', xur: 'Xûr', focus: 'Focus', controller: 'Controller',
  activity: 'Activity', game: 'Game', godrolls: 'Godrolls', loadouts: 'Loadouts',
  loadout: 'Loadout', nightfall: 'Nightfall', season: 'Season', crafting: 'Crafting',
  'xur-wishlist': 'Xûr wishlist', champion: 'Champion', data: 'Data', security: 'Security', backup: 'Backup', session: 'Session goal', watch: 'Watch',
  health: 'Connection'
};
const titleState = new Map();
const VIEWS = ['overview', 'builds', 'week', 'collection', 'vendor'];
const RECIPES = {
  standard: [['Postfach', '/action/postmaster/collect-safe'], ['Inventar', '/action/refresh-inventory'], ['Woche', '/action/view?view=week']],
  postmaster: [['Postfach', '/action/postmaster/collect-safe'], ['Inventar', '/action/refresh-inventory']],
  weekly: [['Inventar', '/action/refresh-inventory'], ['Woche', '/action/view?view=week']],
  vendor: [['Händler', '/action/vendors?wishlist=1'], ['Wunschliste', '/action/refresh-wishlist']],
  raid: [['Inventar', '/action/refresh-inventory'], ['Builds', '/action/view?view=builds']]
};
const CLEAR_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0kAAAAASUVORK5CYII=';
const contexts = new Map();
const timers = new Map();
const keyTimers = new Map();
const badgeState = new Map();
const dialStates = new Map();
let pluginVersion = '';
try {
  pluginVersion = String(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).Version || '');
} catch (error) { /* Version ist optional */ }
let globalSettings = { ...DEFAULT_GLOBAL };
let latestState = null;
let settingsGoal = '';
let lastDevice = '';
let lastProfile = '';
let eventStream = null;
let eventRetryMs = 2000;
let reconnectTimer = null;
let sseConnected = false;
let fallbackTimer = null;

function entryFor(context) {
  return contexts.get(context) || { action: '', settings: {} };
}

function settingsFor(context) {
  const entry = entryFor(context);
  return { ...DEFAULT_SETTINGS, ...(entry.settings || {}) };
}

function currentGlobal() {
  const apiUrl = String(globalSettings.apiUrl || DEFAULT_GLOBAL.apiUrl).replace(/\/+$/, '');
  return {
    apiUrl: apiUrl || DEFAULT_GLOBAL.apiUrl,
    token: String(globalSettings.token || ''),
    lang: globalSettings.lang === 'en' ? 'en' : 'de',
    theme: globalSettings.theme === 'light' ? 'light' : 'dark'
  };
}

function request(pathname, method = 'GET', body = null, settingsOverride = null) {
  const settings = settingsOverride || currentGlobal();
  return new Promise((resolve) => {
    try {
      const base = new URL(settings.apiUrl || DEFAULT_GLOBAL.apiUrl);
      const target = new URL(pathname, base);
      const headers = { Accept: 'application/json' };
      if (settings.token) headers['X-D2-Token'] = settings.token;
      let payload = null;
      if (body != null) {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }
      const req = http.request({
        hostname: target.hostname,
        port: target.port || 80,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        timeout: 7000
      }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => {
          let json = {};
          try { json = JSON.parse(text); } catch (error) { json = { text }; }
          resolve({ status: res.statusCode || 0, body: json });
        });
      });
      req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
      req.on('error', (error) => {
        log('request-error', { path: pathname, error: error.message });
        resolve({ status: 0, body: { ok: false, error: error.message } });
      });
      req.end(payload || undefined);
    } catch (error) {
      resolve({ status: 0, body: { ok: false, error: error.message } });
    }
  });
}

function requestBinary(pathname, settingsOverride = null) {
  const settings = settingsOverride || currentGlobal();
  return new Promise((resolve) => {
    try {
      const base = new URL(settings.apiUrl || DEFAULT_GLOBAL.apiUrl);
      const target = new URL(pathname, base);
      const headers = { Accept: 'image/svg+xml' };
      if (settings.token) headers['X-D2-Token'] = settings.token;
      const req = http.request({
        hostname: target.hostname,
        port: target.port || 80,
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers,
        timeout: 6000
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks) }));
      });
      req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
      req.on('error', () => resolve({ status: 0, body: Buffer.alloc(0) }));
      req.end();
    } catch (error) {
      resolve({ status: 0, body: Buffer.alloc(0) });
    }
  });
}

function statusValue(key, state) {
  if (!state || state.ok !== true) return '—';
  switch (key) {
    case 'postmaster': return state.postmaster;
    case 'vault': return state.vault;
    case 'checklist': return state.checklist ? state.checklist.open : '—';
    case 'week': return state.checklist ? state.checklist.mustOpen : '—';
    case 'reset': return state.reset ? state.reset.daily : '—';
    case 'weekly': return state.reset ? state.reset.weekly : '—';
    case 'xur': return state.xurLoaded === false ? '—' : (state.xurActive ? 'da' : 'weg');
    case 'xur-wishlist': return state.xurWishlist;
    case 'focus': return state.overlay && state.overlay.clickThrough ? 'Maus durch' : state.overlay && state.overlay.focused ? 'Overlay' : 'Spiel';
    case 'controller': return state.controller && state.controller.connected ? `Controller ${Number(state.controller.index) + 1}` : (state.steamInputMode ? 'Steam Input' : 'kein Controller');
    case 'activity': return state.activity || '—';
    case 'game': return state.gameRunning ? 'läuft' : 'aus';
    case 'godrolls': return state.godrolls;
    case 'loadouts': return state.loadouts;
    case 'loadout': return state.loadout || '—';
    case 'nightfall': return state.nightfall || '—';
    case 'season': return state.season || '—';
    case 'crafting': return state.crafting || '—';
    case 'champion': return state.champion ? state.champion.text : '—';
    case 'data': {
      const fetchedAt = Number(state.data && state.data.fetchedAt) || 0;
      const age = fetchedAt ? Math.max(0, Date.now() - fetchedAt) : 0;
      if (!age) return 'kein Snapshot';
      const mins = Math.round(age / 60000);
      return state.data.stale ? `${mins} min !` : `${mins} min`;
    }
    case 'security': return state.security && state.security.readOnly ? 'read-only' : state.security && state.security.pinSet ? 'PIN' : 'offen';
    case 'backup': {
      const at = Number(state.backup && state.backup.at) || 0;
      if (!at) return 'keins';
      const hours = Math.max(0, Math.round((Date.now() - at) / 3600000));
      return hours < 1 ? 'gerade' : `${hours} h`;
    }
    case 'session': {
      const goals = Array.isArray(state.sessionGoals) ? state.sessionGoals : [];
      const goal = goals.find((entry) => settingsGoal && (String(entry.id || '') === String(settingsGoal) || String(entry.text || '').toLowerCase().includes(String(settingsGoal).toLowerCase()))) || goals[0];
      return goal ? `${Number(goal.progress) || 0}/${Number(goal.target) || 1}` : 'keins';
    }
    case 'watch': return Array.isArray(state.watchlist) ? state.watchlist.length : 0;
    default: return '—';
  }
}

function setTitle(context, key, value, extra = '') {
  const lang = currentGlobal().lang;
  const label = (lang === 'en' ? LABELS_EN : LABELS)[key] || key;
  const title = `${label}\n${value}${extra}`;
  if (titleState.get(context) === title) return;
  titleState.set(context, title);
  send({ event: 'setTitle', context, payload: { title, target: 0 } });
}

function setToggleIcon(context, on, label) {
  const color = on ? '#5fe0a0' : '#7f8ea3';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#0b1018"/><circle cx="72" cy="52" r="24" fill="${color}"/><text x="72" y="108" font-family="Segoe UI,Arial,sans-serif" font-size="20" font-weight="600" fill="#e8ecf2" text-anchor="middle">${label}</text></svg>`;
  send({ event: 'setImage', context, payload: { image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, target: 0 } });
}

async function checkHealth(context) {
  const [health, version] = await Promise.all([request('/health'), request('/version')]);
  const ok = health.status === 200 && (!health.body || health.body.ok !== false);
  const appVersion = (version.body && version.body.version) || (health.body && health.body.version) || '';
  setTitle(context, 'health', ok ? `ok${appVersion ? ` · v${appVersion}` : ''}${pluginVersion ? ` · P${pluginVersion}` : ''}` : 'Fehler');
  setToggleIcon(context, ok, ok ? 'OK' : '!');
  send({ event: ok ? 'showOk' : 'showAlert', context });
}

function dialKind(action) {
  if (String(action).endsWith('.loadout.dial')) return 'loadout';
  if (String(action).endsWith('.vendor.dial')) return 'vendor';
  if (String(action).endsWith('.checklist.dial')) return 'checklist';
  return '';
}

function showDialItem(context, action) {
  const state = dialStates.get(context);
  const kind = dialKind(action);
  const label = kind === 'loadout' ? 'Loadout' : kind === 'vendor' ? 'Händler' : 'Checkliste';
  if (!state || !state.items.length) {
    send({ event: 'setTitle', context, payload: { title: `${label}\nleer`, target: 0 } });
    return;
  }
  const index = Math.max(0, Math.min(state.items.length - 1, state.index));
  const item = state.items[index];
  const text = String(item.name || item.text || label).slice(0, 28);
  send({ event: 'setTitle', context, payload: { title: `${label} ${index + 1}/${state.items.length}\n${text}`, target: 0 } });
}

async function loadDialItems(context, action) {
  const kind = dialKind(action);
  if (!kind) return;
  let items = [];
  if (kind === 'loadout') {
    const result = await request('/loadouts');
    items = ((result.body && result.body.loadouts) || []).map((entry) => ({ id: entry.id, name: entry.name }));
  } else if (kind === 'vendor') {
    const result = await request('/vendors');
    for (const group of ((result.body && result.body.groups) || [])) {
      for (const vendor of (group.vendors || [])) {
        if (vendor && vendor.hash) items.push({ id: String(vendor.hash), name: vendor.name || `Händler ${vendor.hash}` });
      }
    }
  } else if (kind === 'checklist') {
    const result = await request('/checklist');
    items = ((result.body && result.body.items) || []).filter((item) => item.done !== true).map((item) => ({ id: item.id, name: item.text }));
  }
  dialStates.set(context, { kind, items, index: 0 });
  showDialItem(context, action);
}

function rotateDial(context, action, ticks) {
  const state = dialStates.get(context);
  if (!state) {
    loadDialItems(context, action).catch(() => {});
    return;
  }
  if (!state.items.length) {
    showDialItem(context, action);
    return;
  }
  const step = ticks > 0 ? 1 : -1;
  state.index = (state.index + step + state.items.length) % state.items.length;
  showDialItem(context, action);
}

async function applyDialItem(context, action) {
  const state = dialStates.get(context);
  const kind = dialKind(action);
  const item = state && state.items[state.index];
  if (!item) {
    send({ event: 'showAlert', context });
    return;
  }
  let path = '';
  if (kind === 'loadout') path = `/action/loadout?${encodeLoadout(item.id || item.name)}`;
  else if (kind === 'vendor') path = `/action/vendor?hash=${encodeURIComponent(item.id)}`;
  else if (kind === 'checklist') path = `/action/checklist/toggle?id=${encodeURIComponent(item.id)}`;
  if (!path) return;
  const result = await request(path);
  if (result.body && result.body.ok === false) {
    send({ event: 'showAlert', context });
    return;
  }
  send({ event: 'showOk', context });
  if (kind === 'checklist') setTimeout(() => loadDialItems(context, action).catch(() => {}), 500);
}

function activityCategory(activity) {
  const text = String(activity || '').toLowerCase();
  if (/gambit/.test(text)) return 'Gambit';
  if (/pr(ü|u)fung|trials|schmelztiegel|crucible|pvp|eisenbanner|iron banner|competitive/.test(text)) return 'PvP';
  if (/raid|schlachtzug|dungeon|kerker|nightfall|gro(ß|s)meister|grandmaster|\bgm\b|strike|vorhut|saison|season/.test(text)) return 'PvE';
  return 'PvE';
}

async function updateStatus(context, settings = null) {
  const local = settings || settingsFor(context);
  const action = String(entryFor(context).action || '');
  let key = String(local.key || 'postmaster').toLowerCase();
  if (action.endsWith('.champion')) key = 'champion';
  else if (action.endsWith('.data')) key = 'data';
  else if (action.endsWith('.security')) key = 'security';
  else if (action.endsWith('.backup')) key = 'backup';
  else if (action.endsWith('.session.goal')) key = 'session';
  else if (action.endsWith('.vendor.watch')) key = 'watch';
  else if (action.endsWith('.activity')) key = 'activity';
  else if (action.endsWith('.reset.dial')) key = (local.key && local.key !== 'postmaster') ? local.key : 'reset';
  else if (action.endsWith('.cockpit')) key = (local.key && local.key !== 'postmaster') ? local.key : 'reset';
  if (key === 'session') settingsGoal = String(local.goal || '');
  if (!latestState) {
    const result = await request('/state');
    if (result.status === 200 && result.body && result.body.ok === true) {
      latestState = result.body;
      maybeSwitchProfile(latestState);
    }
  }
  if (!latestState) {
    setTitle(context, key, 'API —');
    return;
  }
  if (action.endsWith('.loadout.slot')) {
    const slot = Math.max(0, Math.min(9, Math.round(Number(local.slot) || 0)));
    const loadout = (latestState.loadoutsList || [])[slot];
    setTitle(context, 'loadout', loadout ? `${loadout.name}\n${['Titan', 'Jäger', 'Warlock', 'Alle'][Number(loadout.classType)] || ''}` : 'Slot leer');
    return;
  }
  setTitle(context, key, statusValue(key, latestState));
  if (action.endsWith('.security')) {
    const readOnly = Boolean(latestState.security && latestState.security.readOnly);
    if (local.showBadge !== true) setToggleIcon(context, readOnly, readOnly ? 'READ-ONLY' : 'OFFEN');
  }
  if (local.showBadge === true) {
    const globalOptions = currentGlobal();
    const badge = await requestBinary(`/badge/${encodeURIComponent(key)}.svg?size=144&theme=${globalOptions.theme}&lang=${globalOptions.lang}`);
    if (badge.status === 200 && badge.body.length) {
      send({ event: 'setImage', context, payload: { image: `data:image/svg+xml;base64,${badge.body.toString('base64')}`, target: 0 } });
      badgeState.set(context, true);
    }
  } else if (badgeState.get(context)) {
    send({ event: 'setImage', context, payload: { image: CLEAR_IMAGE, target: 0 } });
    badgeState.set(context, false);
  }
}

function maybeSwitchProfile(state) {
  if (!state || globalSettings.autoProfile !== true || !lastDevice) return;
  const activity = String(state.activity || '').trim();
  if (!activity) return;
  const name = globalSettings.profileMode === 'category' ? activityCategory(activity) : activity;
  const profile = `${globalSettings.profilePrefix || ''}${name}`.slice(0, 60);
  if (!profile || profile === lastProfile) return;
  lastProfile = profile;
  send({ event: 'switchToProfile', context: args.pluginUUID, payload: { device: lastDevice, profile } });
}

function isStatusAction(action) {  return /\.(status|status\.encoder|champion|data|security|backup|session\.goal|vendor\.watch|activity|reset\.dial|cockpit|loadout\.slot)$/.test(String(action || ''));
}

function refreshAllStatus() {
  refreshOverlayIcons(latestState);
  for (const [context, entry] of contexts) {
    if (isStatusAction(entry.action)) {
      updateStatus(context, settingsFor(context)).catch(() => {});
    }
  }
}

function refreshOverlayIcons(state) {
  if (!state) return;
  const visible = Boolean(state.overlay && state.overlay.visible);
  for (const [context, entry] of contexts) {
    if (String(entry.action || '').endsWith('.overlay')) {
      setToggleIcon(context, visible, visible ? 'AN' : 'AUS');
    }
  }
}

function startFallbackPoll() {
  if (fallbackTimer) clearInterval(fallbackTimer);
  fallbackTimer = setInterval(() => {
    if (sseConnected && latestState) return;
    request('/state').then((result) => {
      if (result.status === 200 && result.body && result.body.ok === true) {
        latestState = result.body;
        maybeSwitchProfile(latestState);
        refreshAllStatus();
      }
    }).catch(() => {});
  }, 15000);
  if (fallbackTimer.unref) fallbackTimer.unref();
}

function handleSseBlock(block) {
  let event = 'message';
  const dataLines = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return;
  try {
    const value = JSON.parse(dataLines.join('\n'));
    if (event === 'state' || event === 'message') {
      latestState = value;
      maybeSwitchProfile(latestState);
      refreshAllStatus();
    } else if (latestState && event === 'postmaster') {
      latestState.postmaster = value.value;
      refreshAllStatus();
    } else if (latestState && event === 'vault') {
      latestState.vault = value.value;
      refreshAllStatus();
    } else if (latestState && event === 'checklist') {
      latestState.checklist = value;
      refreshAllStatus();
    } else if (latestState && event === 'xur') {
      latestState.xurActive = value.active;
      latestState.xurLoaded = true;
      refreshAllStatus();
    } else if (latestState && event === 'focus') {
      latestState.focus = value;
      if (latestState.overlay) {
        latestState.overlay.focused = value.focused;
        latestState.overlay.clickThrough = value.clickThrough;
        latestState.overlay.visible = value.visible;
      }
      refreshAllStatus();
    }
  } catch (error) { /* ungültiges Event */ }
}

function stopEventStream() {
  if (eventStream) {
    try { eventStream.destroy(); } catch (error) { /* egal */ }
    eventStream = null;
  }
  sseConnected = false;
}

function scheduleReconnect() {
  stopEventStream();
  if (reconnectTimer) return;
  log('sse-reconnect', { delayMs: eventRetryMs });
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startEventStream();
  }, eventRetryMs);
  if (reconnectTimer.unref) reconnectTimer.unref();
  eventRetryMs = Math.min(30000, eventRetryMs * 2);
}

function startEventStream() {
  stopEventStream();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const settings = currentGlobal();
  try {
    const base = new URL(settings.apiUrl || DEFAULT_GLOBAL.apiUrl);
    const headers = { Accept: 'text/event-stream' };
    if (settings.token) headers['X-D2-Token'] = settings.token;
    const req = http.request({
      hostname: base.hostname,
      port: base.port || 80,
      path: '/events?types=state,focus,postmaster,vault,checklist,xur',
      method: 'GET',
      headers
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        scheduleReconnect();
        return;
      }
      sseConnected = true;
      eventRetryMs = 2000;
      res.setEncoding('utf8');
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk;
        let index = buffer.indexOf('\n\n');
        while (index >= 0) {
          handleSseBlock(buffer.slice(0, index));
          buffer = buffer.slice(index + 2);
          index = buffer.indexOf('\n\n');
        }
      });
      res.on('end', scheduleReconnect);
      res.on('error', scheduleReconnect);
    });
    req.on('error', scheduleReconnect);
    req.end();
    eventStream = req;
  } catch (error) {
    scheduleReconnect();
  }
}

function encodeLoadout(value) {
  const text = String(value || '');
  return /^\d+$/.test(text) ? `id=${encodeURIComponent(text)}` : `name=${encodeURIComponent(text)}`;
}

async function callAction(context, action, settings) {
  const local = settings || settingsFor(context);
  let path = local.path || '';
  if (action.endsWith('.health')) {
    await checkHealth(context);
    return;
  }
  if (dialKind(action)) {
    await applyDialItem(context, action);
    return;
  }
  if (action.endsWith('.status') || action.endsWith('.status.encoder')) {
    await updateStatus(context, local);
    return;
  }
  if (action.endsWith('.loadout.slot')) {
    await updateStatus(context, local);
    const slot = Math.max(0, Math.min(9, Math.round(Number(local.slot) || 0)));
    const loadout = latestState && (latestState.loadoutsList || [])[slot];
    if (!loadout) {
      send({ event: 'showAlert', context });
      return;
    }
    const result = await request(`/action/loadout?${encodeLoadout(loadout.id || loadout.name)}`);
    if (result.body && result.body.ok === false) send({ event: 'showAlert', context });
    else send({ event: 'showOk', context });
    return;
  }
  if (action.endsWith('.routine')) {
    await runRoutine(context, local.recipe);
    return;
  }
  if (action.endsWith('.champion')) path = '/action/view?view=builds';
  else if (action.endsWith('.data')) path = '/action/refresh-inventory';
  else if (action.endsWith('.postmaster.safe')) path = '/action/postmaster/collect-safe';
  else if (action.endsWith('.vendor.watch')) path = '/action/view?view=vendor';
  else if (action.endsWith('.session.goal')) path = '/action/session-goal?delta=1';
  else if (action.endsWith('.security')) path = (latestState && latestState.security && latestState.security.readOnly) ? '/action/security/unlock' : '/action/security/lock';
  else if (action.endsWith('.notifications')) path = '/action/dashboard';
  else if (action.endsWith('.backup')) path = '/action/backup';
  else if (action.endsWith('.modes')) path = `/action/mode?mode=${encodeURIComponent(local.mode || 'streamer')}`;
  else if (action.endsWith('.emergency')) path = '/action/emergency';
  else if (action.endsWith('.activity')) path = '/action/view?view=overview';
  else if (action.endsWith('.reset.dial') || action.endsWith('.cockpit')) path = '/action/view?view=week';
  else if (action.endsWith('.view')) path = `/action/view?view=${encodeURIComponent(local.view || 'overview')}`;
  else if (action.endsWith('.loadout')) path = `/action/loadout?${encodeLoadout(local.loadout)}`;
  else if (action.endsWith('.overlay')) path = '/action/overlay';
  else if (action.endsWith('.focus')) path = '/action/focus';
  else if (action.endsWith('.postmaster')) path = '/action/postmaster';
  else if (action.endsWith('.xur')) path = '/action/xur/open';
  else if (action.endsWith('.loadout.next')) path = '/action/loadout/next';
  else if (action.endsWith('.view.next')) path = '/action/view/next';
  if (!path) return;
  const result = await request(path);
  if (result.body && result.body.ok === false) {
    send({ event: 'showAlert', context });
    send({ event: 'setTitle', context, payload: { title: 'Fehler', target: 0 } });
    return;
  }
  send({ event: 'showOk', context });
  if (action.endsWith('.overlay')) {
    request('/state').then((state) => {
      if (!state.body) return;
      latestState = state.body;
      const visible = Boolean(state.body.overlay && state.body.overlay.visible);
      setToggleIcon(context, visible, visible ? 'AN' : 'AUS');
    }).catch(() => {});
  }
  if (isStatusAction(action)) {
    setTimeout(() => updateStatus(context, local), 500);
  }
}

async function runRoutine(context, recipe = 'standard') {
  const steps = RECIPES[recipe] || RECIPES.standard;
  for (let index = 0; index < steps.length; index += 1) {
    const [label, path] = steps[index];
    send({ event: 'setTitle', context, payload: { title: `${index + 1}/${steps.length} ${label}`, target: 0 } });
    const result = await request(path);
    if (result.body && result.body.ok === false) {
      send({ event: 'showAlert', context });
      send({ event: 'setTitle', context, payload: { title: `${label} Fehler`, target: 0 } });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  send({ event: 'showOk', context });
  send({ event: 'setTitle', context, payload: { title: 'Routine OK', target: 0 } });
}

function cycleStatusKey(context, direction, settings) {
  const local = settings || settingsFor(context);
  const current = String(local.key || 'postmaster').toLowerCase();
  let index = KEY_CYCLE.indexOf(current);
  if (index < 0) index = 0;
  index = (index + (direction > 0 ? 1 : -1) + KEY_CYCLE.length) % KEY_CYCLE.length;
  const key = KEY_CYCLE[index];
  const entry = entryFor(context);
  entry.settings = { ...(entry.settings || {}), ...local, key };
  contexts.set(context, entry);
  send({ event: 'setSettings', context, payload: entry.settings });
  updateStatus(context, entry.settings);
}

function sendToPropertyInspector(context, payload) {
  send({ event: 'sendToPropertyInspector', action: (entryFor(context).action || ''), context, payload });
}

async function propertyInspectorRequest(context, payload) {
  const type = String(payload && payload.type || '');
  if (type === 'save-global') {
    const settings = {
      apiUrl: String((payload.settings && payload.settings.apiUrl) || DEFAULT_GLOBAL.apiUrl).slice(0, 300),
      token: String((payload.settings && payload.settings.token) || '').slice(0, 120),
      lang: payload.settings && payload.settings.lang === 'en' ? 'en' : 'de',
      theme: payload.settings && payload.settings.theme === 'light' ? 'light' : 'dark',
      autoProfile: payload.settings && payload.settings.autoProfile === true,
      profilePrefix: String((payload.settings && payload.settings.profilePrefix) || '').slice(0, 60),
      profileMode: payload.settings && payload.settings.profileMode === 'category' ? 'category' : 'activity'
    };
    log('global-settings-saved', { apiUrl: settings.apiUrl, lang: settings.lang, theme: settings.theme });
    globalSettings = settings;
    send({ event: 'setGlobalSettings', context: args.pluginUUID, payload: settings });
    eventRetryMs = 2000;
    startEventStream();
    refreshAllStatus();
    sendToPropertyInspector(context, { type: 'global-saved', settings });
    return;
  }
  if (type === 'test-connection') {
    const settings = payload.settings ? {
      apiUrl: String(payload.settings.apiUrl || globalSettings.apiUrl).slice(0, 300),
      token: String(payload.settings.token || globalSettings.token || '').slice(0, 120)
    } : currentGlobal();
    const [health, version] = await Promise.all([
      request('/health', 'GET', null, settings),
      request('/version', 'GET', null, settings)
    ]);
    sendToPropertyInspector(context, {
      type: 'test-result',
      ok: health.status === 200 && (!health.body || health.body.ok !== false),
      status: health.status,
      version: (version.body && version.body.version) || (health.body && health.body.version) || '',
      apiVersion: version.body && version.body.apiVersion,
      pluginVersion,
      body: health.body
    });
    return;
  }
  if (type === 'test-badge') {
    const key = String(payload.key || 'postmaster').toLowerCase();
    const globalOptions = currentGlobal();
    const badge = await requestBinary(`/badge/${encodeURIComponent(key)}.svg?size=144&theme=${globalOptions.theme}&lang=${globalOptions.lang}`);
    if (badge.status === 200 && badge.body.length) {
      send({ event: 'setImage', context, payload: { image: `data:image/svg+xml;base64,${badge.body.toString('base64')}`, target: 0 } });
      badgeState.set(context, true);
      sendToPropertyInspector(context, { type: 'badge-result', ok: true });
    } else {
      sendToPropertyInspector(context, { type: 'badge-result', ok: false, status: badge.status });
    }
    return;
  }
  if (type === 'get-options') {
    const [loadoutsResult, manifestResult] = await Promise.all([request('/loadouts'), request('/manifest')]);
    const loadouts = (loadoutsResult.body && loadoutsResult.body.loadouts || []).map((entry) => ({ id: entry.id, name: entry.name, classType: entry.classType }));
    sendToPropertyInspector(context, {
      type: 'options',
      loadouts,
      views: VIEWS,
      keys: KEY_CYCLE,
      connected: loadoutsResult.status === 200,
      error: loadoutsResult.body && loadoutsResult.body.error || '',
      manifest: manifestResult.body || null
    });
  }
}

socket.on('open', () => {
  send({ event: args.registerEvent || 'registerPlugin', uuid: args.pluginUUID });
  send({ event: 'getGlobalSettings', context: args.pluginUUID });
  startFallbackPoll();
  startEventStream();
});

socket.on('message', (raw) => {
  let message;
  try { message = JSON.parse(String(raw)); } catch (error) { return; }
  const context = message.context;
  if (message.device) lastDevice = String(message.device);
  if (message.action) {
    const entry = entryFor(context);
    entry.action = message.action;
    if (message.payload && message.payload.settings) entry.settings = { ...(entry.settings || {}), ...message.payload.settings };
    contexts.set(context, entry);
  }
  if (message.event === 'didReceiveGlobalSettings') {
    const incoming = (message.payload && message.payload.settings) || {};
    globalSettings = { ...DEFAULT_GLOBAL, ...incoming };
    if (!globalSettings.apiUrl) globalSettings.apiUrl = DEFAULT_GLOBAL.apiUrl;
    eventRetryMs = 2000;
    startEventStream();
    refreshAllStatus();
  } else if (message.event === 'willAppear') {
    const entry = entryFor(context);
    entry.action = message.action || entry.action;
    entry.settings = { ...DEFAULT_SETTINGS, ...(entry.settings || {}), ...((message.payload && message.payload.settings) || {}) };
    contexts.set(context, entry);
    if (!globalSettings.token && entry.settings.token) {
      globalSettings = { apiUrl: entry.settings.apiUrl || DEFAULT_GLOBAL.apiUrl, token: entry.settings.token };
      send({ event: 'setGlobalSettings', context: args.pluginUUID, payload: globalSettings });
    }
    if (isStatusAction(entry.action)) {
      updateStatus(context, entry.settings);
    }
    if (entry.action && entry.action.endsWith('.health')) {
      checkHealth(context).catch(() => {});
    }
    if (dialKind(entry.action)) {
      loadDialItems(context, entry.action).catch(() => {});
    }
    if (entry.action && entry.action.endsWith('.overlay')) {
      if (latestState) refreshOverlayIcons(latestState);
      else request('/state').then((result) => {
        if (result.body) {
          latestState = result.body;
          refreshOverlayIcons(latestState);
        }
      }).catch(() => {});
    }
  } else if (message.event === 'willDisappear') {
    contexts.delete(context);
    const timer = timers.get(context);
    if (timer) clearInterval(timer);
    timers.delete(context);
    const keyTimer = keyTimers.get(context);
    if (keyTimer && keyTimer.timer) clearTimeout(keyTimer.timer);
    keyTimers.delete(context);
  } else if (message.event === 'didReceiveSettings') {
    const entry = entryFor(context);
    entry.settings = { ...DEFAULT_SETTINGS, ...(entry.settings || {}), ...((message.payload && message.payload.settings) || {}) };
    contexts.set(context, entry);
    if (isStatusAction(entry.action)) {
      updateStatus(context, entry.settings);
    }
  } else if (message.event === 'keyDown' || message.event === 'dialDown') {
    const entry = entryFor(context);
    const action = String(message.action || entry.action || '');
    const local = settingsFor(context);
    if (!action) return;
    if (message.event === 'dialDown' || (!local.longPath && !action.endsWith('.status') && !action.endsWith('.status.encoder'))) {
      keyTimers.set(context, { immediate: true });
      callAction(context, action, local).catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      const state = keyTimers.get(context);
      if (!state) return;
      state.longFired = true;
      if (local.longPath) {
        request(local.longPath).then((result) => {
          if (result.body && result.body.ok === false) send({ event: 'showAlert', context });
          else send({ event: 'showOk', context });
        }).catch(() => send({ event: 'showAlert', context }));
      } else {
        updateStatus(context, local);
      }
    }, 550);
    if (timer.unref) timer.unref();
    keyTimers.set(context, { timer, longFired: false, local, action });
  } else if (message.event === 'keyUp') {
    const state = keyTimers.get(context);
    keyTimers.delete(context);
    if (!state || state.immediate) return;
    if (state.timer) clearTimeout(state.timer);
    if (!state.longFired) callAction(context, state.action, state.local).catch(() => {});
  } else if (message.event === 'dialRotate') {
    const entry = entryFor(context);
    const ticks = Number(message.payload && message.payload.ticks) || 0;
    const direction = ticks > 0 ? 'next' : 'prev';
    const action = String(message.action || entry.action || '');
    if (dialKind(action)) {
      rotateDial(context, action, ticks);
    } else if (action.endsWith('.status.encoder') || action.endsWith('.reset.dial') || action.endsWith('.cockpit')) {
      cycleStatusKey(context, ticks, settingsFor(context));
    } else {
      const path = action.endsWith('.view.next') ? `/action/view/${direction}` : `/action/loadout/${direction}`;
      request(path).catch(() => {});
    }
  } else if (message.event === 'sendToPlugin') {
    propertyInspectorRequest(context, message.payload || {}).catch((error) => {
      sendToPropertyInspector(context, { type: 'error', error: error.message || String(error) });
    });
  }
});

socket.on('error', (error) => { log('socket-error', { error: error.message || String(error) }); });
