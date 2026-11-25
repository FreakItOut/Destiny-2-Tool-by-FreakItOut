'use strict';

// Deep-Link-Parser (d2tool://…). Reine Funktion, damit sie testbar ist.
// Formate:
//   d2tool://loadout?d=<base64url>   → geteiltes Loadout
//   d2tool://view?view=week          → Werkzeugseite öffnen
//   d2tool://action?name=digest      → Aktion ausführen
//   d2tool://vendor?v=<hash>&i=<hash> → Händler-Angebot öffnen

const VIEWS = ['overview', 'builds', 'week', 'collection', 'vendor'];
const ACTIONS = ['digest', 'collect', 'overlay'];

function decodeLoadout(raw) {
  if (!raw) return null;
  try {
    const normalized = String(raw).replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(normalized, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== 'object') return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function parseDeepLink(value) {
  const text = String(value || '');
  if (!/^d2tool:\/\//i.test(text)) return null;
  let url;
  try {
    url = new URL(text);
  } catch (error) {
    return null;
  }
  const host = String(url.hostname || '').toLowerCase();
  const path = String(url.pathname || '').replace(/^\//, '').toLowerCase();
  if (host === 'view' || path === 'view') {
    const view = String(url.searchParams.get('view') || 'overview').toLowerCase();
    if (!VIEWS.includes(view)) return null;
    return { kind: 'view', view };
  }
  if (host === 'action' || path === 'action') {
    const name = String(url.searchParams.get('name') || '').toLowerCase();
    if (!ACTIONS.includes(name)) return null;
    return { kind: 'action', name };
  }
  if (host === 'loadout' || path === 'loadout') {
    const payload = decodeLoadout(url.searchParams.get('d') || '');
    if (!payload) return null;
    return { kind: 'loadout', payload };
  }
  if (host === 'vendor' || path === 'vendor') {
    // Beide Formen: ?v=<vendorHash>&i=<itemHash> und /<vendor>/<item>.
    const parts = String(url.pathname || '').split('/').filter(Boolean);
    const vendorHash = Number(url.searchParams.get('v') || parts[0] || 0) || 0;
    const itemHash = Number(url.searchParams.get('i') || parts[1] || 0) || 0;
    if (!vendorHash) return null;
    return { kind: 'vendor', vendorHash, itemHash, vendorName: String(url.searchParams.get('n') || '').slice(0, 80) };
  }
  return null;
}

module.exports = { parseDeepLink, decodeLoadout, VIEWS, ACTIONS };
