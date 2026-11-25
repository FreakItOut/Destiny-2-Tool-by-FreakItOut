'use strict';

// ============================================================
// Konfiguration
// ============================================================
// Alles liegt in einer JSON-Datei im Benutzerprofil. Die Datei wird
// atomar geschrieben (tmp + rename), damit ein Absturz mitten im
// Speichern keine halbe Datei hinterlÃ¤sst.
// ============================================================

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app } = require('electron');

const DEFAULTS = {
  // Schema-Version für spätere Migrationen (wird bei jedem Speichern
  // auf den aktuellen Stand gesetzt).
  schemaVersion: 3,
  hotkey: 'Alt+D',
  clickThroughHotkey: 'Alt+Shift+D',
  postmasterHotkey: 'Alt+P',
  inventoryHotkey: 'Alt+I',
  overlay: {
    width: 88,
    height: 88,
    opacity: 0.96,
    monitor: 0,
    anchor: 'center',
    autoHideSeconds: 0,
    notes: '',
    // Mehrere Notiz-BlÃ¤tter (Raid-Callouts, Farming, ...).
    notesList: [],
    notesActive: '',
    // Optional: Notizen als .md-Dateien in einem Ordner (z. B. in
    // Dropbox/OneDrive). Leer = BlÃ¤tter in der Konfiguration.
    notesFolder: '',
    // Welche Elemente die Overlay-Leiste zeigt (alle an = Standard).
    showItems: {
      notes: true,
      dashboard: true,
      loadouts: true,
      lock: true,
      hide: true,
      exit: true,
      clock: true,
      session: true,
      activity: true,
      battery: true,
      bungie: true,
      focus: true
    },
    // Reihenfolge der Chips rechts in der Overlay-Leiste.
    chipOrder: ['clock', 'session', 'activity', 'battery'],
    // Gespeicherte Overlay-Layouts (Position/Größe/Chips …).
    profiles: [],
    // Skalierung nur im Overlay-Modus (4K/HiDPI, 1 = unverändert).
    scale: 1,
    // Kompakte Leiste während des Spiels (nur Icons/Chips).
    compact: false,
    minimal: true,
    // Randabstand beim Einrasten an Bildschirmkanten (Pixel).
    margin: 24,
    // Zuletzt genutztes Layout je Monitor (display.id → {width,height,anchor}).
    layouts: {},
    animation: 'normal',
    activityStatus: '',
    weeklySchedule: {}
  },
  gamepad: {
    enabled: true,
    // -1 = erster verbundener Controller, 0-3 = fester XInput-Index.
    // Ein zweiter Controller kann so exklusiv das Overlay steuern,
    // während Controller 1 das Spiel bedient (nur XInput-Lesen,
    // keine Eingaben an das Spiel).
    controllerIndex: -1,
    // Fokus-Wächter: off = nie erzwingen, open = nur direkt nach dem
    // Öffnen, always = dauerhaft (Standard).
    focusGuard: 'always',
    // Karenzzeit, bevor der Wächter den Fokus zurückholt (0–10000 ms).
    focusGuardGraceMs: 1500,
    // Steam Input übersetzt den Controller auf Tastatur/Maus; dann
    // zeigt das Overlay keine eingebaute Gamepad-Steuerung an.
    steamInputMode: false,
    // Taste für das Controller-Schnellmenü (0 = aus; Standard R3=11).
    quickMenuButton: 11,
    // Belegung der Richtungen im Schnellmenü (unten/oben/…).
    quickMenu: {
      popup: { top: 'to-vault', right: 'to-char', bottom: 'equip', left: 'favorite' },
      inventory: { top: 'loadout', right: 'keyboard', bottom: 'refresh', left: 'inventory' }
    },
    combo: [10, 11],
    guideToggle: true,
    // Einzelne Taste, die das Overlay ein-/ausblendet.
    // 0 = keine, 16 = Guide, 8 = View, 9 = Menu.
    // XInput meldet den Guide-Knopf bei Xbox-360-Pads leider nicht -
    // deshalb lÃ¤sst sich hier jede Taste wÃ¤hlen.
    toggleButton: 0,
    invertDpadScroll: false,
    // Scrollen mit dem zweiten Stick: Geschwindigkeit, Richtung und
    // eigene Deadzone (0 = globale Deadzone verwenden).
    scrollSpeed: 980,
    scrollInvert: false,
    scrollDeadzone: 0,
    speed: 900,
    deadzone: 0.2,
    curve: 'expo',
    leftHanded: false,
    rumble: true,
    hapticProfile: 'standard',
    // Controller-Profil automatisch je Bereich anwenden
    // (Inventar = präziser, Dashboard/Einstellungen = Standard).
    autoAreaProfile: false,
    // Rauschfilter fÃ¼r die Analog-Sticks. Manche Controller
    // (gÃ¼nstige Xbox-360-Kopien) liefern stark schwankende Werte.
    // 0 = aus, 1 = normal, 2 = stark.
    stickFilter: 1,
    // Ab welchem Trigger-Druckwert LT/RT scrollen (0-1).
    triggerThreshold: 0.35,
    // Defekte Achsen automatisch erkennen und abschalten.
    // Standard: aus - lieber dem Nutzer die Kalibrierung Ã¼berlassen.
    detectBrokenAxis: false,
    // Diagnosemodus: Rohreports und XInput-Masken werden ins Log
    // geschrieben. Hilfreich bei Controller-Problemen.
    diagnostics: false,
    // Kalibrierung der Analog-Sticks. Je Achse (0 = links X,
    // 1 = links Y, 2 = rechts X, 3 = rechts Y) werden Ruhepunkt,
    // Minimum und Maximum gespeichert. Ohne Kalibrierung werden die
    // Werte direkt verwendet.
    calibration: {
      center: [0, 0, 0, 0],
      min: [-1, -1, -1, -1],
      max: [1, 1, 1, 1]
    },
    // Achsen vertauschen (manche Controller liefern sie so).
    swapAxes: false,
    // Einmalige Umstellung: Die XInput-Brücke liefert Y positiv nach
    // oben, das Tool rechnet mit negativ. Wird beim Start einmalig
    // normalisiert (Kalibrierung/Umkehr-Schalter werden übernommen).
    axesNormalized: false,
    // Welcher Stick steuert den Cursor? "auto" wÃ¤hlt den stÃ¤rkeren
    // Ausschlag - bei einem defekten zweiten Stick fÃ¼hrt das dazu,
    // dass der Cursor von allein weglÃ¤uft. Standard: nur der linke.
    stickChoice: 'left',    // Achsen umkehren.
    invertX: false,
    invertY: false,
    // Belegung der einzelnen Tasten. Aktion -> Button-Index.
    // Fehlt eine Aktion, gilt der Standard.
    bindings: {
      click: 0,
      back: 1,
      reload: 2,
      precision: 3,
      categoryPrev: 4,
      categoryNext: 5,
      sitePrev: 14,
      siteNext: 15,
      settings: 8,
      hide: 9,
      // Neue Aktionen: standardmÃ¤ÃŸig nicht belegt (-1).
      notes: -1,
      pip: -1,
      unloadOthers: -1,
      hud: -1
    },
    // Feinsteuerung pro Webseite: siteId -> Deadzone (0.05-0.6).
    // Praktisch fÃ¼r DIM (kleine Deadzone fÃ¼r den prÃ¤zisen Cursor)
    // gegenÃ¼ber normalen Seiten. Fehlt eine Seite, gilt die globale
    // Deadzone (gamepad.deadzone).
    siteDeadzones: {},
    // Cursor-Magnet-Snap: der Controller-Cursor wird in die NÃ¤he
    // klickbarer OberflÃ¤chenelemente gezogen (nur Tool-UI, Webseiten
    // sind dafÃ¼r unsichtbar).
    cursorSnap: true,
    // XInput-Bridge: liest den Controller direkt unter Windows und
    // funktioniert dadurch auch ohne Fensterfokus (wichtig fÃ¼r das
    // Overlay Ã¼ber dem Spiel).
    xinput: true,
    // Overlay-Einzeltaste: kurzer Druck schaltet das Overlay, Halten
    // (>= 0,6 s) Ã¶ffnet die Einstellungen. Abschaltbar.
    toggleLongPressSettings: true,
    // Das Overlay holt sich aktiv den Fensterfokus. NÃ¶tig, damit
    // Klicks im Overlay sofort greifen; der Controller funktioniert
    // dank XInput-Bridge auch ohne Fokus.
    stealFocus: true
  },
  behavior: {
    closeToTray: true,
    startMinimized: false,
    startWithWindows: false,
    autoOverlayOnGame: false,
    // Nach dem Ausblenden den Fokus an Destiny 2 zurückgeben. Sonst
    // kann die Windows-Taskleiste über dem randlosen Vollbild bleiben.
    refocusGameOnOverlayHide: true,
    // Beim Spielstart Webseiten entladen (RAM sparen).
    gameModeOptimize: false,
    // Log-Stufe: debug | info | warn | error.
    logLevel: 'info',
    // Automatischer Aufräum-Vorschlag (Trockenlauf) an einem Wochentag.
    cleanupSchedule: { enabled: false, weekday: 0, time: '19:00', lastRun: '' },
    // Testmodus: Das Overlay-Kürzel öffnet das normale Fenster
    // statt des Overlays. Nur für Verhaltenstests gedacht.
    testOpenWindowOnHotkey: false,
    // Nach dem Start automatisch die letzte Sitzung wiederherstellen.
    autoRestoreSession: false,
    // Minimodus: nur die Webseite sichtbar (Strg+M / Palette / âœ•-Chip).
    overlayMini: false,
    // Click-Through automatisch zurÃ¼ckholen nach X Minuten (0 = aus).
    clickThroughAutoReset: 0,
    adBlock: true,
    readerMode: false,
    siteUsage: {},
    firstRunDone: false,
    gameLaunchUrl: 'steam://rungameid/1085660',
    // Grafikdiagnose: Bei AbstÃ¼rzen im Zusammenhang mit Grafiktreibern
    // (z. B. Video-TDR-Fehler) hilft es, die GPU-Beschleunigung von
    // Chromium abzuschalten. disableGpuAuto wird nach wiederholten
    // GPU-ProzessabstÃ¼rzen automatisch gesetzt.
    disableGpu: false,
    disableGpuAuto: false,
    gpuCrashCount: 0,
    // Alarm 15/5 Minuten vor Daily- und Weekly-Reset (Tray + Hinweis).
    resetAlarm: true,
    // Dazu einen kurzen Signalton abspielen.
    alarmSound: false,
    // Optional: eigene Sound-Datei (.wav/.mp3/.ogg) statt Standard-Beep.
    alarmSoundPath: '',
    // Globale Seiten-KÃ¼rzel (Strg+Alt+1..8): Ã¶ffnen Kategorien systemweit.
    globalSiteHotkeys: false,
    // LT/RT-Verhalten: 'scroll' = Standard (schnell scrollen), oder
    // ein Action-Key aus den Belegungen (z. B. 'pip', 'notes').
    triggerLeft: 'scroll',
    triggerRight: 'scroll',
    // Kurze Vibration bei Kategorie-/Seitenwechsel.
    hapticSwitch: false,
    // Low-Power-Modus (Laptops): Hintergrund-Timer werden nicht mehr
    // von der Drosselung befreit, Webseiten-Vorladen aus. Neustart nÃ¶tig.
    lowPower: false,
    // Ruhemodus: bis zu diesem Zeitpunkt (ms-Epochenzeit) werden
    // OberflÃ¤chen-Toasts und AlarmtÃ¶ne unterdrÃ¼ckt; Tray-Benachrich-
    // tigungen erscheinen weiterhin. 0 = aus.
    quietUntil: 0,
    // Tasten-Legende (HUD) im Fenster/Overlay anzeigen.
    showBindingHud: false,
    // Beim Start die native Dashboard-Seite zeigen statt der zuletzt
    // genutzten Webseite (ein Klick auf eine Kategorie lÃ¤dt die Seite).
    startOnDashboard: true
  },
  web: {
    // Inaktive Seiten nach X Minuten entladen (0 = nie).
    idleUnloadMinutes: 0,
    keepAlive: 4,
    zoom: 1,
    dark: true,
    readerMode: false,
    // Auto-Refresh pro Webseite: siteId -> Minuten (0/2/5/10).
    autoRefresh: {},
    // Seiten-Zoom pro Webseite: siteId -> Faktor (0.5-2).
    siteZoom: {},
    // Lesemodus pro Webseite: siteId -> true/false (Ãœberschreibt den
    // globalen Schalter; fehlt der Eintrag, gilt der globale Modus).
    readerSites: {},
    // Blocker-Ausnahmen pro Webseite: siteId -> true = Blocker AUS
    // fÃ¼r diese Seite (AdBlock bzw. Cookie-Banner-Blocker).
    adBlockOffSites: {},
    cookieOffSites: {}
  },
  // WÃ¶chentliche Challenge-Checkliste (auto-Reset am Dienstag-Reset).
  checklist: {
    items: [],
    week: ''
  },
  // PersÃ¶nliche Erinnerungen: Zeit + Text + Wiederholung.
  reminders: {
    list: []
  },
  // Konfig-Profile: vollstÃ¤ndige Snapshots zum Umschalten
  // (z. B. "Gaming-PC" / "Laptop").
  profiles: {
    items: [],
    active: ''
  },
  // Reihenfolge der Kategorien (Kategorie-IDs; fehlende hÃ¤ngen hinten).
  categoryOrder: [],
  // Zuletzt offene Seiten fÃ¼r die Sitzungs-Wiederherstellung.
  session: {
    siteIds: []
  },
  favorites: [],
  customSites: [],
  lastCategory: 'today',
  lastSite: {},
  // Eigene Akzentfarbe ('' = Kategorie-Farben verwenden) und
  // OberflÃ¤chen-Zoom (0.8-1.4).
  appearance: {
    accent: '',
    uiScale: 1,
    // Farbmodus für Rot/Grün-Schwäche (Godrolls/Stat-Differenzen).
    colorblind: false,
    // Hoher Kontrast für schwache Displays / Sehschwäche.
    highContrast: false,
    // UI-Sprache: de (Standard) oder en.
    uiLanguage: 'de',
    fontScale: 1,
    simpleMode: true,
    startView: 'dashboard',
    // Reduzierte Animationen für Bewegungsempfindlichkeit.
    reduceMotion: false,
    // TV-Modus: größere Schrift, mehr Kontrast, Fokus statt Hover.
    tvMode: false,
    // Lesefreundliche Darstellung (größere Abstände, klare Schrift).
    dyslexia: false,
    // Undurchsichtige Flächen (besserer Kontrast, weniger GPU-Last).
    solidUi: false,
    // Streamer-/Privatsphäre-Modus: Namen und IDs ausblenden.
    streamerMode: false
  },
  // Backups: optionaler Zielordner (z. B. OneDrive/Dropbox).
  backups: {
    folder: '',
    keep: 8
  },
  // Sicherheit: Read-only-Modus und optionaler PIN (nur Hash/Salt).
  security: {
    readOnly: false,
    pinHash: '',
    pinSalt: '',
    autoLockMinutes: 0
  },
  // Einrichtungs-Assistent: einmalig beim ersten Start.
  onboardingDone: false,
  // Dashboard-Personalisierung: ausgeblendete Karten + Preset.
  dashboardHidden: [],
  dashboardOrder: [],
  dashboardPreset: 'all',
  quickActionsHidden: [],
  // Automatisches, mit Windows safeStorage verschlüsseltes Backup.
  backup: { autoEncrypted: true },
  // Kurze Coach-Marks im Dashboard.
  tourDone: false,
  // Windows-Benachrichtigungen (Regeln + Ruhezeit).
  notifications: {
    // Sprachausgabe für Benachrichtigungen (Windows-Stimme).
    tts: false,
    enabled: true,
    postmaster: true,
    xur: true,
    reset: true,
    godroll: true,
    suppressDuringActivity: true,
    quietStart: '23:00',
    quietEnd: '07:00',
    rules: []
  },
  // Lokale Integrationen: Stream-Deck-API (nur 127.0.0.1) und Discord-Webhook.
  integrations: {
    localApi: {
      enabled: false,
      port: 7331,
      token: '',
      tokenEnc: '',
      readOnlyToken: '',
      readOnlyTokenEnc: '',
      tokens: [],
      lan: false,
      allowedOrigins: [],
      rateLimit: 120,
      allowQueryToken: true,
      lanIpAllowlist: [],
      requireLanHmac: false
    },
    webhook: { enabled: false, url: '', secret: '', events: ['notification'] },
    discordWebhook: '',
    digestSchedule: { enabled: false, weekday: 2, time: '18:05' },
    digestLastSent: ''
  },
  // Bild-in-Bild-Fenster: letzte Position/GrÃ¶ÃŸe.
  pip: {
    bounds: null
  },
  // Poststellen-Zähler: kleines, immer sichtbares Fenster.
  postmaster: {
    enabled: false,
    bounds: null,
    opacity: 0.95,
    compact: false,
    lock: false,
    autoGame: false,
    theme: 'dark',
    refreshSeconds: 90,
    inventoryOnly: false
  },
  // Session-Statistiken: aktive Minuten pro Tag (YYYY-MM-DD -> Minuten).
  stats: {
    days: {},
    // Optionales Wochenziel in Minuten (0 = aus).
    weeklyGoal: 0
  },
  // Bungie-API (optional): Key + Bungie-Name fÃ¼r die Ã¶ffentlichen
  // Profildaten (Lichtlevel, Klasse, zuletzt gespielt) im Dashboard.
  // origin: die Website/Origin, auf die der Key im Entwicklerportal
  // registriert ist ('' = Standard https://localhost).
  // oauth: Token der Bungie-Anmeldung (Stufe 1) - nur lokal gespeichert.
  bungie: {
    apiKey: '',
    playerName: '',
    contentLanguage: 'de',
    origin: '',
    oauthClientId: '',
    // Gespeicherte Inventar-Suchen (Chips unter dem Suchfeld).
    savedSearches: [],
    // Gespeicherte Filter-Ansichten (Name + Suchausdruck).
    savedViews: [],
    // Beobachtete Waffen (Benachrichtigung bei neuem Fund).
    watchlist: [],
    // Gewichte für den Godroll-Score (global + pro Perk).
    godrollWeights: {},
    // Ordner für Loadouts (Name/ID).
    loadoutFolders: [],
    // Diese Felder werden normalisiert, müssen aber in DEFAULTS stehen –
    // sonst verwirft mergeKnown(DEFAULTS, raw) sie bei JEDEM Speichern
    // (Loadouts, Favoriten, Sortierung, Wunschliste).
    wishlistUrl: '',
    useD2Checklist: true,
    // Godroll-Strenge: exact = alle Wishlist-Perks, traits = Lauf/Mag
    // ignorieren, fast = ein fehlender Perk zählt als Godroll.
    godrollMode: 'exact',
    // Vom Nutzer akzeptierte Fast-Godrolls (Instanz-IDs).
    acceptedNear: [],
    // Mindestanzahl passender Perks pro Wunschregel (1–4, „3 von 4“).
    wishlistMinMatch: 4,
    // Eigene Wunschregeln aus dem Editor (Item-Hash + Perk-Hashes).
    customWishlist: [],
    // Rüstungs-Wunschregeln (Archetyp, Tertiär, Tuning, Mindestwerte, Set).
    armorWishlist: [],
    // Xûr-Historie (letzte Wochen) für „neu/nicht mehr“-Hinweise.
    xurHistory: [],
    loadouts: [],
    // Nutzung der Tool-Loadouts: id → { applies, lastUsedAt }.
    loadoutStats: {},
    // Versionen pro Loadout (max. 5 Schnappschüsse).
    loadoutVersions: {},
    // Favorisierte Loadouts (id → true).
    loadoutFavs: {},
    itemSort: 'power',
    favs: {},
    // Eigene Notizen pro Item-Instanz (max. 500 Einträge, je 300 Zeichen).
    itemNotes: {},
    // Material-Ziele: itemHash → Zielmenge (max. 20).
    materialGoals: {},
    // Session-Ziele, Händler-Historie und Geheimtruhen.
    sessionGoals: [],
    vendorHistory: {},
    // Zeitstempel und Diff der letzten Händler-Abrufe:
    // hash → { at, count, prevAt, prevCount, newHashes, removedHashes }.
    vendorHistoryMeta: {},
    secretChests: {},
    encounterTracker: {},
    // Loot-Ziele: Wunsch-Item-Namen für die Rotation (max. 30).
    lootGoals: [],
    // Item-Tags (behalten/aussortieren/PvE/PvP/Godroll/Infusion).
    itemTags: {},
    // Eigene Ordner (max. 20) und Zuordnung pro Item.
    folders: [],
    itemFolders: {},
    // Inventar-Dichte: comfortable (Standard) oder compact.
    inventoryDensity: 'comfortable',
    // Client-Secret (nur für „vertrauliche“ Apps im Bungie-Portal).
    // Wird wie die Tokens mit safeStorage verschlüsselt gespeichert.
    oauthClientSecretEnc: '',
    // API-Key (verschlüsselt; Klartext wird beim Start migriert).
    apiKeyEnc: '',
    oauth: {
      accessToken: '',
      refreshToken: '',
      accessTokenEnc: '',
      refreshTokenEnc: '',
      expiresAt: 0,
      bnetMembershipId: '',
      displayName: '',
      destinyMembershipId: '',
      destinyMembershipType: 0,
      scope: ''
    }
  },
  window: {
    bounds: null
  },
  xur: {
    bounds: null,
    remind: false
  },
  statsHud: {
    bounds: null,
    showActivity: true,
    showChampions: true
  }
};

