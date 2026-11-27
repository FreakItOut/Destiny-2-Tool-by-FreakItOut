'use strict';

// ============================================================
// Konfigurations-Transfer ohne Tokens
// ============================================================
// Prüft Sanitizer, Merge und Formatprüfung aus electron/main.js.
// Der Block ist dort markiert (config-transfer-block) und absichtlich
// frei von Electron: so prüft dieser Test die echte Implementierung
// ohne App-Start. Aufruf: node tools/config-transfer-test.js

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
const START = '// >>> config-transfer-block';
const END = '// <<< config-transfer-block';

const start = MAIN.indexOf(START);
const end = MAIN.indexOf(END);
if (start < 0 || end < 0 || end < start) {
  console.error('Konfigurations-Transfer-Test: Block fehlt in electron/main.js.');
  process.exit(1);
}
const block = MAIN.slice(start, end + END.length);

const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(
  `${block}\nmodule.exports = {
  CONFIG_TRANSFER_FORMAT,
  CONFIG_TRANSFER_VERSION,
  configTransferKeyIsSecret,
  configTransferSanitize,
  configTransferStripSecrets,
  configTransferStripMachineSpecific,
  configTransferPrepare,
  configTransferCountKeys,
  configTransferSummary,
  configTransferPickKnown,
  configTransferMerge,
  configTransferBuildExport,
  configTransferExportFileText,
  configTransferReadPayload
};`,
  sandbox,
  { filename: 'electron/main.js#config-transfer' }
);

const {
  CONFIG_TRANSFER_FORMAT,
  CONFIG_TRANSFER_VERSION,
  configTransferKeyIsSecret,
  configTransferSanitize,
  configTransferStripSecrets,
  configTransferPrepare,
  configTransferSummary,
  configTransferMerge,
  configTransferBuildExport,
  configTransferExportFileText,
  configTransferReadPayload
} = sandbox.module.exports;

