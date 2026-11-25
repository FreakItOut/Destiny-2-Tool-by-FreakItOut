'use strict';
// Automatisch erzeugt von tools/make-openapi.js.
// Minimaler Client für die lokale Destiny-2-Tool-API.
const ENDPOINTS = {
  "GET /action/view": "Werkzeugseite öffnen",
  "GET /action/focus": "Overlay fokussieren",
  "GET /action/toast": "Kurze Meldung im Tool anzeigen",
  "GET /action/vendor": "Händler oder Angebot öffnen",
  "GET /action/collection": "Sammlungs-Unterseite öffnen",
  "GET /action/week": "Wochenplan mit Filter öffnen",
  "GET /action/vendors": "Händler mit Wunschroll-Filter öffnen",
  "GET /action/picker": "Rüstungs-Picker für eine Klasse öffnen",
  "GET /action/postmaster/counter": "Postfach-Zähler ein-/ausschalten",
  "GET /action/xur/open": "Xûr-Fenster öffnen",
  "GET /action/xur/remind": "Xûr-Erinnerung ein-/ausschalten",
  "GET /action/batch": "Mehrere Aktionen nacheinander ausführen",
  "POST /action/batch": "Batch per JSON mit steps ausführen",
  "GET /action/webhook/test": "Webhook-Test auslösen",
  "GET /action/loadout": "Gespeichertes Loadout anwenden",
  "GET /action/loadout/missing": "Nur fehlende Teile eines Loadouts anlegen",
  "GET /action/loadout/next": "Nächstes Loadout anwenden",
  "GET /action/loadout/prev": "Vorheriges Loadout anwenden",
  "GET /action/view/next": "Nächste Werkzeugseite öffnen",
  "GET /action/view/prev": "Vorherige Werkzeugseite öffnen",
  "POST /action/workflow": "Workflow mit Bedingungen ausführen",
  "GET /action/tokens/create": "Benannten Token erzeugen",
  "GET /action/tokens/revoke": "Benannten Token widerrufen",
  "GET /action/checklist/toggle": "Checklisten-Punkt abhaken oder öffnen",
  "PATCH /checklist/{id}": "Checklisten-Punkt bearbeiten",
  "DELETE /checklist/{id}": "Checklisten-Punkt löschen",
  "POST /checklist/reorder": "Checklisten-Reihenfolge setzen",
  "POST /jobs/{id}/cancel": "Hintergrund-Job abbrechen",
  "GET /action/checklist/add": "Checklisten-Punkt hinzufügen",
  "GET /action/checklist/reset": "Wochen-Checkliste zurücksetzen",
  "GET /action/overlay": "Overlay ein- oder ausblenden",
  "GET /action/overlay/show": "Overlay anzeigen",
  "GET /action/overlay/hide": "Overlay ausblenden",
  "GET /action/overlay/enter": "In den Overlay-Modus wechseln",
  "GET /action/overlay/leave": "Overlay-Modus verlassen",
  "GET /action/click-through": "Maus-Durchlassen umschalten",
  "GET /action/inventory": "Inventar öffnen",
  "GET /action/postmaster": "Postfach im Inventar öffnen",
  "GET /action/dashboard": "Dashboard öffnen",
  "GET /action/settings": "Einstellungen öffnen",
  "GET /action/notes": "Notizen öffnen",
  "GET /action/checklist": "Wochen-Checkliste öffnen",
  "GET /action/mini": "Minimodus umschalten oder setzen",
  "GET /action/xur": "Xûr-Fenster öffnen",
  "GET /action/refresh-inventory": "Inventar neu laden",
  "GET /action/refresh-wishlist": "Wunschliste neu laden",
  "GET /action/refresh": "Wunschlisten-Caches leeren",
  "GET /action/digest": "Weekly-Digest senden",
  "GET /action/collect-postmaster": "Postfach sammeln",
  "GET /action/game/launch": "Destiny 2 starten",
  "GET /health": "Lebenszeichen ohne Token",
  "GET /manifest": "Fähigkeiten, Aktionen und Kurz-URLs",
  "GET /state": "Gesamtstatus für Key-Anzeigen",
  "GET /state.txt": "Gesamtstatus als kompakte Textzeile",
  "GET /focus": "Fokus-Status des Overlays",
  "GET /key/{name}": "Einzelwert (postmaster, vault, reset, xur, focus, controller …)",
  "GET /badge/{name}.svg": "SVG-Badge für Stream-Deck-Tasten",
  "GET /events": "Server-Sent-Events-Stream mit Statusänderungen",
  "GET /openapi.json": "OpenAPI-Dokument",
  "GET /commands.txt": "Befehlsliste als Text",
  "GET /openapi.yaml": "OpenAPI-Dokument als YAML",
  "GET /items": "Inventar-Items mit Filtern",
  "GET /item/{id}": "Item nach Instanz-ID oder Hash",
  "GET /checklist/{id}": "Einzelner Checklisten-Punkt",
  "PATCH /notes": "Notizen aktualisieren",
  "POST /reminders": "Erinnerung anlegen",
  "GET /reminders/{id}": "Einzelne Erinnerung",
  "PATCH /reminders/{id}": "Erinnerung bearbeiten",
  "DELETE /reminders/{id}": "Erinnerung löschen",
  "GET /search": "Items, Loadouts und Checkliste durchsuchen",
  "GET /notes": "Notizen und Notizblätter",
  "GET /reminders": "Persönliche Erinnerungen",
  "GET /auth/status": "Bungie-OAuth- und API-Status",
  "GET /queue": "Bungie-Queue und API-Kennzahlen",
  "GET /digest/preview": "Vorschau des Weekly-Digests",
  "GET /characters": "Charaktere mit Lichtlevel",
  "GET /vendors": "Händler und Angebote",
  "GET /vendor/{hash}": "Angebote eines Händlers",
  "GET /activities": "Aktuelle Aktivitäten",
  "GET /nightfall": "Nightfall und Modifikatoren",
  "GET /season": "Saison-Ziele",
  "GET /crafting": "Waffenbaupläne",
  "GET /jobs": "Hintergrund-Jobs",
  "GET /jobs/{id}": "Status eines Jobs",
  "GET /tokens": "Benannte Tokens (ohne Geheimnis)",
  "GET /metrics": "API-Kennzahlen",
  "GET /metrics.txt": "API-Kennzahlen im Prometheus-Format",
  "GET /audit": "API-Audit-Log (Admin)",
  "GET /logs": "Letzte Logzeilen",
  "GET /status": "Spieler und Charaktere",
  "GET /inventory": "Inventar-Kennzahlen",
  "GET /loadouts": "Loadout-Liste",
  "GET /loadout": "Loadout-Details",
  "GET /xur": "Xûr-Status und Angebote",
  "GET /summary": "Dashboard-Zusammenfassung",
  "GET /dashboard": "Alias für /summary",
  "GET /priorities": "Offene Aufgaben",
  "GET /weekly": "Weekly-Reset und Xûr",
  "GET /actions": "Letzte protokollierte Aktionen",
  "GET /checklist": "Wochen-Checkliste mit offenen Punkten",
  "GET /materials": "Materialien und Währungen",
  "GET /currencies": "Alias für /materials",
  "GET /postmaster": "Postfach-Inhalt je Charakter",
  "GET /reset": "Daily-/Weekly-Reset-Zeiten",
  "GET /version": "App-Version und API-Status",
  "GET /commands": "Diese Befehlsliste",
  "GET /changelog": "API-Changelog und Deprecation-Politik"
};