const ANCHORS = new Set(['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);

let data = clone(DEFAULTS);
let configFile = '';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function mergeKnown(base, patch) {
  const out = clone(base);
  if (!isPlainObject(patch)) return out;
  for (const key of Object.keys(base)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const baseValue = base[key];
    const patchValue = patch[key];
    if (isPlainObject(baseValue)) {
      if (!isPlainObject(patchValue)) continue;
      // Objekte ohne feste SchlÃ¼ssel (z. B. lastSite) Ã¼bernehmen
      // die EintrÃ¤ge des Patches vollstÃ¤ndig. Sonst wÃ¼rden neue
      // Kategorien beim Speichern verloren gehen.
      if (Object.keys(baseValue).length === 0) out[key] = clone(patchValue);
      else out[key] = mergeKnown(baseValue, patchValue);
    } else if (Array.isArray(baseValue)) {
      if (Array.isArray(patchValue)) out[key] = clone(patchValue);
    } else if (baseValue === null) {
      if (patchValue === null || isPlainObject(patchValue)) out[key] = clone(patchValue);
    } else if (typeof patchValue === typeof baseValue) {
      out[key] = patchValue;
    }
  }
  return out;
}

function validAccelerator(value) {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (value.length > 60) return false;
  return /^(?:(?:Ctrl|Alt|Shift|Super)\+)*(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Up|Down|Left|Right|Space|Tab|Enter|Backspace|Delete|Home|End|PageUp|PageDown|Insert)$/.test(value);
}

function validGameUrl(value) {
  if (typeof value !== 'string' || !value) return DEFAULTS.behavior.gameLaunchUrl;
  try {
    const url = new URL(value);
    if (['steam:', 'com.epicgames.launcher:', 'https:', 'http:'].includes(url.protocol)) return value;
  } catch (error) {
    // ungÃ¼ltig
  }
  return DEFAULTS.behavior.gameLaunchUrl;
}

function sanitizeCustomSites(sites) {
  if (!Array.isArray(sites)) return [];
  const seen = new Set();
  const result = [];
  for (const site of sites) {
    if (!isPlainObject(site)) continue;
    const id = String(site.id || '').trim();
    const name = String(site.name || '').trim().slice(0, 80);
    const url = String(site.url || '').trim();
    const category = String(site.category || 'custom').trim();
    if (!id || !name || !/^https?:\/\//i.test(url)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id: id.slice(0, 80), name, url: url.slice(0, 2000), category });
    if (result.length >= 100) break;
  }
  return result;
}

const CURRENT_SCHEMA = 3;
function migrateConfig(raw) {
  const out = raw && typeof raw === 'object' ? { ...raw } : {};
  const version = Number(out.schemaVersion) || 1;
  if (version < 2) {
    // Alte Konfigurationen hatten noch keine Overlay-Profile/ShowItems.
    out.overlay = out.overlay && typeof out.overlay === 'object' ? out.overlay : {};
  }
  if (version < 3) {
    // Schema 3: Loadout-Schnellzugriff und Kompaktmodus sind bekannt.
    out.overlay = out.overlay && typeof out.overlay === 'object' ? out.overlay : {};
    if (!out.overlay.showItems || typeof out.overlay.showItems !== 'object') out.overlay.showItems = {};
    if (out.overlay.showItems.loadouts == null) out.overlay.showItems.loadouts = true;
    if (out.overlay.compact == null) out.overlay.compact = false;
  }
  out.schemaVersion = CURRENT_SCHEMA;
  return out;
}

function normalize(raw) {
  const merged = mergeKnown(DEFAULTS, migrateConfig(raw));

  if (!validAccelerator(merged.hotkey)) merged.hotkey = DEFAULTS.hotkey;
  if (!validAccelerator(merged.clickThroughHotkey)) merged.clickThroughHotkey = DEFAULTS.clickThroughHotkey;
  if (!validAccelerator(merged.postmasterHotkey)) merged.postmasterHotkey = DEFAULTS.postmasterHotkey;
  if (!validAccelerator(merged.inventoryHotkey)) merged.inventoryHotkey = DEFAULTS.inventoryHotkey;

  merged.overlay.width = Math.round(clamp(merged.overlay.width, 30, 100, DEFAULTS.overlay.width));
  merged.overlay.height = Math.round(clamp(merged.overlay.height, 30, 100, DEFAULTS.overlay.height));
  merged.overlay.opacity = clamp(merged.overlay.opacity, 0.4, 1, DEFAULTS.overlay.opacity);
  // -1 = automatisch (Monitor des Spiels), sonst fester Monitor-Index.
  merged.overlay.monitor = Math.round(clamp(merged.overlay.monitor, -1, 15, 0));
  if (!ANCHORS.has(merged.overlay.anchor)) merged.overlay.anchor = DEFAULTS.overlay.anchor;
  merged.overlay.scale = Math.round(clamp(merged.overlay.scale, 0.8, 1.4, DEFAULTS.overlay.scale) * 100) / 100;
  merged.overlay.compact = merged.overlay.compact === true;
  merged.overlay.margin = Math.round(clamp(merged.overlay.margin, 0, 200, DEFAULTS.overlay.margin));
  if (!isPlainObject(merged.overlay.layouts)) merged.overlay.layouts = {};
  for (const [key, layout] of Object.entries(merged.overlay.layouts)) {
    if (!isPlainObject(layout)) {
      delete merged.overlay.layouts[key];
      continue;
    }
    const entry = {
      width: Math.round(clamp(layout.width, 30, 100, DEFAULTS.overlay.width)),
      height: Math.round(clamp(layout.height, 30, 100, DEFAULTS.overlay.height)),
      anchor: ANCHORS.has(layout.anchor) ? layout.anchor : DEFAULTS.overlay.anchor
    };
    merged.overlay.layouts[key] = entry;
  }
  merged.overlay.autoHideSeconds = Math.round(clamp(merged.overlay.autoHideSeconds, 0, 300, 0));
  if (!['none', 'fast', 'normal'].includes(merged.overlay.animation)) merged.overlay.animation = DEFAULTS.overlay.animation;

  // Notiz-BlÃ¤tter: Liste von {id, name, text}. Bei Migration aus der
  // alten einzelnen Notiz (overlay.notes) entsteht ein Blatt "Notizen".
  const rawNotes = Array.isArray(merged.overlay.notesList) ? merged.overlay.notesList : [];
  const nextNotes = [];
  for (const entry of rawNotes) {
    if (nextNotes.length >= 12) break;
    if (!entry || typeof entry !== 'object') continue;
    const id = String(entry.id || '').slice(0, 40);
    if (!id || nextNotes.some((note) => note.id === id)) continue;
    nextNotes.push({
      id,
      name: String(entry.name || 'Notiz').slice(0, 30) || 'Notiz',
      text: String(entry.text || '').slice(0, 20000)
    });
  }
  if (!nextNotes.length && typeof merged.overlay.notes === 'string' && merged.overlay.notes.trim()) {
    nextNotes.push({ id: 'n-' + Date.now().toString(36), name: 'Notizen', text: merged.overlay.notes.slice(0, 20000) });
  }
  merged.overlay.notesList = nextNotes;
  const notesActive = String(merged.overlay.notesActive || '');
  merged.overlay.notesActive = nextNotes.some((note) => note.id === notesActive)
    ? notesActive
    : (nextNotes[0] ? nextNotes[0].id : '');
  // Notizen-Ordner: nur plausible Windows-Pfade zulassen (Auswahl
  // erfolgt Ã¼ber den Ordner-Dialog, hier nur Grobreinigung).
  merged.overlay.notesFolder = String(merged.overlay.notesFolder || '').slice(0, 260);

  const combo = Array.isArray(merged.gamepad.combo)
    ? merged.gamepad.combo.map((n) => Math.round(Number(n))).filter((n) => Number.isInteger(n) && n >= 0 && n <= 16)
    : [];
  merged.gamepad.combo = [...new Set(combo)].slice(0, 4);
  if (merged.gamepad.combo.length === 0) merged.gamepad.combo = [...DEFAULTS.gamepad.combo];
  merged.gamepad.enabled = merged.gamepad.enabled !== false;
  merged.gamepad.controllerIndex = Math.round(clamp(merged.gamepad.controllerIndex, -1, 3, -1));
  if (!['off', 'open', 'always'].includes(merged.gamepad.focusGuard)) merged.gamepad.focusGuard = DEFAULTS.gamepad.focusGuard;
  merged.gamepad.focusGuardGraceMs = Math.round(clamp(merged.gamepad.focusGuardGraceMs, 0, 10000, DEFAULTS.gamepad.focusGuardGraceMs));
  merged.gamepad.steamInputMode = merged.gamepad.steamInputMode === true;
  merged.gamepad.quickMenuButton = Math.round(clamp(merged.gamepad.quickMenuButton, 0, 16, DEFAULTS.gamepad.quickMenuButton));
  const qmActions = new Set(['to-vault', 'to-char', 'favorite', 'equip', 'loadout', 'keyboard', 'refresh', 'inventory', 'close']);
  const normalizeQuickMenu = (raw, fallback) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const base = fallback || {};
    const out = {};
    for (const direction of ['top', 'right', 'bottom', 'left']) {
      const value = String(source[direction] || '');
      out[direction] = qmActions.has(value) ? value : (base[direction] || 'close');
    }
    return out;
  };
  const qmRaw = merged.gamepad.quickMenu && typeof merged.gamepad.quickMenu === 'object' ? merged.gamepad.quickMenu : {};
  merged.gamepad.quickMenu = {
    popup: normalizeQuickMenu(qmRaw.popup, DEFAULTS.gamepad.quickMenu.popup),
    inventory: normalizeQuickMenu(qmRaw.inventory, DEFAULTS.gamepad.quickMenu.inventory)
  };
  merged.gamepad.guideToggle = merged.gamepad.guideToggle !== false;
  merged.gamepad.toggleButton = Math.round(clamp(merged.gamepad.toggleButton, 0, 16, DEFAULTS.gamepad.toggleButton));
  merged.gamepad.invertDpadScroll = merged.gamepad.invertDpadScroll === true;
  merged.gamepad.scrollSpeed = Math.round(clamp(merged.gamepad.scrollSpeed, 150, 3000, DEFAULTS.gamepad.scrollSpeed));
  merged.gamepad.scrollInvert = merged.gamepad.scrollInvert === true;
  merged.gamepad.scrollDeadzone = clamp(merged.gamepad.scrollDeadzone, 0, 0.6, 0);
  merged.gamepad.speed = Math.round(clamp(merged.gamepad.speed, 150, 3000, DEFAULTS.gamepad.speed));
  merged.gamepad.deadzone = clamp(merged.gamepad.deadzone, 0.05, 0.6, DEFAULTS.gamepad.deadzone);
  merged.gamepad.curve = merged.gamepad.curve === 'linear' ? 'linear' : 'expo';
  merged.gamepad.stickFilter = Math.round(clamp(merged.gamepad.stickFilter, 0, 2, DEFAULTS.gamepad.stickFilter));
  merged.gamepad.detectBrokenAxis = merged.gamepad.detectBrokenAxis === true;
  merged.gamepad.diagnostics = merged.gamepad.diagnostics === true;
  merged.gamepad.swapAxes = merged.gamepad.swapAxes === true;
  merged.gamepad.axesNormalized = merged.gamepad.axesNormalized === true;
  merged.gamepad.stickChoice = ['left', 'right', 'auto'].includes(merged.gamepad.stickChoice)
    ? merged.gamepad.stickChoice
    : DEFAULTS.gamepad.stickChoice;
  merged.gamepad.invertX = merged.gamepad.invertX === true;
  merged.gamepad.invertY = merged.gamepad.invertY === true;

  // Kalibrierung: je Achse Ruhepunkt, Minimum und Maximum.
  const calibration = merged.gamepad.calibration && typeof merged.gamepad.calibration === 'object' ? merged.gamepad.calibration : {};
  const axisValue = (list, index, fallback) => {
    const source = Array.isArray(list) ? list : [];
    const value = Number(source[index]);
    if (!Number.isFinite(value)) return fallback;
    return clamp(value, -1.5, 1.5, fallback);
  };
  merged.gamepad.calibration = {
    center: [0, 1, 2, 3].map((i) => axisValue(calibration.center, i, 0)),
    min: [0, 1, 2, 3].map((i) => axisValue(calibration.min, i, -1)),
    max: [0, 1, 2, 3].map((i) => axisValue(calibration.max, i, 1))
  };

  // Tastenbelegung: Aktion -> Button-Index. -1 = nicht belegt.
  // Achtung: 0 ist eine gueltige Taste (A)! "Nicht belegt" muss -1
  // sein, sonst laesst sich die A-Taste nicht zuweisen.
  const BINDING_KEYS = ['click', 'back', 'reload', 'precision', 'categoryPrev', 'categoryNext', 'sitePrev', 'siteNext', 'settings', 'hide', 'notes', 'pip', 'unloadOthers', 'hud'];
  const bindings = merged.gamepad.bindings && typeof merged.gamepad.bindings === 'object' ? merged.gamepad.bindings : {};
  const nextBindings = {};
  for (const key of BINDING_KEYS) {
    const value = Number(bindings[key]);
    // Alter Stand: 0 bedeutete "nicht belegt" - dabei ist 0 die
    // A-Taste. Fehlt der Schluessel, gilt der Standard.
    const hasKey = bindings !== null && Object.prototype.hasOwnProperty.call(bindings, key);
    if (!hasKey) {
      nextBindings[key] = DEFAULTS.gamepad.bindings[key];
    } else if (Number.isInteger(value) && value >= -1 && value <= 16) {
      nextBindings[key] = value === 0 ? 0 : value;
    } else {
      nextBindings[key] = DEFAULTS.gamepad.bindings[key];
    }
  }
  merged.gamepad.bindings = nextBindings;
  merged.gamepad.leftHanded = merged.gamepad.leftHanded === true;
  merged.gamepad.rumble = merged.gamepad.rumble !== false;
  merged.gamepad.hapticProfile = ['off', 'soft', 'standard', 'strong'].includes(String(merged.gamepad.hapticProfile)) ? String(merged.gamepad.hapticProfile) : 'standard';
  merged.gamepad.xinput = merged.gamepad.xinput !== false;
  merged.gamepad.stealFocus = merged.gamepad.stealFocus !== false;

  // Deadzone-Profile pro Webseite: Zahl 0.05-0.6, maximal 60 EintrÃ¤ge.
  const deadzones = merged.gamepad.siteDeadzones && typeof merged.gamepad.siteDeadzones === 'object'
    ? merged.gamepad.siteDeadzones
    : {};
  const nextDeadzones = {};
  let deadzoneCount = 0;
  for (const [key, value] of Object.entries(deadzones)) {
    if (deadzoneCount >= 60) break;
    const id = String(key).slice(0, 80);
    if (!id) continue;
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      nextDeadzones[id] = clamp(num, 0.05, 0.6);
      deadzoneCount += 1;
    }
  }
  merged.gamepad.siteDeadzones = nextDeadzones;
  // Cursor-Magnet-Snap an/aus.
  merged.gamepad.cursorSnap = merged.gamepad.cursorSnap !== false;
  merged.gamepad.triggerLeft = ['scroll'].includes(merged.gamepad.triggerLeft) || BINDING_KEYS.includes(merged.gamepad.triggerLeft) ? merged.gamepad.triggerLeft : 'scroll';
  merged.gamepad.triggerRight = ['scroll'].includes(merged.gamepad.triggerRight) || BINDING_KEYS.includes(merged.gamepad.triggerRight) ? merged.gamepad.triggerRight : 'scroll';
  merged.gamepad.hapticSwitch = merged.gamepad.hapticSwitch === true;
  // Trigger-Schwelle: 0.05-0.9 (0.35 = Standard).
  const triggerThreshold = Number(merged.gamepad.triggerThreshold);
  merged.gamepad.triggerThreshold = Number.isFinite(triggerThreshold)
    ? Math.max(0.05, Math.min(0.9, triggerThreshold))
    : 0.35;
  merged.gamepad.toggleLongPressSettings = merged.gamepad.toggleLongPressSettings !== false;

  merged.web.keepAlive = Math.round(clamp(merged.web.keepAlive, 1, 8, DEFAULTS.web.keepAlive));
  merged.web.idleUnloadMinutes = Math.round(clamp(merged.web.idleUnloadMinutes, 0, 240, 0));
  merged.web.zoom = clamp(merged.web.zoom, 0.5, 2, DEFAULTS.web.zoom);
  merged.web.dark = merged.web.dark !== false;
  merged.web.readerMode = merged.web.readerMode === true || merged.behavior.readerMode === true;
  // Auto-Refresh pro Webseite: siteId -> Minuten (0/2/5/10/15/30).
  const rawAutoRefresh = merged.web.autoRefresh && typeof merged.web.autoRefresh === 'object' ? merged.web.autoRefresh : {};
  const nextAutoRefresh = {};
  let autoRefreshCount = 0;
  for (const [key, value] of Object.entries(rawAutoRefresh)) {
    if (autoRefreshCount >= 40) break;
    const id = String(key).slice(0, 80);
    if (!id) continue;
    const minutes = Math.round(Number(value) || 0);
    if (minutes > 0) {
      nextAutoRefresh[id] = Math.min(60, minutes);
      autoRefreshCount += 1;
    }
  }
  merged.web.autoRefresh = nextAutoRefresh;
  // Seiten-Zoom pro Webseite: Faktor 0.5-2, maximal 60 EintrÃ¤ge.
  const rawSiteZoom = merged.web.siteZoom && typeof merged.web.siteZoom === 'object' ? merged.web.siteZoom : {};
  const nextSiteZoom = {};
  let siteZoomCount = 0;
  for (const [key, value] of Object.entries(rawSiteZoom)) {
    if (siteZoomCount >= 60) break;
    const id = String(key).slice(0, 80);
    if (!id) continue;
    const factor = Number(value);
    if (Number.isFinite(factor) && factor > 0) {
      nextSiteZoom[id] = Math.round(clamp(factor, 0.5, 2, 1) * 100) / 100;
      siteZoomCount += 1;
    }
  }
  merged.web.siteZoom = nextSiteZoom;
  // Lesemodus pro Webseite: siteId -> bool, maximal 60 EintrÃ¤ge.
  const rawReaderSites = merged.web.readerSites && typeof merged.web.readerSites === 'object' ? merged.web.readerSites : {};
  const nextReaderSites = {};
  let readerSiteCount = 0;
  for (const [key, value] of Object.entries(rawReaderSites)) {
    if (readerSiteCount >= 60) break;
    const id = String(key).slice(0, 80);
    if (!id) continue;
    nextReaderSites[id] = value === true;
    readerSiteCount += 1;
  }
  merged.web.readerSites = nextReaderSites;
  // Blocker-Ausnahmen pro Webseite (bool-Maps).
  const sanitizeBoolMap = (source) => {
    const raw = source && typeof source === 'object' ? source : {};
    const result = {};
    let count = 0;
    for (const [key, value] of Object.entries(raw)) {
      if (count >= 60) break;
      const id = String(key).slice(0, 80);
      if (!id) continue;
      result[id] = value === true;
      count += 1;
    }
    return result;
  };
  merged.web.adBlockOffSites = sanitizeBoolMap(merged.web.adBlockOffSites);
  merged.web.cookieOffSites = sanitizeBoolMap(merged.web.cookieOffSites);

  // WÃ¶chentliche Challenge-Checkliste.
  if (!isPlainObject(merged.checklist)) merged.checklist = { items: [], week: '' };
  const rawItems = Array.isArray(merged.checklist.items) ? merged.checklist.items : [];
  const nextItems = [];
  for (const entry of rawItems) {
    if (nextItems.length >= 80) break;
    if (!entry || typeof entry !== 'object') continue;
    const text = String(entry.text || '').slice(0, 80).trim();
    if (!text) continue;
    const item = {
      id: String(entry.id || '').slice(0, 40) || ('c' + nextItems.length),
      text,
      done: entry.done === true
    };
    if (entry.auto === true) {
      item.auto = true;
      item.autoKey = String(entry.autoKey || '').slice(0, 40);
      item.week = String(entry.week || '').slice(0, 10);
      if (['must', 'rec', 'opt', 'own'].includes(entry.group)) item.group = entry.group;
      item.hint = String(entry.hint || '').slice(0, 160);
    } else if (['must', 'rec', 'opt', 'own'].includes(entry.group)) {
      item.group = entry.group;
    }
    nextItems.push(item);
  }
  merged.checklist = {
    items: nextItems,
    week: String(merged.checklist.week || '').slice(0, 10)
  };

  // PersÃ¶nliche Erinnerungen.
  if (!isPlainObject(merged.reminders)) merged.reminders = { list: [] };
  const rawReminders = Array.isArray(merged.reminders.list) ? merged.reminders.list : [];
  const nextReminders = [];
  for (const entry of rawReminders) {
    if (nextReminders.length >= 20) break;
    if (!entry || typeof entry !== 'object') continue;
    const text = String(entry.text || '').slice(0, 80).trim();
    const time = String(entry.time || '').trim();
    const repeat = ['once', 'daily', 'weekly', 'onstart'].includes(entry.repeat) ? entry.repeat : 'once';
    // 'onstart'-Erinnerungen brauchen keine Uhrzeit.
    if (!text) continue;
    if (repeat !== 'onstart' && !/^\d{2}:\d{2}$/.test(time)) continue;
    nextReminders.push({
      id: String(entry.id || '').slice(0, 40) || ('r' + nextReminders.length),
      text,
      time: repeat === 'onstart' ? '' : time,
      repeat,
      weekday: repeat === 'weekly' ? Math.round(clamp(Number(entry.weekday) || 1, 0, 6, 1)) : 0,
      lastFired: String(entry.lastFired || '').slice(0, 10)
    });
  }
  merged.reminders = { list: nextReminders };

  // Konfig-Profile: Snapshots (ohne das profiles-Feld selbst).
  if (!isPlainObject(merged.profiles)) merged.profiles = { items: [], active: '' };
  const rawProfiles = Array.isArray(merged.profiles.items) ? merged.profiles.items : [];
  const nextProfiles = [];
  for (const entry of rawProfiles) {
    if (nextProfiles.length >= 10) break;
    if (!entry || typeof entry !== 'object' || !isPlainObject(entry.data)) continue;
    nextProfiles.push({
      id: String(entry.id || '').slice(0, 40) || ('p' + nextProfiles.length),
      name: String(entry.name || 'Profil').slice(0, 30) || 'Profil',
      data: entry.data
    });
  }
  merged.profiles = {
    items: nextProfiles,
    active: String(merged.profiles.active || '').slice(0, 40)
  };

  // Kategorie-Reihenfolge: nur bekannte IDs als Strings, max. 20.
  const rawOrder = Array.isArray(merged.categoryOrder) ? merged.categoryOrder : [];
  merged.categoryOrder = rawOrder
    .map((id) => String(id || '').slice(0, 40))
    .filter((id) => id)
    .slice(0, 20);

  merged.behavior.closeToTray = merged.behavior.closeToTray !== false;
  merged.behavior.startMinimized = merged.behavior.startMinimized === true;
  merged.behavior.startWithWindows = merged.behavior.startWithWindows === true;
  merged.behavior.autoOverlayOnGame = merged.behavior.autoOverlayOnGame === true;
  merged.behavior.refocusGameOnOverlayHide = merged.behavior.refocusGameOnOverlayHide !== false;
  merged.behavior.gameModeOptimize = merged.behavior.gameModeOptimize === true;
  merged.behavior.logLevel = ['debug', 'info', 'warn', 'error'].includes(merged.behavior.logLevel)
    ? merged.behavior.logLevel
    : 'info';
  const cleanupSchedule = merged.behavior.cleanupSchedule && typeof merged.behavior.cleanupSchedule === 'object'
    ? merged.behavior.cleanupSchedule
    : {};
  merged.behavior.cleanupSchedule = {
    enabled: cleanupSchedule.enabled === true,
    weekday: Math.max(0, Math.min(6, Math.round(Number(cleanupSchedule.weekday) || 0))),
    time: /^\d{2}:\d{2}$/.test(String(cleanupSchedule.time || '')) ? String(cleanupSchedule.time) : '19:00',
    lastRun: String(cleanupSchedule.lastRun || '').slice(0, 10)
  };
  merged.behavior.adBlock = merged.behavior.adBlock !== false;
  merged.behavior.readerMode = merged.behavior.readerMode === true;
  merged.behavior.firstRunDone = merged.behavior.firstRunDone === true;
  merged.behavior.gameLaunchUrl = validGameUrl(merged.behavior.gameLaunchUrl);
  merged.behavior.disableGpu = merged.behavior.disableGpu === true;
  merged.behavior.disableGpuAuto = merged.behavior.disableGpuAuto === true;
  const gpuCrashCount = Math.round(Number(merged.behavior.gpuCrashCount) || 0);
  merged.behavior.gpuCrashCount = Number.isFinite(gpuCrashCount) ? Math.max(0, Math.min(50, gpuCrashCount)) : 0;
  merged.behavior.resetAlarm = merged.behavior.resetAlarm !== false;
  merged.behavior.alarmSound = merged.behavior.alarmSound === true;
  merged.behavior.alarmSoundPath = String(merged.behavior.alarmSoundPath || '').trim().slice(0, 260);
  merged.behavior.lowPower = merged.behavior.lowPower === true;
  merged.behavior.showBindingHud = merged.behavior.showBindingHud === true;
  merged.behavior.startOnDashboard = merged.behavior.startOnDashboard !== false;
  merged.behavior.globalSiteHotkeys = merged.behavior.globalSiteHotkeys === true;
  merged.behavior.autoRestoreSession = merged.behavior.autoRestoreSession === true;
  merged.behavior.overlayMini = merged.behavior.overlayMini === true;
  const ctAutoReset = Math.round(Number(merged.behavior.clickThroughAutoReset) || 0);
  merged.behavior.clickThroughAutoReset = Number.isFinite(ctAutoReset) ? Math.max(0, Math.min(30, ctAutoReset)) : 0;
  // Ruhemodus: Zeitstempel in der Zukunft (max. 24 h) oder 0.
  const quietUntil = Math.round(Number(merged.behavior.quietUntil) || 0);
  merged.behavior.quietUntil = Number.isFinite(quietUntil) && quietUntil > 0
    ? Math.min(quietUntil, Date.now() + 24 * 60 * 60 * 1000)
    : 0;

  merged.customSites = sanitizeCustomSites(merged.customSites);
  if (!Array.isArray(merged.favorites)) merged.favorites = [];
  merged.favorites = [...new Set(merged.favorites.filter((id) => typeof id === 'string' && id.length <= 80))].slice(0, 24);

  if (typeof merged.lastCategory !== 'string' || !merged.lastCategory) merged.lastCategory = 'today';
  if (!isPlainObject(merged.lastSite)) merged.lastSite = {};
  const lastSite = {};
  for (const [key, value] of Object.entries(merged.lastSite)) {
    if (typeof value === 'string') lastSite[String(key).slice(0, 80)] = value.slice(0, 80);
  }
  merged.lastSite = lastSite;

  // Eigene Akzentfarbe: nur gÃ¼ltige Hex-Farben erlauben.
  if (!isPlainObject(merged.appearance)) merged.appearance = { accent: '', uiScale: 1, colorblind: false, highContrast: false, uiLanguage: 'de' };
  const accent = String(merged.appearance.accent || '').trim();
  const uiScale = Number(merged.appearance.uiScale);
  const uiLanguage = String(merged.appearance.uiLanguage || '').toLowerCase() === 'en' ? 'en' : 'de';
  merged.appearance = {
    accent: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '',
    uiScale: Number.isFinite(uiScale) ? Math.round(clamp(uiScale, 0.8, 1.4, 1) * 100) / 100 : 1,
    colorblind: merged.appearance.colorblind === true,
    highContrast: merged.appearance.highContrast === true,
    uiLanguage,
    fontScale: Math.max(0.85, Math.min(1.3, Number(merged.appearance.fontScale) || 1)),
    simpleMode: merged.appearance.simpleMode !== false,
    startView: ['dashboard', 'inventory', 'last', 'today'].includes(String(merged.appearance.startView)) ? String(merged.appearance.startView) : 'dashboard',
    reduceMotion: merged.appearance.reduceMotion === true,
    tvMode: merged.appearance.tvMode === true,
    dyslexia: merged.appearance.dyslexia === true,
    solidUi: merged.appearance.solidUi === true,
    streamerMode: merged.appearance.streamerMode === true
  };
  const backups = merged.backups && typeof merged.backups === 'object' ? merged.backups : {};
  merged.backups = {
    folder: String(backups.folder || '').trim().slice(0, 400),
    keep: Math.max(2, Math.min(30, Math.round(Number(backups.keep) || 8)))
  };
  if (!isPlainObject(merged.security)) merged.security = { readOnly: false, pinHash: '', pinSalt: '', autoLockMinutes: 0 };
  merged.security = {
    readOnly: merged.security.readOnly === true,
    pinHash: /^[0-9a-f]{64}$/i.test(String(merged.security.pinHash || '')) ? String(merged.security.pinHash) : '',
    pinSalt: /^[0-9a-f]{32}$/i.test(String(merged.security.pinSalt || '')) ? String(merged.security.pinSalt) : '',
    autoLockMinutes: Math.max(0, Math.min(240, Math.round(Number(merged.security.autoLockMinutes) || 0)))
  };
  if (!merged.security.pinHash) merged.security.pinSalt = '';
  merged.onboardingDone = merged.onboardingDone === true;
  merged.dashboardHidden = (Array.isArray(merged.dashboardHidden) ? merged.dashboardHidden : []).map((id) => String(id || '').slice(0, 40)).filter(Boolean).slice(0, 20);
  merged.dashboardOrder = (Array.isArray(merged.dashboardOrder) ? merged.dashboardOrder : []).map((id) => String(id || '').slice(0, 40)).filter(Boolean).slice(0, 30);
  merged.dashboardPreset = ['all', 'beginner', 'pro', 'pvp', 'raid', 'custom'].includes(String(merged.dashboardPreset)) ? String(merged.dashboardPreset) : 'all';
  merged.quickActionsHidden = (Array.isArray(merged.quickActionsHidden) ? merged.quickActionsHidden : []).map((id) => String(id || '').slice(0, 40)).filter(Boolean).slice(0, 20);
  if (!isPlainObject(merged.backup)) merged.backup = { autoEncrypted: true };
  merged.backup = { autoEncrypted: merged.backup.autoEncrypted !== false };
  merged.tourDone = merged.tourDone === true;
  const rawNotifications = isPlainObject(merged.notifications) ? merged.notifications : {};
  const timeOk = (value, fallback) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : fallback);
  merged.notifications = {
    enabled: rawNotifications.enabled !== false,
    postmaster: rawNotifications.postmaster !== false,
    xur: rawNotifications.xur !== false,
    reset: rawNotifications.reset !== false,
    godroll: rawNotifications.godroll !== false,
    suppressDuringActivity: rawNotifications.suppressDuringActivity !== false,
    quietStart: timeOk(rawNotifications.quietStart, '23:00'),
    quietEnd: timeOk(rawNotifications.quietEnd, '07:00')
  };
  if (!isPlainObject(merged.integrations)) merged.integrations = { localApi: {}, discordWebhook: '' };
  const rawLocalApi = isPlainObject(merged.integrations.localApi) ? merged.integrations.localApi : {};
  const tokenHash = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
  const normalizeOrigin = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if (!/^https?:$/.test(parsed.protocol)) return '';
      return parsed.origin;
    } catch (error) {
      return '';
    }
  };
  merged.integrations = {
    localApi: {
      enabled: rawLocalApi.enabled === true,
      port: Math.max(1024, Math.min(65535, Math.round(Number(rawLocalApi.port) || 7331))),
      token: /^[0-9a-f]{16,64}$/i.test(String(rawLocalApi.token || '')) ? String(rawLocalApi.token) : '',
      tokenEnc: String(rawLocalApi.tokenEnc || '').slice(0, 1000),
      readOnlyToken: /^[0-9a-f]{16,64}$/i.test(String(rawLocalApi.readOnlyToken || '')) ? String(rawLocalApi.readOnlyToken) : '',
      readOnlyTokenEnc: String(rawLocalApi.readOnlyTokenEnc || '').slice(0, 1000),
      tokens: (Array.isArray(rawLocalApi.tokens) ? rawLocalApi.tokens : []).slice(0, 20).map((entry, index) => {
        const legacyToken = /^[0-9a-f]{16,64}$/i.test(String(entry && entry.token || '')) ? String(entry.token) : '';
        const storedHash = /^[0-9a-f]{64}$/i.test(String(entry && entry.tokenHash || '')) ? String(entry.tokenHash).toLowerCase() : '';
        const hash = storedHash || (legacyToken ? tokenHash(legacyToken) : '');
        return {
          id: String(entry && entry.id || `token-${index + 1}`).slice(0, 60),
          name: String(entry && entry.name || `Token ${index + 1}`).slice(0, 60),
          tokenHash: hash,
          tokenPrefix: String(entry && entry.tokenPrefix || (legacyToken ? legacyToken.slice(0, 8) : '')).slice(0, 12),
          scope: ['read', 'action', 'admin'].includes(entry && entry.scope)
            ? entry.scope
            : (entry && entry.scope === 'write' ? 'action' : 'action'),
          createdAt: Number(entry && entry.createdAt) || Date.now(),
          expiresAt: Number(entry && entry.expiresAt) || 0
        };
      }).filter((entry) => entry.tokenHash),
      lan: rawLocalApi.lan === true,
      allowedOrigins: [...new Set((Array.isArray(rawLocalApi.allowedOrigins) ? rawLocalApi.allowedOrigins : [])
        .map(normalizeOrigin).filter(Boolean))].slice(0, 20),
      rateLimit: Math.max(10, Math.min(1000, Math.round(Number(rawLocalApi.rateLimit) || 120))),
      allowQueryToken: rawLocalApi.allowQueryToken !== false,
      lanIpAllowlist: (Array.isArray(rawLocalApi.lanIpAllowlist) ? rawLocalApi.lanIpAllowlist : [])
        .map((value) => String(value || '').trim()).filter((value) => value === '*' || /^[0-9a-f:.]+(?:\/\d{1,3})?$/i.test(value)).slice(0, 20),
      requireLanHmac: rawLocalApi.requireLanHmac === true
    },
    webhook: (() => {
      const raw = isPlainObject(merged.integrations.webhook) ? merged.integrations.webhook : {};
      const events = (Array.isArray(raw.events) ? raw.events : ['notification'])
        .map((entry) => String(entry || '').trim()).filter((entry) => ['notification', 'reset', 'xur', 'godroll', 'vendor'].includes(entry));
      return {
        enabled: raw.enabled === true,
        url: /^https?:\/\/[^\s]+$/i.test(String(raw.url || '')) ? String(raw.url).slice(0, 500) : '',
        secret: String(raw.secret || '').slice(0, 128),
        events: [...new Set(events.length ? events : ['notification'])].slice(0, 5)
      };
    })(),
    discordWebhook: /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/[^\s]+$/i.test(String(merged.integrations.discordWebhook || ''))
      ? String(merged.integrations.discordWebhook).slice(0, 400)
      : ''
  };

  // Bild-in-Bild-Fenster: Position/GrÃ¶ÃŸe merken (min. GrÃ¶ÃŸe prÃ¼fen).
  if (!isPlainObject(merged.pip)) merged.pip = { bounds: null };
  const pipBounds = merged.pip.bounds;
  if (pipBounds && isPlainObject(pipBounds)) {
    const nums = ['x', 'y', 'width', 'height'].map((key) => Number(pipBounds[key]));
    if (nums.every((n) => Number.isFinite(n)) && nums[2] >= 240 && nums[3] >= 135) {
      merged.pip.bounds = {
        x: Math.round(nums[0]),
        y: Math.round(nums[1]),
        width: Math.round(nums[2]),
        height: Math.round(nums[3])
      };
    } else {
      merged.pip.bounds = null;
    }
  } else {
    merged.pip.bounds = null;
  }

  // Poststellen-Zähler: Schalter, Deckkraft und Fensterposition.
  if (!isPlainObject(merged.postmaster)) merged.postmaster = { enabled: false, bounds: null, opacity: 0.95 };
  const pmRaw = merged.postmaster;
  const pmBounds = pmRaw.bounds;
  const pmOpacity = Number(pmRaw.opacity);
  merged.postmaster = {
    enabled: pmRaw.enabled === true,
    bounds: null,
    opacity: Number.isFinite(pmOpacity) ? Math.round(clamp(pmOpacity, 0.4, 1, 0.95) * 100) / 100 : 0.95,
    compact: pmRaw.compact === true,
    lock: pmRaw.lock === true,
    autoGame: pmRaw.autoGame === true,
    theme: pmRaw.theme === 'light' ? 'light' : 'dark',
    refreshSeconds: Math.round(clamp(pmRaw.refreshSeconds, 15, 3600, 90)),
    inventoryOnly: pmRaw.inventoryOnly === true
  };
  if (pmBounds && isPlainObject(pmBounds)) {
    const nums = ['x', 'y', 'width', 'height'].map((key) => Number(pmBounds[key]));
    if (nums.every((n) => Number.isFinite(n)) && nums[2] >= 160 && nums[3] >= 76) {
      merged.postmaster.bounds = {
        x: Math.round(nums[0]),
        y: Math.round(nums[1]),
        width: Math.round(nums[2]),
        height: Math.round(nums[3])
      };
    }
  }

  // Xûr-Overlay: Fensterposition/Größe merken.
  if (!isPlainObject(merged.xur)) merged.xur = { bounds: null };
  const xurBounds = merged.xur.bounds;
  if (xurBounds && isPlainObject(xurBounds)) {
    const nums = ['x', 'y', 'width', 'height'].map((key) => Number(xurBounds[key]));
    if (nums.every((n) => Number.isFinite(n)) && nums[2] >= 300 && nums[3] >= 240) {
      merged.xur.bounds = {
        x: Math.round(nums[0]),
        y: Math.round(nums[1]),
        width: Math.round(nums[2]),
        height: Math.round(nums[3])
      };
    } else {
      merged.xur.bounds = null;
    }
  } else {
    merged.xur.bounds = null;
  }
  merged.xur.remind = merged.xur.remind === true;

  // Stat-HUD: Fensterposition/Größe merken.
  if (!isPlainObject(merged.statsHud)) merged.statsHud = { bounds: null };
  const hudBounds = merged.statsHud.bounds;
  if (hudBounds && isPlainObject(hudBounds)) {
    const nums = ['x', 'y', 'width', 'height'].map((key) => Number(hudBounds[key]));
    if (nums.every((n) => Number.isFinite(n)) && nums[2] >= 200 && nums[3] >= 120) {
      merged.statsHud.bounds = {
        x: Math.round(nums[0]),
        y: Math.round(nums[1]),
        width: Math.round(nums[2]),
        height: Math.round(nums[3])
      };
    } else {
      merged.statsHud.bounds = null;
    }
  } else {
    merged.statsHud.bounds = null;
  }
  merged.statsHud.showActivity = merged.statsHud.showActivity !== false;
  merged.statsHud.showChampions = merged.statsHud.showChampions !== false;

  // Session-Statistiken: TagesschlÃ¼ssel -> Minuten, Ã¤lteste EintrÃ¤ge
  // Ã¼ber 60 Tage hinaus verwerfen.
  if (!isPlainObject(merged.stats)) merged.stats = { days: {}, weeklyGoal: 0 };
  const rawDays = isPlainObject(merged.stats.days) ? merged.stats.days : {};
  const dayEntries = Object.entries(rawDays)
    .filter(([key, value]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .map(([key, value]) => [key, Math.max(0, Math.min(1440, Math.round(Number(value) || 0)))])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-60);
  const days = {};
  for (const [key, value] of dayEntries) days[key] = value;
  const weeklyGoal = Math.max(0, Math.min(10080, Math.round(Number(merged.stats.weeklyGoal) || 0)));
  merged.stats = { days, weeklyGoal };

  // Overlay-Leisten-Elemente (bool-Map, alle Schalter bekannt).
  if (!isPlainObject(merged.overlay.showItems)) merged.overlay.showItems = {};
  const showRaw = merged.overlay.showItems;
  const showKeys = ['notes', 'dashboard', 'loadouts', 'lock', 'hide', 'exit', 'clock', 'session', 'activity', 'battery', 'bungie'];
  const showItems = {};
  for (const key of showKeys) showItems[key] = showRaw[key] !== false;
  merged.overlay.showItems = showItems;

  // Reihenfolge der Overlay-Chips (rechts): bekannte Keys, ohne
  // Duplikate, fehlende hinten anhängen.
  const CHIP_KEYS = ['clock', 'session', 'activity', 'battery'];
  const rawChipOrder = Array.isArray(merged.overlay.chipOrder) ? merged.overlay.chipOrder : [];
  const chipOrder = [];
  for (const key of rawChipOrder) {
    const clean = String(key || '');
    if (CHIP_KEYS.includes(clean) && !chipOrder.includes(clean)) chipOrder.push(clean);
  }
  for (const key of CHIP_KEYS) if (!chipOrder.includes(key)) chipOrder.push(key);
  merged.overlay.chipOrder = chipOrder;

  // Sitzungs-Wiederherstellung: Kategorie-/Seiten-IDs, max. 8.
  if (!isPlainObject(merged.session)) merged.session = { siteIds: [] };
  const rawSessionIds = Array.isArray(merged.session.siteIds) ? merged.session.siteIds : [];
  merged.session = {
    siteIds: rawSessionIds
      .map((id) => String(id || '').slice(0, 40))
      .filter((id) => id)
      .slice(0, 8)
  };

  // Bungie-API (optional): Key und Bungie-Name.
  if (!isPlainObject(merged.bungie)) merged.bungie = { apiKey: '', playerName: '', origin: '', oauthClientId: '', oauth: {} };
  const originValue = String(merged.bungie.origin || '').trim().slice(0, 200);
  const oauth = isPlainObject(merged.bungie.oauth) ? merged.bungie.oauth : {};
  // Loadouts (OAuth Stufe 2): gesicherte AusrÃ¼stungs-SchnappschÃ¼sse.
  const rawLoadouts = Array.isArray(merged.bungie.loadouts) ? merged.bungie.loadouts : [];

  const nextLoadouts = [];
  for (const entry of rawLoadouts) {
    if (nextLoadouts.length >= 20) break;
    if (!entry || typeof entry !== 'object') continue;
    const name = String(entry.name || '').trim().slice(0, 30);
    const items = (Array.isArray(entry.items) ? entry.items : [])
      .slice(0, 16)
      .map((item) => ({
        hash: Math.round(Number(item && item.hash) || 0),
        instanceId: String((item && item.instanceId) || ''),
        name: String((item && item.name) || '').slice(0, 60),
        typeName: String((item && item.typeName) || '').slice(0, 40),
        icon: String((item && item.icon) || '').slice(0, 120),
        // Slot-Zuordnung fÃ¼r den Loadout-Editor (Bucket-Hash).
        bucket: Math.round(Number(item && item.bucket) || 0),
        classType: Number.isFinite(Number(item && item.classType)) ? Math.round(Number(item && item.classType)) : 3
      }))
      .filter((item) => item.hash > 0);
    if (!name || !items.length) continue;
    // Die Mods des Loadouts (DIM parameters.mods): eine FLACHE Liste
    // der gewÃ¤hlten Mods â€” sie werden erst beim Anlegen eingesteckt.
    const modList = (Array.isArray(entry.mods) ? entry.mods : []).slice(0, 20).map((mod) => {
      const rawS = Array.isArray(mod && mod.s) ? mod.s : [];
      const sb = Math.round(Number(mod && mod.sb));
      const si = Math.round(Number(mod && mod.si));
      return {
        h: Math.round(Number(mod && mod.h) || 0),
        n: String((mod && mod.n) || '').slice(0, 60),
        i: String((mod && (mod.i || mod.icon)) || '').slice(0, 120),
        p: String((mod && mod.p) || '').slice(0, 60),
        d: String((mod && mod.d) || '').slice(0, 400),
        // Die Stat-Boni des Mods (DIM statContributions).
        s: rawS.slice(0, 8).map((bonus) => ({
          h: Math.round(Number(bonus && bonus.h) || 0),
          v: Math.round(Number(bonus && bonus.v) || 0)
        })).filter((bonus) => bonus.h > 0),
        // Die feste Socket-Zuordnung am RÃ¼stungsteil (Bucket + Socket-Index).
        sb: Number.isFinite(sb) && sb > 0 ? sb : 0,
        si: Number.isFinite(si) && si >= 0 ? si : -1
      };
    }).filter((mod) => mod.h > 0);
    // Vom Optimierer gewählte Stat-Mods (nur Metadaten; werden nicht
    // automatisch eingesteckt).
    const statMods = (Array.isArray(entry.statMods) ? entry.statMods : []).slice(0, 6).map((mod) => ({
      hash: Math.round(Number(mod && mod.hash) || 0),
      statHash: Math.round(Number(mod && mod.statHash) || 0),
      count: Math.max(0, Math.round(Number(mod && mod.count) || 0))
    })).filter((mod) => mod.hash > 0 && mod.count > 0);
    // Die gewÃ¤hlten Artefakt-Perks (DIM artifact perks).
    const perkList = (Array.isArray(entry.artifactPerks) ? entry.artifactPerks : []).slice(0, 8).map((perk) => {
      const rawS = Array.isArray(perk && perk.s) ? perk.s : [];
      return {
        h: Math.round(Number(perk && perk.h) || 0),
        n: String((perk && perk.n) || '').slice(0, 60),
        i: String((perk && (perk.i || perk.icon)) || '').slice(0, 120),
        p: String((perk && perk.p) || '').slice(0, 60),
        d: String((perk && perk.d) || '').slice(0, 400),
        s: rawS.slice(0, 8).map((bonus) => ({
          h: Math.round(Number(bonus && bonus.h) || 0),
          v: Math.round(Number(bonus && bonus.v) || 0)
        })).filter((bonus) => bonus.h > 0)
      };
    }).filter((perk) => perk.h > 0);
    // Die Fokus-Ãœberschreibungen (DIM socketOverrides): pro Socket-Index
    // der gewÃ¤hlte Plug (FÃ¤higkeit/Aspekt/Fragment).
    const subPlugs = (Array.isArray(entry.subclassPlugs) ? entry.subclassPlugs : []).slice(0, 24).map((plug) => ({
      idx: Math.round(Number(plug && plug.idx) || 0),
      hash: Math.round(Number(plug && (plug.hash || plug.h)) || 0),
      n: String((plug && plug.n) || '').slice(0, 60),
      i: String((plug && (plug.i || plug.icon)) || '').slice(0, 120),
      p: String((plug && plug.p) || '').slice(0, 60),
      d: String((plug && plug.d) || '').slice(0, 400)
    })).filter((plug) => plug.hash > 0);
    // Die Kosmetik je RÃ¼stungs-Bucket (Shader/Ornament, nur dokumentiert).
    const fashion = {};
    if (isPlainObject(entry.fashion)) {
      for (const [bucketKey, value] of Object.entries(entry.fashion)) {
        const bucket = Math.round(Number(bucketKey) || 0);
        if (!bucket || !isPlainObject(value)) continue;
        const cleanPlug = (plug) => (isPlainObject(plug) && Math.round(Number(plug.hash) || 0) > 0
          ? {
            hash: Math.round(Number(plug.hash) || 0),
            n: String(plug.n || '').slice(0, 60),
            i: String(plug.i || plug.icon || '').slice(0, 120)
          }
          : null);
        fashion[String(bucket)] = { shader: cleanPlug(value.shader), ornament: cleanPlug(value.ornament) };
      }
    }
    // Das Artefakt des Loadouts (Anzeige, im Spiel wechselbar).
    const artifactEntry = isPlainObject(entry.artifact) && Math.round(Number(entry.artifact.hash) || 0) > 0
      ? {
        hash: Math.round(Number(entry.artifact.hash) || 0),
        name: String((entry.artifact && entry.artifact.name) || '').slice(0, 60),
        icon: String((entry.artifact && entry.artifact.icon) || '').slice(0, 120)
      }
      : null;
    nextLoadouts.push({
      id: String(entry.id || '').slice(0, 40) || `l-${nextLoadouts.length}-${Date.now().toString(36)}`,
      name,
      characterId: String(entry.characterId || '').slice(0, 40),
      classType: Number.isFinite(Number(entry.classType)) ? Math.round(Number(entry.classType)) : 3,
      items,
      mods: modList,
      statMods,
      artifactPerks: perkList,
      subclassPlugs: subPlugs,
      notes: String(entry.notes || '').slice(0, 2048),
      clearOtherMods: entry.clearOtherMods === true,
      fashion,
      savedAt: Math.round(Number(entry.savedAt) || 0),
      // Verknüpfter Bungie-In-Game-Loadout-Slot (1–10, 0 = keiner).
      ingameIndex: Math.max(0, Math.min(10, Math.round(Number(entry.ingameIndex) || 0))),
      ingameCharacterId: String(entry.ingameCharacterId || '').slice(0, 40),
      artifact: artifactEntry
    });
  }
  // Sortier-Modus des Inventars (DIM itemSort): power / name / rarity /
  // stats / tier / archetype.
  const rawItemSort = String(merged.bungie.itemSort || '').trim();
  const itemSort = ['power', 'name', 'rarity', 'stats', 'tier', 'archetype'].includes(rawItemSort) ? rawItemSort : 'power';
  // Favoriten (DIM-Tag â˜…): instanceId- oder Hash-SchlÃ¼ssel â†’ true/false.
  const rawFavs = isPlainObject(merged.bungie.favs) ? merged.bungie.favs : {};
  const favs = {};
  let favCount = 0;
  for (const [key, value] of Object.entries(rawFavs)) {
    if (favCount >= 500) break;
    const cleanKey = String(key || '').trim().slice(0, 40);
    if (!cleanKey || value !== true) continue;
    favs[cleanKey] = true;
    favCount += 1;
  }
  // Item-Notizen: instanceId/Hash → Text (max. 500, je 300 Zeichen).
  const rawItemNotes = isPlainObject(merged.bungie.itemNotes) ? merged.bungie.itemNotes : {};
  const itemNotes = {};
  let noteCount = 0;
  for (const [key, value] of Object.entries(rawItemNotes)) {
    if (noteCount >= 500) break;
    const cleanKey = String(key || '').trim().slice(0, 40);
    const text = String(value || '').trim().slice(0, 300);
    if (!cleanKey || !text) continue;
    itemNotes[cleanKey] = text;
    noteCount += 1;
  }
  // Material-Ziele: Hash → Zielmenge.
  const rawMaterialGoals = isPlainObject(merged.bungie.materialGoals) ? merged.bungie.materialGoals : {};
  const materialGoals = {};
  let goalCount = 0;
  for (const [key, value] of Object.entries(rawMaterialGoals)) {
    if (goalCount >= 20) break;
    const cleanKey = String(key || '').trim().slice(0, 40);
    const target = Math.max(0, Math.min(100000000, Math.round(Number(value) || 0)));
    if (!cleanKey || !target) continue;
    materialGoals[cleanKey] = target;
    goalCount += 1;
  }
  const sessionGoals = (Array.isArray(merged.bungie.sessionGoals) ? merged.bungie.sessionGoals : [])
    .slice(0, 12)
    .map((goal) => ({
      id: String((goal && goal.id) || '').slice(0, 40),
      text: String((goal && goal.text) || '').slice(0, 80),
      target: Math.max(1, Math.min(999, Math.round(Number(goal && goal.target) || 1))),
      progress: Math.max(0, Math.min(999, Math.round(Number(goal && goal.progress) || 0)))
    }))
    .filter((goal) => goal.id && goal.text);
  const vendorHistory = (() => {
    const raw = isPlainObject(merged.bungie.vendorHistory) ? merged.bungie.vendorHistory : {};
    const out = {};
    for (const [key, list] of Object.entries(raw).slice(0, 20)) {
      out[String(key).slice(0, 20)] = (Array.isArray(list) ? list : []).map((hash) => Math.round(Number(hash) || 0)).filter(Boolean).slice(0, 200);
    }
    return out;
  })();
  const secretChests = isPlainObject(merged.bungie.secretChests) ? merged.bungie.secretChests : {};
  // Gespeicherte Suchen (max. 8, dedupliziert, je 80 Zeichen).
  const rawSearches = Array.isArray(merged.bungie.savedSearches) ? merged.bungie.savedSearches : [];
  const savedSearches = [];
  for (const entry of rawSearches) {
    const clean = String(entry || '').trim().slice(0, 80);
    if (clean && !savedSearches.includes(clean)) savedSearches.push(clean);
    if (savedSearches.length >= 8) break;
  }
  const savedViews = (Array.isArray(merged.bungie.savedViews) ? merged.bungie.savedViews : [])
    .slice(0, 20)
    .map((view) => ({
      id: String((view && view.id) || '').slice(0, 40),
      name: String((view && view.name) || '').slice(0, 40),
      query: String((view && view.query) || '').trim().slice(0, 120)
    }))
    .filter((view) => view.id && view.name);
  merged.bungie = {
    apiKey: String(merged.bungie.apiKey || '').trim().slice(0, 64),
    playerName: String(merged.bungie.playerName || '').trim().slice(0, 40),
    contentLanguage: merged.bungie.contentLanguage === 'en' ? 'en' : 'de',
    origin: /^https?:\/\/[^\s]+$/i.test(originValue) ? originValue : '',
    oauthClientId: String(merged.bungie.oauthClientId || '').trim().slice(0, 40),
    // Client-Secret (verschlüsselt) – ohne diesen Eintrag würde jede
    // Normalisierung (also JEDES config.set) das Secret verwerfen.
    oauthClientSecretEnc: String(merged.bungie.oauthClientSecretEnc || '').slice(0, 500),
    apiKeyEnc: String(merged.bungie.apiKeyEnc || '').slice(0, 500),
    // Godroll-Wunschliste (DIM-Format): Community-Liste fÃ¼r den
    // â˜…-Check am Item. Leer = kein Godroll-Check.
    // Wunschliste(n): 48klocs-voltron (aktiv gepflegt, letzte
    // Aktualisierung Okt 2026) + Aegis-Endgame (nur A/S-Tier-Rolls).
    // Mehrere URLs kommagetrennt.
    wishlistUrl: String(merged.bungie.wishlistUrl || 'https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/voltron.txt,https://raw.githubusercontent.com/Ciceron14/dim-extra-wishlists/main/Aegis%20Spreadsheets%20Wishlists/Aegis%20Endgame%20Analysis/dim_aegis_endgame.txt').trim().slice(0, 300),
    // Die tarix/destiny-godrolls-Quelle (D2Checklist): per Config
    // zuschaltbar (Standard AUS — die Liste endet Juli 2025, die
    // 48klocs-voltron-Quelle ist frischer und aktiv gepflegt).
    useD2Checklist: merged.bungie.useD2Checklist === true,
    godrollMode: ['exact', 'traits', 'fast'].includes(String(merged.bungie.godrollMode || '')) ? String(merged.bungie.godrollMode) : 'exact',
    acceptedNear: (Array.isArray(merged.bungie.acceptedNear) ? merged.bungie.acceptedNear : [])
      .map((value) => String(value || '').slice(0, 40))
      .filter(Boolean)
      .slice(0, 2000),
    wishlistMinMatch: Math.max(1, Math.min(4, Math.round(Number(merged.bungie.wishlistMinMatch) || 4))),
    customWishlist: (Array.isArray(merged.bungie.customWishlist) ? merged.bungie.customWishlist : [])
      .slice(0, 100)
      .map((rule) => ({
        id: String((rule && rule.id) || '').slice(0, 40),
        hash: Math.round(Number(rule && rule.hash) || 0),
        name: String((rule && rule.name) || '').slice(0, 80),
        role: ['any', 'pve', 'pvp'].includes(String(rule && rule.role || '')) ? String(rule.role) : 'any',
        notes: String((rule && rule.notes) || '').slice(0, 300),
        perks: (Array.isArray(rule && rule.perks) ? rule.perks : [])
          .map((value) => Math.round(Number(value) || 0))
          .filter(Boolean)
          .slice(0, 8)
      }))
      .filter((rule) => rule.id && rule.hash && rule.perks.length),
    armorWishlist: (Array.isArray(merged.bungie.armorWishlist) ? merged.bungie.armorWishlist : [])
      .slice(0, 50)
      .map((rule) => ({
        id: String((rule && rule.id) || '').slice(0, 40),
        name: String((rule && rule.name) || '').slice(0, 60),
        archetype: String((rule && rule.archetype) || '').slice(0, 60),
        tertiary: String((rule && rule.tertiary) || '').slice(0, 40),
        tunedStat: String((rule && rule.tunedStat) || '').slice(0, 40),
        set: String((rule && rule.set) || '').slice(0, 60),
        minTotal: Math.max(0, Math.min(200, Math.round(Number(rule && rule.minTotal) || 0)))
      }))
      .filter((rule) => rule.id && (rule.name || rule.archetype || rule.tertiary || rule.tunedStat || rule.set || rule.minTotal)),
    xurHistory: (Array.isArray(merged.bungie.xurHistory) ? merged.bungie.xurHistory : [])
      .slice(-8)
      .map((entry) => ({
        at: Math.round(Number(entry && entry.at) || 0),
        items: (Array.isArray(entry && entry.items) ? entry.items : []).slice(0, 80).map((item) => ({
          hash: Math.round(Number(item && item.hash) || 0),
          name: String((item && item.name) || '').slice(0, 80)
        })).filter((item) => item.hash)
      })),
    loadoutStats: (() => {
      const rawStats = isPlainObject(merged.bungie.loadoutStats) ? merged.bungie.loadoutStats : {};
      const stats = {};
      let statCount = 0;
      for (const [key, value] of Object.entries(rawStats)) {
        if (statCount >= 40) break;
        const cleanKey = String(key || '').slice(0, 40);
        if (!cleanKey || !isPlainObject(value)) continue;
        const applies = Math.max(0, Math.min(100000, Math.round(Number(value.applies) || 0)));
        const lastUsedAt = Math.max(0, Math.round(Number(value.lastUsedAt) || 0));
        if (!applies && !lastUsedAt) continue;
        stats[cleanKey] = { applies, lastUsedAt };
        statCount += 1;
      }
      return stats;
    })(),
    loadoutVersions: (() => {
      const raw = isPlainObject(merged.bungie.loadoutVersions) ? merged.bungie.loadoutVersions : {};
      const versions = {};
      let keys = 0;
      for (const [key, list] of Object.entries(raw)) {
        if (keys >= 40) break;
        const cleanKey = String(key || '').slice(0, 40);
        if (!cleanKey || !Array.isArray(list)) continue;
        versions[cleanKey] = list.slice(-5).map((version) => ({
          at: Math.round(Number(version && version.at) || 0),
          name: String((version && version.name) || '').slice(0, 40),
          items: (Array.isArray(version && version.items) ? version.items : []).slice(0, 20).map((item) => ({
            instanceId: String((item && item.instanceId) || '').slice(0, 40),
            hash: Math.round(Number(item && item.hash) || 0),
            name: String((item && item.name) || '').slice(0, 80),
            bucket: Math.round(Number(item && item.bucket) || 0)
          })).filter((item) => item.hash),
          mods: (Array.isArray(version && version.mods) ? version.mods : []).slice(0, 10).map((mod) => ({
            hash: Math.round(Number(mod && mod.hash) || 0)
          })).filter((mod) => mod.hash)
        }));
        if (versions[cleanKey].length) keys += 1;
      }
      return versions;
    })(),
    loadoutFavs: (() => {
      const rawFavs = isPlainObject(merged.bungie.loadoutFavs) ? merged.bungie.loadoutFavs : {};
      const favs = {};
      let favCount = 0;
      for (const [key, value] of Object.entries(rawFavs)) {
        if (favCount >= 40) break;
        const cleanKey = String(key || '').slice(0, 40);
        if (!cleanKey || value !== true) continue;
        favs[cleanKey] = true;
        favCount += 1;
      }
      return favs;
    })(),
    oauth: {
      accessToken: String(oauth.accessToken || ''),
      refreshToken: String(oauth.refreshToken || ''),
      accessTokenEnc: String(oauth.accessTokenEnc || ''),
      refreshTokenEnc: String(oauth.refreshTokenEnc || ''),
      expiresAt: Math.round(Number(oauth.expiresAt) || 0),
      bnetMembershipId: String(oauth.bnetMembershipId || '').slice(0, 40),
      displayName: String(oauth.displayName || '').slice(0, 60),
      scope: String(oauth.scope || '').slice(0, 200),
      destinyMembershipId: String(oauth.destinyMembershipId || '').slice(0, 40),
      destinyMembershipType: Math.round(Number(oauth.destinyMembershipType) || 0)
    },
    loadouts: nextLoadouts,
    itemSort,
    savedSearches,
    savedViews,
    favs,
    itemNotes,
    materialGoals,
    sessionGoals,
    vendorHistory,
    secretChests,
    encounterTracker: isPlainObject(merged.bungie.encounterTracker) ? merged.bungie.encounterTracker : {},
    itemTags: (() => {
      const allowed = new Set(['keep', 'junk', 'pve', 'pvp', 'godroll', 'infuse']);
      const rawTags = isPlainObject(merged.bungie.itemTags) ? merged.bungie.itemTags : {};
      const tags = {};
      let tagCount = 0;
      for (const [key, value] of Object.entries(rawTags)) {
        if (tagCount >= 3000) break;
        const cleanKey = String(key || '').trim().slice(0, 40);
        const tag = String(value || '').trim();
        if (!cleanKey || !allowed.has(tag)) continue;
        tags[cleanKey] = tag;
        tagCount += 1;
      }
      return tags;
    })(),
    lootGoals: (Array.isArray(merged.bungie.lootGoals) ? merged.bungie.lootGoals : [])
      .map((goal) => String(goal || '').trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 30),
    inventoryDensity: merged.bungie.inventoryDensity === 'compact' ? 'compact' : 'comfortable',
    folders: (Array.isArray(merged.bungie.folders) ? merged.bungie.folders : [])
      .slice(0, 20)
      .map((folder) => ({
        id: String((folder && folder.id) || '').slice(0, 40),
        name: String((folder && folder.name) || '').slice(0, 40),
        color: /^#[0-9a-fA-F]{6}$/.test(String((folder && folder.color) || '')) ? String(folder.color) : '#6b8bb5'
      }))
      .filter((folder) => folder.id && folder.name),
    itemFolders: (() => {
      const allowed = new Set((Array.isArray(merged.bungie.folders) ? merged.bungie.folders : []).map((folder) => String((folder && folder.id) || '')));
      const raw = isPlainObject(merged.bungie.itemFolders) ? merged.bungie.itemFolders : {};
      const map = {};
      let count = 0;
      for (const [key, value] of Object.entries(raw)) {
        if (count >= 3000) break;
        const cleanKey = String(key || '').trim().slice(0, 40);
        const folderId = String(value || '');
        if (!cleanKey || !allowed.has(folderId)) continue;
        map[cleanKey] = folderId;
        count += 1;
      }
      return map;
    })()
  };

  const bounds = merged.window.bounds;
  if (bounds && isPlainObject(bounds)) {
    const numbers = ['x', 'y', 'width', 'height'].map((key) => Number(bounds[key]));
    if (numbers.every((n) => Number.isFinite(n)) && numbers[2] >= 400 && numbers[3] >= 300) {
      merged.window.bounds = {
        x: Math.round(numbers[0]),
        y: Math.round(numbers[1]),
        width: Math.round(numbers[2]),
        height: Math.round(numbers[3])
      };
    } else {
      merged.window.bounds = null;
    }
  } else {
    merged.window.bounds = null;
  }

  // Overlay-Layout-Profile: max. 8, nur bekannte Felder.
  const rawOverlayProfiles = Array.isArray(merged.overlay.profiles) ? merged.overlay.profiles : [];
  const overlayProfiles = [];
  for (const entry of rawOverlayProfiles) {
    if (!isPlainObject(entry)) continue;
    const profileId = String(entry.id || '').slice(0, 40);
    const name = String(entry.name || '').trim().slice(0, 30);
    if (!profileId || !name) continue;
    const width = Math.round(clamp(Number(entry.width) || DEFAULTS.overlay.width, 30, 100, DEFAULTS.overlay.width));
    const height = Math.round(clamp(Number(entry.height) || DEFAULTS.overlay.height, 30, 100, DEFAULTS.overlay.height));
    const opacity = clamp(Number(entry.opacity) || DEFAULTS.overlay.opacity, 0.4, 1, DEFAULTS.overlay.opacity);
    const anchor = ANCHORS.has(entry.anchor) ? entry.anchor : DEFAULTS.overlay.anchor;
    const monitor = Math.round(clamp(Number(entry.monitor) || 0, 0, 15, 0));
    const order = Array.isArray(entry.chipOrder) ? entry.chipOrder : [];
    const chipOrder = ['clock', 'session', 'activity', 'battery'];
    const cleanOrder = order.filter((key) => chipOrder.includes(key)).filter((key, index, all) => all.indexOf(key) === index);
    for (const key of chipOrder) if (!cleanOrder.includes(key)) cleanOrder.push(key);
    const showRaw = isPlainObject(entry.showItems) ? entry.showItems : {};
    const showItems = {};
    for (const key of ['notes', 'dashboard', 'loadouts', 'lock', 'hide', 'exit', 'clock', 'session', 'activity', 'battery', 'bungie']) {
      showItems[key] = showRaw[key] !== false;
    }
    overlayProfiles.push({
      id: profileId,
      name,
      width,
      height,
      opacity: Math.round(opacity * 100) / 100,
      anchor,
      monitor,
      chipOrder: cleanOrder,
      showItems
    });
    if (overlayProfiles.length >= 8) break;
  }
  merged.overlay.profiles = overlayProfiles;

  // Schema-Version: Migrationen sind in den Normalisierungen oben
  // enthalten – die Version dokumentiert den Stand der Datei.
  merged.schemaVersion = CURRENT_SCHEMA;

  return merged;
}

