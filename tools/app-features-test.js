'use strict';

// Statische Prüfung der App-Features aus Runde 3.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('renderer/js/app.js');
const inventory = read('renderer/js/inventory.js');
const tools = read('renderer/js/tools.js');
const checklist = read('renderer/js/checklist.js');
const main = read('electron/main.js');
const preload = read('electron/preload.js');
const settings = read('renderer/js/settings.js');
const dashboardSource = read('renderer/js/dashboard.js');
const controller = read('renderer/js/controller.js');
const index = read('renderer/index.html');
const readme = read('README.md');
const config = read('electron/config.js');
const champions = read('renderer/js/champions.js');
const overlayHud = read('renderer/js/overlay-hud.js');
const settingsBindings = read('renderer/js/settings-bindings.js');
const releaseWorkflow = read('.github/workflows/release.yml');
const xurHtml = read('renderer/xur.html');
const syncLe = read('tools/sync-le.js');
const preflight = read('tools/preflight.js');
const streamdeck = read('streamdeck/com.freakitout.d2tool.sdPlugin/bin/plugin.js');const manifest = read('streamdeck/com.freakitout.d2tool.sdPlugin/manifest.json');
const pkg = JSON.parse(read('package.json'));

let checks = 0;
let failures = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

check('Command Palette verdrahtet', app.includes('openCommandPalette') && index.includes('commandPaletteInput'));
check('Datenstatus-Chip verdrahtet', app.includes('refreshDataStatusChip') && index.includes('dataStatusChip'));
check('Bungie-Fehlerhinweise', inventory.includes('bungieErrorHint'));
check('In-Game-Drift erkannt', inventory.includes('syncBadge') && inventory.includes('Drift'));
check('Godroll-Near-Miss-Erklärung', inventory.includes('Fast-Godroll') && inventory.includes('nearGodRoll.missing'));
check('Multi-Build-Ziele', tools.includes('renderMultiBuildTargets') && tools.includes('buildTargets'));
check('Build-Snapshots', tools.includes('renderBuildSnapshots') && tools.includes('buildSnapshots'));
check('Crafting-Ziele', tools.includes('craftGoals') && tools.includes('data-craft-goal'));
check('Vendor-Budget', tools.includes('Budget für alle Einträge'));
check('Auto-Checkliste', checklist.includes('autoChecklistDone') && index.includes('checklistAuto'));
check('Auto-Lock', main.includes('startSecurityAutoLock') && main.includes('securitySetAutoLock') && settings.includes('securityAutoLock'));
check('PIN-Lockout', main.includes('securityPinFailures') && main.includes('security-pin-failed'));
check('DPI-Hotplug', main.includes('watchDisplayChanges') && main.includes('display-metrics-changed'));
check('Backup-Checksumme', main.includes('hash: crypto.createHash') && settings.includes('entry.hash'));
check('Session-Recap', tools.includes('renderSessionRecap') && tools.includes('data-session-export'));
check('Katalysator-Tracker', tools.includes('renderCatalystTracker') && tools.includes('catalystTracker'));
check('Aktivitätskalender', tools.includes('renderActivityCalendar'));
check('Inventar-Export', tools.includes('renderInventoryExport') && tools.includes('data-inventory-export'));
check('Such-Autocomplete', index.includes('inventorySearchHints') && index.includes('is:godroll'));
check('Backup-Diff-UI', settings.includes('data-backup-diff') && settings.includes('backupsDiff'));
check('Snapshot-Index', inventory.includes('ensureItemIndex') && inventory.includes('itemIndexCache'));
check('Element- und Champion-Anzeige', inventory.includes('elementName') && inventory.includes('championTypes') && inventory.includes('dinv-tag-champ') && inventory.includes('dinv-tag-elem') && inventory.includes('inventoryLegend') && main.includes('breakerType') && main.includes('def.enumValue') && main.includes('elem-icons-${version}-v2'));
check('Anti-Champion 2.0 aus dem Rahmen', champions.includes('Anti-Champion 2.0') && champions.includes('frameBreakerType') && champions.includes('aggressiv') && champions.includes('rapid.?fire'));
check('Xûr nutzt externes Stylesheet', xurHtml.includes('href="xur.css"') && !xurHtml.includes('<style>'));
check('Offline-Ausgang puffert Transfers', inventory.includes('d2tool.outbox') && inventory.includes('runOutbox') && index.includes('inventoryOutbox'));
check('HUD-Layout-Editor im Overlay', index.includes('hudEditorPanel') && overlayHud.includes('maybeApplyAutoHudProfile') && config.includes('hudAutoProfile') && settings.includes('hudScale'));
check('Dashboard-Kartengröße und -suche', dashboardSource.includes('applyDashboardCardView') && index.includes('dashCardSearch') && config.includes('dashboardCardSize'));
check('Analyse als PNG exportierbar', dashboardSource.includes('exportAnalyticsPng') && preload.includes('captureDashboard') && main.includes('dashboard:capture'));
check('Maximum-Kompression im Build', pkg.build && pkg.build.compression === 'maximum');
check('HUD-Editor ausgelagert', overlayHud.includes('createOverlayHud') && app.includes("from './overlay-hud.js'"));
check('Einstellungen lazy geladen', app.includes("import('./settings.js')") && settingsBindings.includes('BINDING_ACTIONS'));
check('Offline-Ausgang Detailpanel', inventory.includes('renderOutboxPanel') && index.includes('inventoryOutboxPanel'));
check('Loadout-Warteschlange Panel', inventory.includes('renderLoadoutQueuePanel') && index.includes('loadoutQueuePanel'));
check('Champion-Prüfung', inventory.includes('openChampionAudit') && index.includes('championAuditPanel'));
check('Suche hervorheben', inventory.includes('highlightSearchText') && inventory.includes('dinv-mark'));
check('Release-Workflow', releaseWorkflow.includes('gh release create') && releaseWorkflow.includes('npm run dist'));
check('Web-Einstellungsseiten entfernt', !index.includes('data-settings-panel="web"') && !index.includes('data-settings-panel="custom"'));
check('Config-Rettung aus .bak', config.includes('config.json.bak') && config.includes('repairedFrom = \'config.json.bak\''));
check('Loadout-Warteschlange persistent', inventory.includes('LOADOUT_QUEUE_KEY') && inventory.includes('readStoredLoadoutQueue'));
check('Outbox mit Backoff und Konfliktvorschau', inventory.includes('nextTryAt') && inventory.includes('outboxConflictText'));
check('Englische Übersetzung lazy', index.indexOf('i18n-en.js') < 0 && read('renderer/js/i18n.js').includes('ensureDictionary'));
check('HUD-Regeln und Overlay-Drag', overlayHud.includes('chipRules') && overlayHud.includes("bar.addEventListener('drop'"));
check('Dashboard-Karten einzeln und Heute-Ansicht', dashboardSource.includes('dashboardCardSizes') && index.includes('value="today"'));
check('Befehlspalette für Ausgang/Queue/Champion', app.includes('d2-outbox-send') && app.includes('d2-loadout-queue-open') && app.includes('d2-champion-audit-open'));
check('ODER-Suche in der Inventarsuche', inventory.includes('splitOrGroups') && inventory.includes('matchGroups.some'));
check('Daten-Migration als eigenes Modul', read('electron/data-migration.js').includes('migrateInstalledDataToAppData'));
check('Lokale API für Ausgang/Queue/Champion', read('electron/api-commands.js').includes('/action/outbox/send') && read('electron/api-commands.js').includes('/action/loadout/queue'));
check('Bungie-Icon-Cache und Platzhalter', main.includes("protocol.handle('d2icon'") && index.includes('d2icon:') && read('renderer/styles.css').includes('Bungie-Icon-Platzhalter'));
check('Budget für den ersten Inventar-Render', inventory.includes('__D2_FIRST_RENDER_MS__') && inventory.includes('__D2_RENDER_BUDGET_MS__'));
check('Web-Stub und Kategorie-Daten entfernt', !app.includes('const web = {') && !app.includes('APP_CATEGORY') && !app.includes('let categories ='));
check('Controller ohne Webview-Option', !read('renderer/js/controller.js').includes('getActiveWebview: () =>'));
check('Champion-Planer mit Artefakt und Swaps', tools.includes('renderChampionPlanner') && tools.includes('artifactBreakers') && tools.includes('championSwapSuggestions'));
check('Build-Lückenanalyse', tools.includes('renderBuildGap') && tools.includes('data-gap-target') && tools.includes('data-gap-loadout'));
check('Crafting-Materialplan', tools.includes('renderCraftingMaterialPlan') && tools.includes('Crafting-Materialplan'));
check('Händler-Beobachtung mit Preistrend', tools.includes('renderVendorWatchlist') && tools.includes('vendorPriceTrend') && tools.includes('d2tool.vendorPrices'));
check('Post-Game-Karte und Auto-Recap', tools.includes('renderPostGameCard') && tools.includes('d2tool.autoRecap') && tools.includes('data-session-auto'));
check('Snapshot-Diff mit Details', inventory.includes('addedItems') && inventory.includes('movedItems') && tools.includes('diff.addedItems'));
check('Aktive Such-Chips', inventory.includes('activeSearchTokens') && inventory.includes('data-search-remove'));
check('Loadout-Undo', inventory.includes('Loadout gelöscht') && inventory.includes('setUndo'));
check('Postfach-Alter und Kapazität', tools.includes('postmasterSeen') && tools.includes('Älteste zuerst'));
check('Aktionswarteschlange einzeln', tools.includes('data-queue-retry-index') && tools.includes('data-queue-remove-index'));
check('Token-Ablaufwarnung', tools.includes('expiryWarning') && tools.includes('läuft in'));
check('Badge-Legende barrierefrei', inventory.includes("setAttribute('aria-describedby', 'inventoryLegend')") && inventory.includes("setAttribute('role', 'note')"));
check('Config-Schema und Migration', config.includes('schemaVersion') && config.includes('migrateConfig') && config.includes('mergeKnown'));
check('Tresor-Virtualisierung', inventory.includes('content-visibility') && inventory.includes('function tileWindow'));
check('Panel-Fehlergrenze', tools.includes('inv-tool-error') && tools.includes('data-tools-recover'));
check('Branding zentralisiert', fs.existsSync(path.join(ROOT, 'branding.json')) && syncLe.includes('branding.json') && syncLe.includes('LE_BRAND'));
check('Release-Pipeline verdrahtet', pkg.scripts && pkg.scripts['release:all'] === 'node tools/release-all.js' && pkg.scripts.preflight === 'node tools/preflight.js' && pkg.scripts['baselines:update'] === 'node tools/visual-baselines.js');
check('Stream-Deck-Dashboard-Actions', /com\.freakitout\.d2tool\.champion/.test(manifest) && /com\.freakitout\.d2tool\.routine/.test(manifest) && /com\.freakitout\.d2tool\.cockpit/.test(manifest) && /com\.freakitout\.d2tool\.loadout\.slot/.test(manifest));
check('Stream-Deck-Status und Aktionen', streamdeck.includes('state.champion') && streamdeck.includes('loadoutsList') && streamdeck.includes('runRoutine') && streamdeck.includes('maybeSwitchProfile') && streamdeck.includes('/action/postmaster/collect-safe') && streamdeck.includes('/action/session-goal'));
check('Stream-Deck-API-Felder', main.includes('localApiChampionSummary') && main.includes('postmaster/collect-safe') && main.includes('champion,') && main.includes('sessionGoals'));
check('Stream-Deck-Modi im Renderer', app.includes("action === 'mode'") && app.includes("action === 'session-goal'") && app.includes("action === 'emergency'"));
check('Session-Ziel-Auto-Fortschritt', tools.includes('advanceAutoGoals') && tools.includes("auto: 'gm'") && tools.includes("auto: 'catalyst'"));
check('Netzwerk-Transfer-Jobs', main.includes('runTransferJob') && main.includes('transferJobView') && preload.includes('bungieJobs') && tools.includes('data-transfer-cancel') && tools.includes('data-transfer-retry') && main.includes('transferJobChain'));
check('Read-only blockt neue Schreibaktionen', main.includes("'postmaster/collect-safe'") && main.includes("'security/lock'") && main.includes("'session-goal'") && main.includes("'emergency'"));
const ui = read('renderer/js/ui.js');
check('Toast-Kategorie-Aktionen werden gerendert', ui.includes('resolvedActions') && ui.includes('data-toast-action'));
check('Benachrichtigungsregeln', main.includes('notificationAllowed') && config.includes('rules: []') && tools.includes('renderNotificationRulesCard') && tools.includes('data-notif-rule-add'));
check('Benachrichtigungsregeln zentral', (main.match(/function notificationAllowed\(/g) || []).length === 1 && main.includes('function notificationAllowed(category, message)'));
check('Overlay-Champion-HUD', app.includes('updateOverlayChampion') && index.includes('overlayChampion') && app.includes('championSummaryText'));
check('Post-Game-Overlay', app.includes('showPostGameOverlay') && index.includes('postGameOverlay') && index.includes('postGameWeek'));
check('Post-Game erkennt Wiederholungen', app.includes('liveActivityKey') && app.includes('previousKey !== liveActivityKey'));
check('Aufgeräumtes Overlay', config.includes('minimal: true') && index.includes('ovShowMinimal') && index.includes('overlayMoreBtn') && app.includes("classList.toggle('overlay-minimal'"));
check('Aufgeräumte Werkzeug-Übersicht', tools.includes("fold('Schnellzugriff'") && tools.includes('renderDataHealth() + renderSelfTestCard'));
check('Preflight trennt Editionen exakt', preflight.includes('IS_LE ? [PRODUCT') && preflight.includes('escapeRegex') && preflight.includes('-match $n'));
// Reflow vor dem Scroll-Restore: Ohne die Höhenmessung klemmt der
// Browser die Position nach innerHTML auf 0 (Inhalt noch nicht layoutet).
check('Scroll-Restore erzwingt Layout (Werkzeuge)', /void host\.scrollHeight;\s*\n\s*host\.scrollTop = previousScrollTop/.test(tools));
check('Scroll-Restore erzwingt Layout (Inventar)', /void body\.scrollHeight;\s*\n\s*body\.scrollTop = previousScrollTop/.test(inventory));
check('Scroll-Restore erzwingt Layout (Editor)', /void drawerBodyEl\.scrollHeight;\s*\n\s*drawerBodyEl\.scrollTop = scroll/.test(inventory));
check('Scroll-Ziel überlebt Folge-Renders (Werkzeuge)', tools.includes('pendingScrollTarget') && tools.includes('reusePending'));
check('Scroll-Ziel überlebt Folge-Renders (Inventar)', inventory.includes('inventoryPendingScroll') && inventory.includes('drawerPendingScroll'));
check('Offene Details überleben Render (kein Sprung)', tools.includes('captureOpenDetails') && tools.includes('restoreOpenDetails'));
check('Controller scrollt auch die Werkzeuge', controller.includes('#inventoryView:not(.hidden) .inventory-tools-tab:not(.hidden)') && controller.includes('.inventory-tools-tab'));
// content-visibility mit falscher Platzhalterhöhe ließ Karten beim
// Scrollen/Rendern zwischen 120px und echter Höhe springen.
const dashboardCss = read('renderer/dashboard.css');
const toolsCss = read('renderer/tools.css');
const styles = read('renderer/styles.css');
check('Werkzeugkarten ohne Lazy-Paint-Höhensprung', dashboardCss.includes('content-visibility: visible') && !/\.inv-tool-card\s*\{\s*content-visibility:\s*auto/.test(dashboardCss));
check('Scroll-Restore statt Browser-Anchoring', /overflow-anchor:\s*none/.test(styles));
check('Kein Lazy-Paint mit falschen Höhen', !/content-visibility:\s*auto/.test(dashboardCss + toolsCss + styles));
check('Sticky-Navigation ohne Backdrop-Blur', !/\.inv-tools-nav\s*\{[^}]*backdrop-filter\s*:/s.test(toolsCss));
const dashboardJs = read('renderer/js/dashboard.js');
const analyticsJs = read('renderer/js/dashboard-analytics.js');
check('Dashboard hat Aktivitäts-Analyse',
  dashboardJs.includes('dashAnalyticsBody') && dashboardJs.includes('buildActivityAnalytics') &&
  analyticsJs.includes('buildActivityAnalytics') && index.includes('dashboard-analytics.js') && index.includes('dashAnalytics'));
check('Dashboard hat Fokusmodus',
  dashboardJs.includes('dashboardFocus') && index.includes('data-dash-action="focus"') && index.includes('data-dash-focus="hide"'));
check('Einstellungen haben Einfach/Erweitert',
  index.includes('settingsAdvancedBtn') && settings.includes('settings-simple') && index.includes('data-settings-advanced'));
check('Loadout-Warteschlange und Konflikte',
  inventory.includes('queueLoadout') && inventory.includes('loadoutConflicts') && inventory.includes('data-loadout-queue'));
check('Controller erreicht Titelleiste und Toolbar im Inventar',
  controller.includes('Inventar und Dashboard bewusst NICHT') && !controller.includes("'#inventoryView:not(.hidden)'"));
check('SBOM-Werkzeug vorhanden', fs.existsSync(path.join(ROOT, 'tools', 'make-sbom.js')));
check('Destiny-2-Beenden vollständig entfernt', !/quitGame|game:quit|overlayQuitGameBtn/.test(app + index + main + preload + config + settings));
check('Händler-Verfügbarkeit erklärt', tools.includes('dim-vendors-hint') && tools.includes('Xûr erscheint Freitag bis Dienstag'));
check('Inventar nutzt Fenster-/Chunk-Rendering', inventory.includes('chunkedLists') && inventory.includes('content-visibility: auto') && inventory.includes('data-inv-chunk'));
check('README nennt neue Features', readme.includes('Command Palette') && readme.includes('Auto-Checkliste') && readme.includes('Multi-Build-Ziele'));

if (failures) {
  console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`App-Feature-Test OK: ${checks} Prüfungen.`);