class D2LocalApi {
  constructor(baseUrl = 'http://127.0.0.1:7331', token = '') {
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.token = String(token || '');
  }

  url(pathname, params = {}) {
    const target = new URL(pathname, this.baseUrl + '/');
    for (const [key, value] of Object.entries(params)) {
      if (value != null) target.searchParams.set(key, String(value));
    }
    return target;
  }

  async request(pathname, { method = 'GET', params = {}, body = null, timeoutMs = 10000 } = {}) {
    const target = this.url(pathname, params);
    const headers = { Accept: 'application/json' };
    if (this.token) headers['X-D2-Token'] = this.token;
    if (body != null) headers['Content-Type'] = 'application/json';
    const response = await fetch(target, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    let value = null;
    try { value = JSON.parse(text); } catch (error) { value = { text }; }
    return { status: response.status, ok: response.ok && value && value.ok !== false, body: value };
  }

  get(pathname, params = {}) { return this.request(pathname, { params }); }
  post(pathname, body = null, params = {}) { return this.request(pathname, { method: 'POST', params, body }); }
  patch(pathname, body = null, params = {}) { return this.request(pathname, { method: 'PATCH', params, body }); }
  delete(pathname, params = {}) { return this.request(pathname, { method: 'DELETE', params }); }

  health() { return this.get('/health'); }
  state() { return this.get('/state'); }
  key(name, params = {}) { return this.get('/key/' + encodeURIComponent(name), params); }
  action(name, params = {}) { return this.get('/action/' + String(name).replace(/^\/+/, ''), params); }
  loadouts() { return this.get('/loadouts'); }
  applyLoadout(name) { return this.action('loadout', { name }); }
  checklist() { return this.get('/checklist'); }
  updateChecklist(id, patch) { return this.patch('/checklist/' + encodeURIComponent(id), patch); }
  deleteChecklist(id) { return this.delete('/checklist/' + encodeURIComponent(id)); }
  jobs() { return this.get('/jobs'); }
  job(id) { return this.get('/jobs/' + encodeURIComponent(id)); }
  cancelJob(id) { return this.post('/jobs/' + encodeURIComponent(id) + '/cancel'); }
  createToken(name, scope = 'action', days = 0) { return this.action('tokens/create', { name, scope, days }); }
  revokeToken(id) { return this.action('tokens/revoke', { id }); }
}

module.exports = { D2LocalApi, ENDPOINTS };