// Werkseinstellungen: kompletter Neustart der Konfigurationsdaten.
function reset() {
  data = clone(DEFAULTS);
  save();
  return get();
}

let repairInfo = null;

function load() {
  configFile = path.join(app.getPath('userData'), 'config.json');
  try {
    const raw = fs.readFileSync(configFile, 'utf8');
    data = normalize(JSON.parse(raw));
    repairInfo = null;
  } catch (error) {
    // Reparatur: defekte Datei sichern und das neueste gültige Backup
    // laden. Bleibt das erfolglos, gelten die Standardwerte.
    let repairedFrom = '';
    try {
      if (fs.existsSync(configFile)) {
        fs.copyFileSync(configFile, `${configFile}.broken-${Date.now()}.json`);
      }
      const dir = path.join(app.getPath('userData'), 'backups');
      const candidates = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => /^config-.*\.json$/i.test(name)).sort().reverse()
        : [];
      for (const name of candidates) {
        try {
          data = normalize(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
          repairedFrom = name;
          break;
        } catch (backupError) {
          // nächstes Backup probieren
        }
      }
    } catch (repairError) {
      // Reparatur ist optional.
    }
    if (!repairedFrom) data = clone(DEFAULTS);
    repairInfo = { at: Date.now(), reason: error.message || String(error), from: repairedFrom || '' };
  }
  return get();
}

