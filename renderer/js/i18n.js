'use strict';

// ------------------------------------------------------------
// UI-Sprachumschaltung Deutsch/Englisch
// ------------------------------------------------------------
// Die statischen Übersetzungen liegen in i18n-en.js (erzeugt von
// tools/make-i18n.js). Dieser Laufzeit-Übersetzer tauscht sichtbare
// Textknoten und Attribute (placeholder/title/aria-label) aus, ohne
// die Render-Funktionen umzubauen. Bei Deutsch werden die Originale
// wiederhergestellt.
(function () {
  let dictionary = window.__I18N_EN__ || {};
  let dictionaryPromise = null;

  // Die englische Übersetzung (ca. 350 KB) wird erst geladen, wenn
  // Englisch tatsächlich gewählt ist. Deutsch braucht sie nie.
  function ensureDictionary() {
    if (window.__I18N_EN__) {
      dictionary = window.__I18N_EN__;
      return Promise.resolve(dictionary);
    }
    if (dictionaryPromise) return dictionaryPromise;
    dictionaryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/i18n-en.js';
      script.async = true;
      script.onload = () => {
        dictionary = window.__I18N_EN__ || {};
        resolve(dictionary);
      };
      script.onerror = () => {
        dictionaryPromise = null;
        reject(new Error('i18n-en.js konnte nicht geladen werden.'));
      };
      document.head.appendChild(script);
    });
    return dictionaryPromise;
  }
  const rawPatterns = window.__I18N_PATTERNS__ || [];
  const EXTRA_PATTERNS = [
    [/^(\d+) ausgewählt$/, '$1 selected'],
    [/^(\d+) Treffer$/, '$1 results'],
    [/^Neu (\d+)$/, 'New $1'],
    [/^vor (.+?) h$/, '$1 h ago'],
    [/^vor (.+?) min$/, '$1 min ago'],
    [/^Poststelle (\d+)\/(\d+)$/, 'Postmaster $1/$2'],
    [/^(.+) Licht$/, '$1 Power'],
    [/^(\d+)\/(\d+) Rüstungsteile$/, '$1/$2 armor pieces'],
    [/^(\d+) Teile$/, '$1 pieces'],
    [/^keine Champion-Fähigkeit$/, 'no Champion ability'],
    [/^Mods entpackt: (\d+)\/(\d+)$/, 'Mods stripped: $1/$2'],
    [/^(\d+) Mod(?:s)? von (\d+) Item(?:s)? entfernen\?$/, 'Remove $1 mod(s) from $2 item(s)?'],
    // Einrichtungsassistent und Verbindungstest
    [/^Key gespeichert \((\d+) Zeichen\)\.$/, 'Key saved ($1 characters).'],
    [/^Angemeldet als (.+)\.$/, 'Signed in as $1.'],
    [/^(\d+) Zeichen, verschlüsselt gespeichert\.$/, '$1 characters, stored encrypted.'],
    [/^(\d+) Zeichen, im Klartext gespeichert\.$/, '$1 characters, stored in plain text.'],
    [/^API-Key gültig \(Manifest (.+)\)\.$/, 'API key valid (manifest $1).'],
    [/^Gesetzt \((.+)\)\.$/, 'Set ($1).'],
    [/^Angemeldet, automatische Erneuerung aktiv \(Token bis (.+) Uhr\)\.$/, 'Signed in, automatic renewal active (token until $1).'],
    [/^Angemeldet, aber ohne Refresh-Token – Ende um (.+) Uhr\.$/, 'Signed in without a refresh token – ends at $1.'],
    [/^App: Lesen (.+) · Verschieben (.+) — Autorisierung: Lesen (.+) · Verschieben (.+)$/, 'App: Read $1 · Move $2 — Authorization: Read $3 · Move $4'],
    [/^Prüfung nicht möglich: (.+)$/, 'Check not possible: $1'],
    [/^(\d+) Waffen$/, '$1 Weapons'],
    [/^(\d+) Rüstungsteile$/, '$1 Armor pieces'],
    [/^Offline-Ausgang: (\d+) Aktion(?:en)? warten(?: \((.+)\))?(?: – (.+))?$/, 'Offline outbox: $1 action(s) waiting$2$3'],
    [/^Offline-Ausgang: (\d+) gesendet(?:, (\d+) warten weiter)?\.$/, 'Offline outbox: $1 sent$2.'],
    [/^Nächster Versuch (.+)$/, 'Next attempt $1'],
    [/^Loadout-Warteschlange: (.+)$/, 'Loadout queue: $1'],
    [/^Warteschlange wiederhergestellt – „Fortsetzen“ drücken\.$/, 'Queue restored – press “Resume”.'],
    [/^Warteschlange angehalten – „Fortsetzen“ drücken\.$/, 'Queue paused – press “Resume”.'],
    [/^HUD-Profil „(.+)“ angewendet\.$/, 'HUD profile “$1” applied.'],
    [/^HUD-Profil „(.+)“ gespeichert\.$/, 'HUD profile “$1” saved.'],
    [/^(\d+) HUD-Profil\(e\) exportiert\.$/, '$1 HUD profile(s) exported.'],
    [/^(\d+) HUD-Profil\(e\) importiert\.$/, '$1 HUD profile(s) imported.'],
    [/^(\d+) Waffen? übernommen\.$/, 'Applied to $1 weapon(s).'],
    [/^(\d+) Waffe$/, '$1 weapon'],
    [/^(\d+) ohne Brecher$/, '$1 without breaker'],
    // Artefakt-Perks über die API
    [/^Artefakt-Perks: (\d+) \(über API\)$/, 'Artifact perks: $1 (via API)'],
    [/^Artefakt (.+) ist nicht ausgerüstet – (\d+) Perk\(s\) übersprungen\.$/, 'Artifact $1 is not equipped – $2 perk(s) skipped.'],
    [/^(\d+) Artefakt-Perk\(s\) angewendet, (\d+) übersprungen \(nicht freigeschaltet\/Tier\)$/, '$1 artifact perk(s) applied, $2 skipped (not unlocked/tier)'],
    [/^Reihe (\d+)$/, 'Row $1'],
    [/^(\d+) Artefakt-Perk\(s\) übernommen\.$/, '$1 artifact perk(s) taken over.']
  ];
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
  const SKIP_SELECTOR = [
    '#uiLanguage',
    '#onboardingLanguage',
    '#onboardingContentLanguage',
    '.inv-popup-name',
    '.dinv-tip-name',
    '.inv-perk-name',
    '.inv-cmp-name',
    '.inv-popup-flavor',
    '.inv-popup-desc',
    '.inv-tip-flavor',
    '.tip-flavor',
    '.tip-desc'
  ].join(',');

  // Destiny-Fachbegriffe: maschinelle Übersetzungen sind hier oft
  // unbrauchbar ("Tresor" → "Safe", "Nahkampf" → "Close combat").
  const OVERRIDES = {
    'Tresor': 'Vault',
    'Nahkampf': 'Melee',
    'Super': 'Super',
    'Klasse': 'Class',
    'Waffe': 'Weapon',
    'Waffen': 'Weapons',
    'Hüter': 'Guardian',
    'Meisterwerk': 'Masterwork',
    'Meisterwerke': 'Masterworks',
    'Godrolls': 'Godrolls',
    'Godroll': 'Godroll',
    'Legendär': 'Legendary',
    'Exotisch': 'Exotic',
    'Selten': 'Rare',
    'Gewöhnlich': 'Common',
    'Rüstung': 'Armor',
    'Rüstungsteil': 'Armor piece',
    'Rüstungsteile': 'Armor pieces',
    'Wöchentlich': 'Weekly',
    'Täglich': 'Daily',
    'Belohnungen': 'Rewards',
    'Aktivitäten': 'Activities',
    'Händler': 'Vendors',
    'Sammlung': 'Collection',
    'Übersicht': 'Overview',
    'Woche': 'Week',
    'Werkzeuge': 'Tools',
    'Einstellungen': 'Settings',
    'Sprache der Oberfläche': 'Interface language',
    'Sprache': 'Language',
    'Zum Dashboard': 'Open dashboard',
    'Destiny 2 Tool einrichten': 'Set up Destiny 2 Tool',
    'In fünf Schritten ist das Tool startklar. Du kannst alles später unter Einstellungen → Bungie ändern.': 'The tool is ready in five steps. You can change everything later in Settings → Bungie.',
    'Einstellungen öffnen': 'Open settings',
    '3. Anmeldung': '3. Sign-in',
    '4. Anmeldung': '4. Sign-in',
    '2. Spielsprache der Gegenstände': '2. Item language',
    'Spielsprache gespeichert – Gegenstände werden beim nächsten Aktualisieren neu geladen.': 'Game language saved – items will be reloaded on the next refresh.',
    'kein Cache': 'no cache',
    'Fehlt mir': 'Missing',
    'alle': 'all',
    'Für dauerhaftes Angemeldetbleiben die App im Portal auf „Vertraulich“ stellen und das Client-Secret oben eintragen.': 'To stay signed in permanently, set the app to “Confidential” in the portal and enter the client secret above.',
    'Klick: Inventar-Poststelle öffnen · Rechtsklick: Menü': 'Click: open inventory postmaster · Right-click: menu',
    'Tipp: Im Inventar mehrere Teile markieren und vergleichen; „Nicht-Favoriten“ wählt alles außer Favoriten/Godrolls.': 'Tip: Select several pieces in the inventory to compare; “Non-favorites” selects everything except favorites/god rolls.',
    'Spielen': 'Play',
    'Rüstungs-Wunschliste': 'Armor wishlist',
    'Vault-Cleanup': 'Vault cleanup',
    'Masterwork & Tuning': 'Masterwork & Tuning',
    'Händler-Alerts': 'Vendor alerts',
    'Build-Karte (PNG)': 'Build card (PNG)',
    'Als Text kopieren': 'Copy as text',
    'Alle Treffer': 'All matches',
    'Rückgängig': 'Undo',
    'aus': 'off',
    'Wochenübersicht': 'Weekly overview',
    'Aktivitäten diese Woche': 'Activities this week',
    'Erinnern': 'Remind',
    'Nur offene': 'Open only',
    'Alle': 'All',
    'Hoher Kontrast (hellere Texte/Ränder, dunklerer Hintergrund)': 'High contrast (brighter text/borders, darker background)',
    'Beenden': 'Quit',
    'Favoriten': 'Favorites',
    'Wunschliste': 'Wishlist',
    'Duplikate': 'Duplicates',
    'Poststelle': 'Postmaster',
    'Beutetasche': 'Backpack',
    'Anlegen': 'Equip',
    'Lagern': 'Store',
    'Markieren': 'Lock',
    'Entmarkieren': 'Unlock',
    'Schließen': 'Close',
    'Abbrechen': 'Cancel',
    'Speichern': 'Save',
    'Löschen': 'Delete',
    'Suchen': 'Search',
    'Suchen …': 'Search …',
    'Filter': 'Filter',
    'Sortierung': 'Sorting',
    'Seltenheit': 'Rarity',
    'Ausgewählt': 'Selected',
    'Zurücksetzen': 'Reset',
    'Hinzufügen': 'Add',
    'Entfernen': 'Remove',
    'Details': 'Details',
    'Status': 'Status',
    'Version': 'Version',
    'Aktualisieren': 'Refresh',
    'Laden': 'Load',
    'Verbinden': 'Connect',
    'Anmelden': 'Sign in',
    'Abmelden': 'Sign out',
    'Anmeldung erneuern': 'Refresh sign-in',
    'Erneut versuchen': 'Retry',
    'Mods entpacken': 'Strip mods',
    'Mods entfernen': 'Remove mods',
    'Nur Items auf einem Charakter können Mods verlieren.': 'Only items on a character can have mods stripped.',
    'Keine entfernbaren Mods in der Auswahl.': 'No removable mods in the selection.',
    'Die Mods werden nicht gelöscht, sondern nur aus den Sockets genommen.': 'The mods are not deleted, only removed from their sockets.',
    'Kopieren': 'Copy',
    'Vergleichen': 'Compare',
    'Teilen': 'Share',
    'Öffnen': 'Open',
    'Zurück': 'Back',
    'Weiter': 'Next',
    'Fertig': 'Done',
    'Gesundheit': 'Health',
    'Granate': 'Grenade',
    'Werte': 'Stats',
    'Erinnerungen': 'Reminders',
    'Erinnerung': 'Reminder',
    'Heutige Erinnerungen': "Today's reminders",
    'Wochenplan': 'Weekly schedule',
    'im Besitz': 'owned',
    'Beitrag': 'Contribution',
    'Gesamt': 'Total',
    'Basis': 'Base',
    'Tertiär': 'Tertiary',
    'Archetyp': 'Archetype',
    'Gear-Tier': 'Gear tier',
    'Auswahl': 'Selection',
    'Markiert': 'Locked',
    'Entmarkiert': 'Unlocked',
    'Materialien': 'Materials',
    'Währungen': 'Currencies',
    'Fortschritt': 'Progress',
    'Belohnung': 'Reward',
    'Belohnungen': 'Rewards',
    'Angebote': 'Offers',
    'Preis': 'Price',
    'Kosten': 'Cost',
    'Verfügbar': 'Available',
    'Xûr ist da': 'Xûr is here',
    'Xûr kommt am Freitag': 'Xûr arrives on Friday',
    'Verschwindet am Dienstag-Reset': 'Leaves at Tuesday reset',
    'Bereich': 'Section',
    'Kategorie': 'Category',
    'Scrollen': 'Scroll',
    'Präzise': 'Precise',
    'Maus zurückholen': 'Recover mouse',
    'Overlay ausblenden': 'Hide overlay',
    'Klick': 'Click',
    'D-Pad': 'D-Pad',
    'R-Stick': 'R-Stick',
    'LB/RB': 'LB/RB',
    'L3+R3': 'L3+R3',
    'A': 'A',
    'B': 'B',
    'X': 'X',
    'Y': 'Y',
    'LB': 'LB',
    'RB': 'RB',
    'LT': 'LT',
    'RT': 'RT',
    'L3': 'L3',
    'R3': 'R3',
    'Manifest-Zugriff': 'Manifest access',
    'Gespeicherte Anmeldung': 'Stored sign-in',
    'Anmeldung': 'Sign-in',
    'API-Key': 'API key',
    'Key gespeichert, aber nicht lesbar – bitte neu eingeben.': 'Key saved but unreadable – please enter it again.',
    'Noch kein Key gespeichert.': 'No key saved yet.',
    'Angemeldet.': 'Signed in.',
    'Nicht angemeldet.': 'Not signed in.',
    'Prüfe …': 'Checking …',
    'Keine Antwort.': 'No response.',
    'Client-ID gespeichert.': 'Client ID saved.',
    'Noch keine Client-ID gespeichert.': 'No client ID saved yet.',
    'Client-Secret gespeichert.': 'Client secret saved.',
    'Noch kein Client-Secret gespeichert.': 'No client secret saved yet.',
    'Gespeichert, aber auf diesem PC nicht entschlüsselbar – bitte den API-Key neu eingeben.': 'Stored, but not decryptable on this PC – please re-enter the API key.',
    'Fehlt – Einstellungen → Bungie.': 'Missing – Settings → Bungie.',
    'Antwort ohne Manifest-Version – Key prüfen.': 'Response without manifest version – check the key.',
    'Nur für Inventar/Loadouts nötig.': 'Only needed for inventory/loadouts.',
    'Gesetzt – Bungie stellt einen Refresh-Token aus.': 'Set – Bungie issues a refresh token.',
    'Nicht gesetzt: Als „öffentliche“ App endet die Anmeldung nach ca. 1 Stunde.': 'Not set: as a “public” app the sign-in ends after about 1 hour.',
    'Angemeldet, automatische Erneuerung aktiv.': 'Signed in, automatic renewal active.',
    'Angemeldet, aber ohne Refresh-Token – Ende nach ca. 1 Stunde.': 'Signed in without a refresh token – ends after about 1 hour.',
    'Nicht angemeldet – Inventar & Loadouts benötigen eine Anmeldung.': 'Not signed in – inventory & loadouts require a sign-in.',
    'Vorhanden, aber auf diesem PC nicht entschlüsselbar – bitte einmal ab- und neu anmelden.': 'Present, but not decryptable on this PC – please sign out and in again.',
    'Stärke': 'Strength',
    'Beweglichkeit': 'Mobility',
    'Resilienz': 'Resilience',
    'Erholung': 'Recovery',
    'Disziplin': 'Discipline',
    'Intellekt': 'Intellect'
  };

  const BLOCKED_PATTERNS = new Set(['^(.+?) Set(.+?)$']);
  const patterns = [
    ...EXTRA_PATTERNS.map(([re, target]) => ({ re, target })),
    ...rawPatterns
      .map(([source, target]) => {
        try {
          return { re: new RegExp(source), target, source };
        } catch (error) {
          return null;
        }
      })
      .filter((entry) => entry && !BLOCKED_PATTERNS.has(entry.source))
  ];

  let language = 'de';
  let observer = null;
  let scheduled = false;
  let textOriginals = new WeakMap();
  let touchedTexts = new Set();
  let attrOriginals = new WeakMap();
  let touchedAttrs = new Set();

  const normalise = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

  function fixTerm(text) {
    return String(text || '')
      .replace(/\bClose combat\b/g, 'Melee')
      .replace(/\bSafe\b/g, 'Vault')
      .replace(/\bPost Office\b/g, 'Postmaster')
      .replace(/\bLoot bag\b/g, 'Backpack')
      .replace(/\bOccupancy exported\b/g, 'Keybindings exported')
      .replace(/\bKey assignment\b/g, 'Key bindings')
      .replace(/^(\d+) hit$/, '$1 results');
  }

  function translateSingle(value) {
    const text = normalise(value);
    if (!text) return null;
    if (OVERRIDES[text]) return OVERRIDES[text];
    if (dictionary[text]) return fixTerm(dictionary[text]);
    for (const pattern of patterns) {
      const match = text.match(pattern.re);
      if (!match) continue;
      let output = pattern.target.replace(/__PH(\d+)__/g, (all, index) => match[Number(index) + 1] || '');
      output = output.replace(/\$(\d+)/g, (all, index) => match[Number(index)] || '');
      return fixTerm(output);
    }
    return null;
  }

  // Zusammengesetzte Anzeigen („Ausrüstung · Destiny Item Manager“,
  // „API-Key fehlt · nicht angemeldet“) segmentweise übersetzen.
  function translate(value) {
    const text = normalise(value);
    if (!text) return null;
    const direct = translateSingle(text);
    if (direct != null) return direct;
    for (const separator of [' · ', ' — ', ' – ']) {
      if (!text.includes(separator)) continue;
      const parts = text.split(separator);
      if (parts.length < 2 || parts.length > 8) continue;
      let changed = false;
      const output = parts.map((part) => {
        const translated = translateSingle(part);
        if (translated == null) return part;
        changed = true;
        return translated;
      });
      if (changed) return output.join(separator);
    }
    const colon = text.indexOf(': ');
    if (colon > 0 && colon < text.length - 2) {
      const left = text.slice(0, colon);
      const right = text.slice(colon + 2);
      const translatedLeft = translateSingle(left);
      const translatedRight = translate(right);
      if (translatedLeft != null || translatedRight != null) {
        return `${translatedLeft == null ? left : translatedLeft}: ${translatedRight == null ? right : translatedRight}`;
      }
    }
    return null;
  }

  function shouldSkip(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return true;
    if (SKIP_TAGS.has(element.tagName)) return true;
    return Boolean(element.closest(SKIP_SELECTOR));
  }

  function translateTextNode(node) {
    if (!node || !node.nodeValue || shouldSkip(node)) return;
    const value = node.nodeValue;
    const translated = translate(value);
    if (translated == null) return;
    if (!textOriginals.has(node)) textOriginals.set(node, value);
    touchedTexts.add(node);
    const leading = (value.match(/^\s*/) || [''])[0];
    const trailing = (value.match(/\s*$/) || [''])[0];
    const next = leading + translated + trailing;
    if (next !== value) node.nodeValue = next;
  }

  function translateAttribute(element, attribute) {
    if (!element || !element.getAttribute) return;
    const value = element.getAttribute(attribute);
    if (!value) return;
    const translated = translate(value);
    if (translated == null) return;
    let originals = attrOriginals.get(element);
    if (!originals) {
      originals = {};
      attrOriginals.set(element, originals);
    }
    if (!(attribute in originals)) originals[attribute] = value;
    touchedAttrs.add(element);
    if (translated !== value) element.setAttribute(attribute, translated);
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldSkip(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let node = walker.nextNode();
    while (node) {
      translateTextNode(node);
      node = walker.nextNode();
    }
    const elements = root.querySelectorAll ? root.querySelectorAll('[placeholder],[title],[aria-label]') : [];
    for (const element of elements) {
      translateAttribute(element, 'placeholder');
      translateAttribute(element, 'title');
      translateAttribute(element, 'aria-label');
    }
  }

  let pendingRoots = new Set();
  let pendingTexts = new Set();
  let pendingAttrs = new Set();

  function queueRecords(records) {
    for (const record of records) {
      if (record.type === 'characterData') {
        pendingTexts.add(record.target);
      } else if (record.type === 'attributes') {
        pendingAttrs.add(record.target);
      } else if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) pendingRoots.add(node);
        }
      }
    }
  }

  function scheduleApply() {
    if (language !== 'en' || scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      if (language !== 'en') return;
      const roots = pendingRoots;
      const texts = pendingTexts;
      const attrs = pendingAttrs;
      pendingRoots = new Set();
      pendingTexts = new Set();
      pendingAttrs = new Set();
      // Nur geänderte Teilbäume/Knoten übersetzen, nicht die ganze Seite.
      for (const root of roots) {
        if (root.isConnected) walk(root);
      }
      for (const node of texts) {
        if (node.isConnected) translateTextNode(node);
      }
      for (const element of attrs) {
        if (!element.isConnected) continue;
        translateAttribute(element, 'placeholder');
        translateAttribute(element, 'title');
        translateAttribute(element, 'aria-label');
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 30);
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver((records) => {
      if (language !== 'en') return;
      queueRecords(records);
      scheduleApply();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label']
    });
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
    pendingRoots = new Set();
    pendingTexts = new Set();
    pendingAttrs = new Set();
  }

  function restore() {
    for (const node of touchedTexts) {
      const original = textOriginals.get(node);
      if (original != null && node.parentNode) node.nodeValue = original;
    }
    touchedTexts.clear();
    textOriginals = new WeakMap();
    for (const element of touchedAttrs) {
      const originals = attrOriginals.get(element);
      if (!originals) continue;
      for (const [attribute, value] of Object.entries(originals)) {
        try { element.setAttribute(attribute, value); } catch (error) { /* egal */ }
      }
    }
    touchedAttrs.clear();
    attrOriginals = new WeakMap();
  }

  function setLanguage(next) {
    const value = next === 'en' ? 'en' : 'de';
    if (value === language) {
      if (value === 'en') {
        if (dictionary && Object.keys(dictionary).length) walk(document.body);
        else ensureDictionary().then(() => { if (language === 'en') { walk(document.body); startObserver(); } }).catch(() => {});
      }
      return;
    }
    language = value;
    document.documentElement.lang = value === 'en' ? 'en' : 'de';
    if (value === 'en') {
      ensureDictionary()
        .then(() => {
          if (language !== 'en') return;
          walk(document.body);
          startObserver();
        })
        .catch(() => {
          // Ohne Wörterbuch bleibt die Oberfläche deutsch.
        });
    } else {
      stopObserver();
      restore();
    }
  }

  window.i18n = {
    setLanguage,
    getLanguage: () => language,
    locale: () => (language === 'en' ? 'en-US' : 'de-DE'),
    translate,
    apply: () => walk(document.body)
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (language === 'en') walk(document.body);
    });
  }
})();