let checks = 0;
let failed = 0;
function check(label, condition, detail = '') {
  checks += 1;
  if (condition) return;
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` – ${detail}` : ''}`);
}

const SECRET_VALUES = [
  'SECRET_ACCESS_TOKEN',
  'SECRET_REFRESH_TOKEN',
  'SECRET_SESSION',
  'SECRET_PASSWORD',
  'SECRET_APIKEY',
  'SECRET_CLIENT',
  'SECRET_BEARER',
  'SECRET_COOKIE',
  'SECRET_WEBHOOK',
  'SECRET_LOCAL_TOKEN',
  'SECRET_NESTED',
  'SECRET_PIN_HASH',
  'SECRET_PIN_SALT'
];

// Absichtlich "schmutzige" Konfiguration: Secrets in allen Varianten.
const dirty = {
  schemaVersion: 3,
  hotkey: 'Alt+D',
  overlay: {
    width: 88,
    height: 88,
    notesFolder: 'C:\\Users\\Test\\Notizen',
    showItems: { notes: true, session: true }
  },
  bungie: {
    playerName: 'Guardian#1234',
    apiKey: 'SECRET_APIKEY',
    apiKeyEnc: 'SECRET_APIKEY_ENC',
    oauthClientSecretEnc: 'SECRET_CLIENT',
    oauth: {
      accessToken: 'SECRET_ACCESS_TOKEN',
      refreshToken: 'SECRET_REFRESH_TOKEN',
      accessTokenEnc: 'SECRET_ACCESS_ENC',
      refreshTokenEnc: 'SECRET_REFRESH_ENC',
      bnetMembershipId: '4611686018000000000',
      displayName: 'Guardian'
    },
    loadouts: [
      {
        id: 'loadout-1',
        name: 'Raid',
        accessToken: 'SECRET_NESTED',
        items: [{ hash: 1234, instanceId: 'i-1', refreshToken: 'SECRET_NESTED' }]
      }
    ],
    sessionGoals: [{ id: 'goal-1' }],
    savedSearches: ['is:dupe'],
    loadoutFolders: [{ id: 'f1', name: 'Ordnername' }]
  },
  integrations: {
    localApi: {
      enabled: true,
      port: 7331,
      token: 'SECRET_LOCAL_TOKEN',
      tokenEnc: 'SECRET_LOCAL_TOKEN_ENC',
      readOnlyToken: 'SECRET_READ_TOKEN',
      tokens: [{ id: 't1', tokenHash: 'abc', name: 'Stream Deck' }]
    },
    webhook: { enabled: true, url: 'SECRET_WEBHOOK', secret: 'SECRET_WEBHOOK_SECRET' },
    discordWebhook: 'SECRET_WEBHOOK',
    digestSchedule: { enabled: false, weekday: 2, time: '18:05' }
  },
  session: { siteIds: ['dim'] },
  window: { bounds: { x: 10, y: 20, width: 800, height: 600 } },
  pip: { bounds: null },
  backups: { autoEncrypted: true, keep: 8, folder: 'C:\\Users\\Test\\Backups' },
  behavior: {
    closeToTray: true,
    alarmSoundPath: 'C:\\Users\\Test\\alarm.mp3',
    siteUsage: { dim: { accessCount: 2 } }
  },
  web: { idleUnloadMinutes: 0, cookieOffSites: { dim: true } },
  profiles: {
    items: [
      {
        id: 'profile-1',
        name: 'Gaming',
        data: {
          overlay: { width: 70 },
          integrations: { localApi: { token: 'SECRET_NESTED' } }
        }
      }
    ],
    active: ''
  },
  customSites: [{ id: 'dim', url: 'https://app.destinyitemmanager.com', password: 'SECRET_PASSWORD' }],
  security: { readOnly: true, pinHash: 'SECRET_PIN_HASH', pinSalt: 'SECRET_PIN_SALT', autoLockMinutes: 5 },
  appearance: { uiLanguage: 'de', accent: '#ffcc00' }
};

// ------------------------------------------------------------
// Sanitizer
// ------------------------------------------------------------
const prepared = configTransferPrepare(dirty);
const preparedJson = JSON.stringify(prepared);

for (const secret of SECRET_VALUES) {
  check(`Export enthält kein Geheimnis (${secret})`, !preparedJson.includes(secret));
}

check('Bungie-API-Key entfernt', !('apiKey' in prepared.bungie) && !('apiKeyEnc' in prepared.bungie));
check('Bungie-Client-Secret entfernt', !('oauthClientSecretEnc' in prepared.bungie));
check('Bungie-OAuth-Block entfernt', !('oauth' in prepared.bungie));
check('Token in Loadout-Array entfernt', !('accessToken' in prepared.bungie.loadouts[0])
  && !('refreshToken' in prepared.bungie.loadouts[0].items[0]));
check('Lokale API-Tokens entfernt', !('token' in prepared.integrations.localApi)
  && !('readOnlyToken' in prepared.integrations.localApi)
  && !('tokens' in prepared.integrations.localApi)
  && !('tokenEnc' in prepared.integrations.localApi));
check('Webhook entfernt', !('webhook' in prepared.integrations) && !('discordWebhook' in prepared.integrations));
check('Session-Bereich entfernt', !('session' in prepared));
check('Session-Schlüssel in Unterobjekten entfernt', !('session' in prepared.overlay.showItems)
  && !('sessionGoals' in prepared.bungie));
check('Cookie-Schlüssel entfernt', !('cookieOffSites' in prepared.web));
check('Passwort in eigener Seite entfernt', !('password' in prepared.customSites[0]));
check('Token in Profil-Snapshot entfernt', !JSON.stringify(prepared.profiles).includes('SECRET_NESTED'));
check('PIN-Hash und Salt bleiben lokal', !('pinHash' in prepared.security) && !('pinSalt' in prepared.security));
check('Sicherheits-Einstellungen bleiben erhalten', prepared.security.readOnly === true
  && prepared.security.autoLockMinutes === 5);

// Nutzdaten bleiben erhalten.
check('Hotkey bleibt erhalten', prepared.hotkey === 'Alt+D', prepared.hotkey);
check('Overlay-Größe bleibt erhalten', prepared.overlay.width === 88 && prepared.overlay.height === 88);
check('Akzentfarbe bleibt erhalten', prepared.appearance.accent === '#ffcc00');
check('Lokale API-Einstellungen bleiben erhalten', prepared.integrations.localApi.enabled === true
  && prepared.integrations.localApi.port === 7331);
check('Digest-Zeitplan bleibt erhalten', prepared.integrations.digestSchedule.weekday === 2);
check('Profil-Nutzdaten bleiben erhalten', prepared.profiles.items[0].data.overlay.width === 70);
check('Bungie-Name bleibt erhalten', prepared.bungie.playerName === 'Guardian#1234');
check('Gespeicherte Suchen bleiben erhalten', prepared.bungie.savedSearches[0] === 'is:dupe');

// Maschinenspezifische Werte.
check('Fensterposition entfernt', !('bounds' in prepared.window));
check('Backup-Ordner entfernt', !('folder' in prepared.backups));
check('Notiz-Ordner entfernt', !('notesFolder' in prepared.overlay));
check('Alarm-Sound-Pfad entfernt', !('alarmSoundPath' in prepared.behavior));
check('Backup-Einstellungen bleiben erhalten', prepared.backups.keep === 8);
check('Original bleibt unverändert', dirty.bungie.apiKey === 'SECRET_APIKEY'
  && dirty.window.bounds.width === 800);

// Schlüssel-Normalisierung.
check('Key-Erkennung ohne Groß-/Kleinschreibung', configTransferKeyIsSecret('AccessToken')
  && configTransferKeyIsSecret('refresh_token') && configTransferKeyIsSecret('API_KEY'));
check('Key-Erkennung trennt Wörter nicht falsch', !configTransferKeyIsSecret('hotkey')
  && !configTransferKeyIsSecret('notes') && !configTransferKeyIsSecret('appearance'));

// Tiefe und kaputte Werte.
let deep = { value: 'ok' };
for (let index = 0; index < 40; index += 1) deep = { level: deep };
let deepResult = null;
try {
  deepResult = configTransferSanitize(deep);
} catch (error) {
  deepResult = null;
}
check('Extrem tiefe Strukturen werfen nicht', deepResult !== null);
check('Null und Arrays bleiben erhalten', configTransferSanitize({ a: null, b: [1, 'x', true] }).b.length === 3);

// Prototyp-Ketten aus manipulierten Dateien.
const polluted = configTransferSanitize(JSON.parse('{"__proto__":{"polluted":true},"safe":1}'));
check('Prototyp-Schlüssel entfernt', !Object.prototype.hasOwnProperty.call(polluted, '__proto__')
  && polluted.safe === 1);
check('Kein Prototyp-Leck', ({}).polluted === undefined);

// ------------------------------------------------------------
// Exportdatei
// ------------------------------------------------------------
const exportedAt = '2026-11-27T10:00:00.000Z';
const payload = configTransferBuildExport(dirty, exportedAt);
check('Export-Format gesetzt', payload.format === CONFIG_TRANSFER_FORMAT && CONFIG_TRANSFER_FORMAT === 'd2tool-config-transfer');
check('Export-Formatversion gesetzt', payload.formatVersion === CONFIG_TRANSFER_VERSION && CONFIG_TRANSFER_VERSION === 1);
check('Export-Zeitstempel übernommen', payload.exportedAt === exportedAt);
check('Export-Config enthält keine Geheimnisse', !JSON.stringify(payload.config).includes('SECRET_'));
check('Export-Config ist bereinigt', !('apiKey' in payload.config.bungie) && !('session' in payload.config));

const fileText = configTransferExportFileText(dirty, exportedAt);
let reparsed = null;
try {
  reparsed = JSON.parse(fileText);
} catch (error) {
  reparsed = null;
}
check('Exportdatei ist gültiges JSON', Boolean(reparsed));
check('Exportdatei endet mit Zeilenumbruch', fileText.endsWith('\n'));
check('Exportdatei enthält keine Geheimnisse', !fileText.includes('SECRET_'));
check('Exportdatei hat Wrapper', Boolean(reparsed
  && reparsed.format === CONFIG_TRANSFER_FORMAT
  && reparsed.formatVersion === CONFIG_TRANSFER_VERSION
  && reparsed.config && typeof reparsed.config === 'object'));

// ------------------------------------------------------------
// Formatprüfung
// ------------------------------------------------------------
check('Gültige Datei wird akzeptiert', configTransferReadPayload(reparsed).ok === true);
check('Falsches Format wird abgelehnt', configTransferReadPayload({ format: 'etwas-anderes', formatVersion: 1, config: {} }).ok === false);
check('Falsche Version wird abgelehnt', configTransferReadPayload({ format: CONFIG_TRANSFER_FORMAT, formatVersion: 2, config: {} }).ok === false);
check('Fehlende Config wird abgelehnt', configTransferReadPayload({ format: CONFIG_TRANSFER_FORMAT, formatVersion: 1 }).ok === false);
check('Alte Roh-Config wird abgelehnt', configTransferReadPayload({ overlay: { width: 88 } }).ok === false);
check('Array als Datei wird abgelehnt', configTransferReadPayload([{ format: CONFIG_TRANSFER_FORMAT }]).ok === false);
check('Config als Array wird abgelehnt', configTransferReadPayload({ format: CONFIG_TRANSFER_FORMAT, formatVersion: 1, config: [] }).ok === false);
check('Null als Datei wird abgelehnt', configTransferReadPayload(null).ok === false);

// ------------------------------------------------------------
// Zusammenfassung
// ------------------------------------------------------------
const summary = configTransferSummary({ a: 1, b: { c: 2, d: { e: 3 } }, list: [1, 2] });
check('Bereiche gezählt', summary.sectionsCount === 3, String(summary.sectionsCount));
check('Schlüssel gezählt', summary.total === 6, String(summary.total));
check('Größter Bereich zuerst', summary.sections[0].section === 'b' && summary.sections[0].keys === 4,
  JSON.stringify(summary.sections));
check('Einzelwert zählt als ein Schlüssel', configTransferSummary({ hotkey: 'Alt+D' }).total === 1);
check('Leere Konfiguration ergibt 0', configTransferSummary({}).total === 0);

// ------------------------------------------------------------
// Merge (nur bekannte Schlüssel, keine Tokens)
// ------------------------------------------------------------
const defaults = {
  schemaVersion: 3,
  hotkey: 'Alt+D',
  overlay: { width: 88, showItems: { notes: true, session: true } },
  bungie: { playerName: '', apiKey: '', loadouts: [], savedSearches: [] },
  integrations: { localApi: { enabled: false, port: 7331, token: '', tokens: [] }, webhook: { enabled: false } },
  window: { bounds: null },
  backups: { keep: 8, folder: '' },
  favorites: [],
  appearance: { uiLanguage: 'de' },
  lastSite: {}
};
const incoming = {
  schemaVersion: 99,
  hotkey: 'Ctrl+Shift+X',
  overlay: { width: 'breit', depth: 4, showItems: { notes: false, session: true } },
  bungie: {
    playerName: 'Neu',
    apiKey: 'SECRET_APIKEY',
    oauth: { accessToken: 'SECRET_ACCESS_TOKEN' },
    loadouts: [{ id: 'loadout-neu' }]
  },
  integrations: { localApi: { enabled: true, token: 'SECRET_LOCAL_TOKEN' } },
  window: { bounds: { x: 1, y: 2 } },
  backups: { folder: 'C:\\temp\\backups', keep: 12 },
  favorites: ['a', 'b'],
  appearance: { uiLanguage: 'en', unbekannt: true },
  lastSite: { dim: 'inventar' },
  unbekannteSektion: { boese: true }
};
const merged = configTransferMerge(incoming, defaults);
const patch = merged.patch;

check('Schema-Version wird nicht übertragen', !('schemaVersion' in patch));
check('Bekannter Einzelwert wird übernommen', patch.hotkey === 'Ctrl+Shift+X', patch.hotkey);
check('Falscher Typ wird verworfen', !('width' in patch.overlay));
check('Unbekannter Schlüssel wird verworfen', !('depth' in patch.overlay) && !('unbekannt' in patch.appearance));
check('Unbekannte Sektion wird verworfen', !('unbekannteSektion' in patch));
check('Array wird übernommen', Array.isArray(patch.favorites) && patch.favorites.length === 2);
check('Offene Sammlung wird übernommen', patch.lastSite && patch.lastSite.dim === 'inventar');
check('API-Key kommt nicht in den Patch', !patch.bungie || !('apiKey' in patch.bungie));
check('OAuth kommt nicht in den Patch', !patch.bungie || !('oauth' in patch.bungie));
check('Lokale API-Tokens kommen nicht in den Patch', !patch.integrations.localApi || !('token' in patch.integrations.localApi));
check('Webhook kommt nicht in den Patch', !patch.integrations || !('webhook' in patch.integrations));
check('Session-Schlüssel kommt nicht in den Patch', !patch.overlay || !patch.overlay.showItems || !('session' in patch.overlay.showItems));
check('Fensterposition kommt nicht in den Patch', !patch.window || !('bounds' in patch.window));
check('Backup-Ordner kommt nicht in den Patch', !patch.backups || !('folder' in patch.backups));
check('Backup-Anzahl wird übernommen', patch.backups && patch.backups.keep === 12);
check('Angewendete Bereiche gemeldet', merged.applied.includes('hotkey') && merged.applied.includes('overlay')
  && merged.applied.includes('backups'), JSON.stringify(merged.applied));
check('Leere Bereiche werden nicht gemeldet', !merged.applied.includes('window'), JSON.stringify(merged.applied));
check('Merge verändert die Eingabe nicht', incoming.bungie.apiKey === 'SECRET_APIKEY'
  && incoming.integrations.localApi.token === 'SECRET_LOCAL_TOKEN');

const mergedJson = JSON.stringify(patch);
check('Patch enthält keine Geheimnisse', !mergedJson.includes('SECRET_'));
check('Patch enthält keine Fensterposition', !mergedJson.includes('"bounds"'));
check('Patch enthält keinen Backup-Pfad', !mergedJson.includes('C:\\\\temp'));

check('Merge mit unbekannten Defaults ist leer', configTransferMerge({ x: 1 }, {}).applied.length === 0);
check('Merge ohne Objekt ist leer', configTransferMerge(null, defaults).applied.length === 0);
check('Merge mit Array ist leer', configTransferMerge([1, 2], defaults).applied.length === 0);

// Manipulierte Datei: Secrets direkt im Merge-Eingang.
const tampered = configTransferMerge({
  bungie: { apiKey: 'SECRET_APIKEY', playerName: 'Hacker', oauth: { refreshToken: 'SECRET_REFRESH_TOKEN' } },
  window: { bounds: { x: 5 } },
  backups: { folder: 'C:\\evil' }
}, defaults);
check('Manipulierter Import behält keine Secrets', !JSON.stringify(tampered.patch).includes('SECRET_'));
check('Manipulierter Import behält Nutzdaten', tampered.patch.bungie && tampered.patch.bungie.playerName === 'Hacker');
check('Manipulierter Import behält keine Pfade', !JSON.stringify(tampered.patch).includes('C:\\\\evil')
  && !JSON.stringify(tampered.patch).includes('"bounds"'));

if (failed) {
  console.error(`\nKONFIGURATIONS-TRANSFER-TEST FEHLGESCHLAGEN: ${failed} von ${checks}.`);
  process.exit(1);
}
console.log(`Konfigurations-Transfer-Test OK: ${checks} Prüfungen.`);