function repairReport() {
  return repairInfo;
}

let safeMode = false;

function enterSafeMode() {
  safeMode = true;
  data = clone(DEFAULTS);
  repairInfo = { at: Date.now(), reason: 'Safe-Mode (--safe)', from: '' };
  return get();
}

function save() {
  if (safeMode) return;
  if (!configFile) return false;
  try {
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    const tmp = `${configFile}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, configFile);
    return true;
  } catch (error) {
    console.error('[config] Speichern fehlgeschlagen:', error.message);
    return false;
  }
}

function get() {
  return clone(data);
}

function set(patch) {
  const next = isPlainObject(patch) ? { ...patch } : {};
  // lastSite ist ein offenes Objekt (Kategorie -> Seite). Beim
  // ZusammenfÃ¼hren mÃ¼ssen neue Kategorien erhalten bleiben.
  if (isPlainObject(next.lastSite)) {
    next.lastSite = { ...(isPlainObject(data.lastSite) ? data.lastSite : {}), ...next.lastSite };
  }
  data = normalize(mergeKnown(data, next));
  save();
  return get();
}

function replace(next) {
  data = normalize(clone(isPlainObject(next) ? next : DEFAULTS));
  save();
  return get();
}

function filePath() {
  return configFile || path.join(app.getPath('userData'), 'config.json');
}

module.exports = { DEFAULTS, load, save, get, set, replace, reset, filePath, repairReport, enterSafeMode };

