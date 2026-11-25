'use strict';

// ============================================================
// Konfigurations-Persistenz-Test (Electron)
// ============================================================
// Prüft, dass Loadouts, Favoriten, gemerkte Suchen, Sortierung und
// Wunschliste jedes Speichern überleben. Genau diese Felder wurden
// früher von mergeKnown(DEFAULTS, …) verworfen, weil sie in DEFAULTS
// fehlten – importierte Loadouts verschwanden dadurch sofort wieder.
//
// Aufruf: npm run test:config

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2tool-config-test-'));
app.setPath('userData', tempDir);
app.disableHardwareAcceleration();

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail == null ? '' : String(detail) });
}

app.whenReady().then(() => {
  try {
    const config = require(path.join(projectRoot, 'electron', 'config.js'));
    config.load();
    config.set({});

    const loadout = {
      id: 'cfgtest-loadout',
      name: 'Persistenz-Test',
      classType: 0,
      characterId: 'c-titan',
      items: [
        { hash: 4225322581, instanceId: 'i-1', name: 'Waffe', typeName: 'Schrotflinte', icon: '', bucket: 1498876634, classType: 3 },
        { hash: 1341951177, instanceId: 'i-2', name: 'Brust', typeName: 'Brustschutz', icon: '', bucket: 14239492, classType: 0 }
      ],
      mods: [{ h: 4048838440, n: 'Mod', p: 'enhancements.armor', d: '', sb: 0, si: -1 }],
      artifactPerks: [],
      subclassPlugs: [{ idx: 0, hash: 7001, n: 'Hammer' }],
      fashion: {},
      notes: 'Test'
    };

    config.set({
      bungie: {
        loadouts: [loadout],
        favs: { 'i-1': true },
        savedSearches: ['is:dupe'],
        itemSort: 'name',
        wishlistUrl: 'https://example.com/list.txt',
        itemNotes: { 'i-armor3': 'Meine Notiz' },
        armorWishlist: [{ id: 'w1', name: 'Test-Wunsch', archetype: 'Kraftpaket', minTotal: 70 }],
        xurHistory: [{ at: 1, items: [{ hash: 3102, name: 'Perk-Testwaffe' }] }]
      },
      appearance: { colorblind: true, highContrast: true, uiLanguage: 'en' },
      statsHud: { bounds: { x: 30, y: 40, width: 330, height: 250 } }
    });

    const first = config.get().bungie;
    check('Loadout gespeichert', first.loadouts.length === 1, first.loadouts.length);
    check('Loadout-Name erhalten', first.loadouts[0] && first.loadouts[0].name === 'Persistenz-Test', first.loadouts[0] && first.loadouts[0].name);
    check('Klassen-Typ erhalten (0=Titan)', first.loadouts[0] && first.loadouts[0].classType === 0, first.loadouts[0] && first.loadouts[0].classType);
    check('Item-Buckets erhalten', (first.loadouts[0] || {}).items.every((item) => item.bucket > 0), JSON.stringify(((first.loadouts[0] || {}).items || []).map((item) => item.bucket)));
    check('Favorit erhalten', first.favs['i-1'] === true, JSON.stringify(first.favs));
    check('Gemerkte Suche erhalten', (first.savedSearches || []).includes('is:dupe'), JSON.stringify(first.savedSearches));
    check('Sortierung erhalten', first.itemSort === 'name', first.itemSort);
    check('Wunschliste erhalten', first.wishlistUrl === 'https://example.com/list.txt', first.wishlistUrl);
    check('Item-Notiz erhalten', first.itemNotes['i-armor3'] === 'Meine Notiz', JSON.stringify(first.itemNotes));
    check('Farbmodus gespeichert', config.get().appearance.colorblind === true);
    check('Hoher Kontrast gespeichert', config.get().appearance.highContrast === true);
    check('UI-Sprache gespeichert', config.get().appearance.uiLanguage === 'en', config.get().appearance.uiLanguage);
    check('Rüstungs-Wunsch gespeichert', (config.get().bungie.armorWishlist || []).length === 1 && config.get().bungie.armorWishlist[0].archetype === 'Kraftpaket', JSON.stringify(config.get().bungie.armorWishlist));
    check('Xûr-Historie gespeichert', (config.get().bungie.xurHistory || []).length === 1, JSON.stringify(config.get().bungie.xurHistory));
    config.set({ appearance: { uiLanguage: 'fr' } });
    check('UI-Sprache begrenzt', config.get().appearance.uiLanguage === 'de', config.get().appearance.uiLanguage);
    const hudBounds = config.get().statsHud.bounds;
    check('Stat-HUD-Position gespeichert', hudBounds && hudBounds.width === 330 && hudBounds.height === 250 && hudBounds.x === 30, JSON.stringify(hudBounds));

    // Weiterer Speichervorgang darf nichts davon verlieren.
    config.set({ overlay: { opacity: 0.9 } });
    const second = config.get().bungie;
    check('Loadout überlebt weiteres Speichern', second.loadouts.length === 1, second.loadouts.length);
    check('Favoriten überleben weiteres Speichern', second.favs['i-1'] === true, JSON.stringify(second.favs));
    check('Suchen überleben weiteres Speichern', (second.savedSearches || []).includes('is:dupe'), JSON.stringify(second.savedSearches));
    check('Sortierung überlebt weiteres Speichern', second.itemSort === 'name', second.itemSort);
    check('Wunschliste überlebt weiteres Speichern', second.wishlistUrl === 'https://example.com/list.txt', second.wishlistUrl);

    // Poststellen-Zusatzeinstellungen (compact/lock/autoGame) müssen
    // trotz mergeKnown erhalten bleiben.
    config.set({ postmaster: { compact: true, lock: true, autoGame: true, opacity: 0.8, theme: 'light', refreshSeconds: 30, inventoryOnly: true } });
    const pmFirst = config.get().postmaster;
    check('Postmaster kompakt gespeichert', pmFirst.compact === true, pmFirst.compact);
    check('Postmaster gesperrt gespeichert', pmFirst.lock === true, pmFirst.lock);
    check('Postmaster AutoGame gespeichert', pmFirst.autoGame === true, pmFirst.autoGame);
    check('Postmaster Theme gespeichert', pmFirst.theme === 'light', pmFirst.theme);
    check('Postmaster Refresh gespeichert', pmFirst.refreshSeconds === 30, pmFirst.refreshSeconds);
    check('Postmaster InventoryOnly gespeichert', pmFirst.inventoryOnly === true, pmFirst.inventoryOnly);
    config.set({ overlay: { opacity: 0.91 } });
    const pmSecond = config.get().postmaster;
    check('Postmaster-Optionen überleben weiteres Speichern',
      pmSecond.compact === true && pmSecond.lock === true && pmSecond.autoGame === true &&
      pmSecond.theme === 'light' && pmSecond.refreshSeconds === 30 && pmSecond.inventoryOnly === true,
      JSON.stringify(pmSecond));

    config.set({ gamepad: { controllerIndex: 2, quickMenuButton: 10, scrollSpeed: 1500, scrollInvert: true, scrollDeadzone: 0.3 } });
    check('Overlay-Controller-Index gespeichert', config.get().gamepad.controllerIndex === 2, config.get().gamepad.controllerIndex);
    check('Schnellmenü-Taste gespeichert', config.get().gamepad.quickMenuButton === 10, config.get().gamepad.quickMenuButton);
    check('Scroll-Geschwindigkeit gespeichert', config.get().gamepad.scrollSpeed === 1500, config.get().gamepad.scrollSpeed);
    check('Scroll-Richtung gespeichert', config.get().gamepad.scrollInvert === true, config.get().gamepad.scrollInvert);
    check('Scroll-Deadzone gespeichert', config.get().gamepad.scrollDeadzone === 0.3, config.get().gamepad.scrollDeadzone);
    config.set({ overlay: { opacity: 0.92 } });
    check('Overlay-Controller-Index überlebt Speichern', config.get().gamepad.controllerIndex === 2, config.get().gamepad.controllerIndex);
    check('Scroll-Optionen überleben Speichern',
      config.get().gamepad.scrollSpeed === 1500 && config.get().gamepad.scrollInvert === true && config.get().gamepad.scrollDeadzone === 0.3,
      JSON.stringify({ speed: config.get().gamepad.scrollSpeed, invert: config.get().gamepad.scrollInvert, deadzone: config.get().gamepad.scrollDeadzone }));
    config.set({ gamepad: { quickMenu: { popup: { top: 'favorite' }, inventory: { left: 'keyboard' } } } });
    const qm = config.get().gamepad.quickMenu;
    check('Schnellmenü Popup-Aktion gespeichert', qm.popup.top === 'favorite', JSON.stringify(qm.popup));
    check('Schnellmenü Defaults erhalten', qm.popup.right === 'to-char' && qm.inventory.top === 'loadout', JSON.stringify(qm));
    check('Schnellmenü Inventar-Aktion gespeichert', qm.inventory.left === 'keyboard', JSON.stringify(qm.inventory));

    config.set({ overlay: { scale: 1.2, margin: 40, layouts: { 'display-1': { width: 70, height: 80, anchor: 'top-left' } } } });
    const ov = config.get().overlay;
    check('Overlay-Skalierung gespeichert', ov.scale === 1.2, ov.scale);
    check('Overlay-Randabstand gespeichert', ov.margin === 40, ov.margin);
    check('Overlay-Layout pro Monitor gespeichert',
      ov.layouts['display-1'] && ov.layouts['display-1'].width === 70 && ov.layouts['display-1'].anchor === 'top-left',
      JSON.stringify(ov.layouts));
    config.set({ overlay: { scale: 9, margin: -5, layouts: { bad: 'x' } } });
    const ovClamped = config.get().overlay;
    check('Overlay-Skalierung begrenzt', ovClamped.scale === 1.4, ovClamped.scale);
    check('Overlay-Randabstand begrenzt', ovClamped.margin === 0, ovClamped.margin);
    check('Ungültiges Overlay-Layout verworfen', !ovClamped.layouts.bad, JSON.stringify(ovClamped.layouts));
    config.set({ xur: { bounds: { x: 10, y: 20, width: 420, height: 560 } } });
    const xurBounds = config.get().xur.bounds;
    check('Xûr-Overlay-Position gespeichert',
      xurBounds && xurBounds.width === 420 && xurBounds.height === 560 && xurBounds.x === 10,
      JSON.stringify(xurBounds));
    config.set({ xur: { bounds: { width: 100, height: 100 } } });
    check('Ungültige Xûr-Overlay-Größe verworfen', config.get().xur.bounds === null, JSON.stringify(config.get().xur.bounds));
    config.set({ bungie: { godrollMode: 'traits', acceptedNear: ['i-1'] }, xur: { remind: true } });
    check('Godroll-Modus gespeichert', config.get().bungie.godrollMode === 'traits', config.get().bungie.godrollMode);
    check('Akzeptierte Fast-Godrolls gespeichert', config.get().bungie.acceptedNear.includes('i-1'), JSON.stringify(config.get().bungie.acceptedNear));
    config.set({ bungie: { godrollMode: 'unsinn' } });
    check('Godroll-Modus begrenzt', config.get().bungie.godrollMode === 'exact', config.get().bungie.godrollMode);
    check('Xûr-Erinnerung gespeichert', config.get().xur.remind === true, config.get().xur.remind);

    // Neue Normalisierungen: flexible Wunschregeln, Item-Tags,
    // Sicherheit und Integrationen.
    config.set({ bungie: { wishlistMinMatch: 3 } });
    check('Wunsch-Mindesttreffer gespeichert', config.get().bungie.wishlistMinMatch === 3, config.get().bungie.wishlistMinMatch);
    config.set({ bungie: { wishlistMinMatch: 99 } });
    check('Wunsch-Mindesttreffer begrenzt', config.get().bungie.wishlistMinMatch === 4, config.get().bungie.wishlistMinMatch);
    config.set({
      bungie: {
        customWishlist: [
          { id: 'w1', hash: 123, name: 'Testwaffe', role: 'pve', notes: 'Test', perks: [11, 22, 33] },
          { id: '', hash: 0, perks: [] }
        ],
        itemTags: { inst1: 'keep', inst2: 'unfug' },
        inventoryDensity: 'compact'
      }
    });
    check('Eigene Wunschregel gespeichert', (config.get().bungie.customWishlist || []).length === 1, config.get().bungie.customWishlist);
    check('Ungültiger Item-Tag verworfen', config.get().bungie.itemTags.inst1 === 'keep' && !config.get().bungie.itemTags.inst2, config.get().bungie.itemTags);
    check('Inventar-Dichte gespeichert', config.get().bungie.inventoryDensity === 'compact', config.get().bungie.inventoryDensity);
    config.set({ bungie: { folders: [{ id: 'f1', name: 'PvP', color: '#4ade80' }], itemFolders: { inst1: 'f1', inst2: 'fehlt' } } });
    check('Ordner gespeichert', (config.get().bungie.folders || []).length === 1 && config.get().bungie.folders[0].name === 'PvP', config.get().bungie.folders);
    check('Ordner-Zuordnung geprüft', config.get().bungie.itemFolders.inst1 === 'f1' && !config.get().bungie.itemFolders.inst2, config.get().bungie.itemFolders);
    config.set({ security: { readOnly: true } });
    check('Read-only-Modus gespeichert', config.get().security.readOnly === true, config.get().security.readOnly);
    const configured = config.set({ integrations: { localApi: { enabled: true, port: 7331, token: 'abcdef0123456789' }, discordWebhook: 'https://discord.com/api/webhooks/1/abc' } });
    check('Lokale API gespeichert', config.get().integrations.localApi.enabled === true && config.get().integrations.localApi.port === 7331, config.get().integrations.localApi);
    check('Discord-Webhook geprüft', Boolean(config.get().integrations.discordWebhook), config.get().integrations.discordWebhook);
    config.set({ notifications: { enabled: false, quietStart: '22:00', quietEnd: '06:30', godroll: false } });
    check('Benachrichtigungen gespeichert', config.get().notifications.enabled === false && config.get().notifications.godroll === false && config.get().notifications.quietStart === '22:00', config.get().notifications);
    config.set({ notifications: { quietStart: '99:99' } });
    check('Ungültige Ruhezeit verworfen', /^\d{2}:\d{2}$/.test(config.get().notifications.quietStart) && config.get().notifications.quietStart !== '99:99', config.get().notifications.quietStart);
    config.set({ bungie: { savedViews: [{ id: 'v1', name: 'PvP', query: 'is:godroll' }, { id: '', name: '', query: '' }] } });
    check('Gespeicherte Ansichten normalisiert', (config.get().bungie.savedViews || []).length === 1, config.get().bungie.savedViews);
    config.set({ onboardingDone: true });
    check('Einrichtungs-Status gespeichert', config.get().onboardingDone === true, config.get().onboardingDone);
    config.set({ tourDone: true, appearance: { reduceMotion: true }, notifications: { suppressDuringActivity: false } });
    check('Tour-/A11y-Status gespeichert', config.get().tourDone === true && config.get().appearance.reduceMotion === true, config.get().appearance);
    check('Aktivitäts-Stummschaltung gespeichert', config.get().notifications.suppressDuringActivity === false, config.get().notifications);
    config.set({ bungie: { materialGoals: { 3155914962: 500000 }, loadoutVersions: { l1: [{ at: 1, name: 'v1', items: [{ hash: 1, instanceId: 'i1', name: 'Test', bucket: 1 }], mods: [{ hash: 2 }] }] } } });
    check('Material-Ziel gespeichert', config.get().bungie.materialGoals['3155914962'] === 500000, config.get().bungie.materialGoals);
    check('Loadout-Version gespeichert', ((config.get().bungie.loadoutVersions.l1 || [])[0] || {}).items.length === 1, config.get().bungie.loadoutVersions);

    // Datei-Check: der Loadout steht wirklich in config.json.
    const file = JSON.parse(fs.readFileSync(path.join(tempDir, 'config.json'), 'utf8'));
    check('Loadout in config.json', (file.bungie.loadouts || []).length === 1, (file.bungie.loadouts || []).length);
  } catch (error) {
    check('Test ohne Ausnahme', false, error && (error.stack || error.message));
  }

  let failed = 0;
  for (const entry of results) {
    if (!entry.ok) failed += 1;
    console.log(`${entry.ok ? 'OK  ' : 'FAIL'} ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed}/${results.length} Konfigurations-Tests bestanden.`);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    // egal
  }
  app.exit(failed ? 1 : 0);
});
