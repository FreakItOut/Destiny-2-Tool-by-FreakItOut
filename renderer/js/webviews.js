import { clamp } from './ui.js';

const READER_CSS = `
  body { max-width: 760px !important; margin: 0 auto !important; font-size: 18px !important; line-height: 1.7 !important; }
  aside, .sidebar, .ad, [class*="advert"], [id*="advert"], nav, header, footer, .cookie-banner { display: none !important; }
  img { max-width: 100% !important; height: auto !important; }
`;

// Cookie-/Consent-Banner ausblenden: Diese überlagern im Overlay
// oft die halbe Seite und lassen sich mit dem Controller kaum
// wegklicken.
const COOKIE_BLOCK_CSS = `
  .cookie-banner, #cookie-banner, .cookie-consent, #cookie-consent,
  .cookie-notice, #cookie-notice, .cookie-alert, #cookie-alert,
  .cookie-message, #cookie-message, .cookie-bar, #cookie-bar,
  .cookie-disclaimer, #cookie-disclaimer, .cookie-policy, #cookie-policy,
  .cookie-popup, #cookie-popup, .cookie-modal, #cookie-modal,
  .cookie-overlay, #cookie-overlay, .cookie-wrapper, #cookie-wrapper,
  .cookie-settings, #cookie-settings, .cookie-hinweis, #cookie-hinweis,
  .gdpr, #gdpr, .gdpr-banner, #gdpr-banner, .gdpr-consent, #gdpr-consent,
  .eu-cookie, #eu-cookie, .eu-cookie-compliance, #eu-cookie-compliance,
  .cc-banner, #cc-banner, .cc-window, #cc-window, .cc-revoke, #cc-revoke,
  .cookiebot, #cookiebot, .CookieConsent, #CookieConsent,
  .onetrust-consent-sdk, #onetrust-consent-sdk, #onetrust-banner-sdk,
  .cky-consent, #cky-consent, .cky-consent-bar,
  [class*="cookie-consent"], [id*="cookie-consent"],
  [class*="cookie-banner"], [id*="cookie-banner"],
  [class*="cookie-notice"], [id*="cookie-notice"],
  [class*="gdpr-banner"], [id*="gdpr-banner"],
  [class*="consent-banner"], [id*="consent-banner"],
  [class*="consent-bar"], [id*="consent-bar"],
  [data-testid="cookie-banner"], [data-testid="consent-banner"],
  [aria-label="cookie"], [aria-label="Cookie"],
  [role="dialog"][aria-label*="ookie"], [role="dialog"][aria-label*="onsent"]
  { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
`;

// ============================================================
// Webseiten-Verwaltung
// ============================================================
// Jede besuchte Seite lebt in einem eigenen <webview>. Damit der
// Speicher nicht unbegrenzt wächst, werden ältere Seiten entladen,
// sobald mehr als "keepAlive" Seiten gleichzeitig offen sind.
// ============================================================

export function createWebManager({ api, container, getConfig, onState, onTitle, onError }) {
  const frames = new Map();
  let activeId = null;
  // Split-View: die gepinnte Seite nimmt den linken Slot ein, die
  // aktive Seite den rechten (nur Sitzung, nicht persistiert).
  let splitSecondaryId = null;
  // Zuletzt entladene Seiten (für Strg+Shift+T), neuer zuerst.
  const closedStack = [];

  // Hänger-Erkennung: Meldet eine Seite „reagiert nicht", wenn das
  // Webview unresponsive wird oder ein Ladevorgang zu lange hängt.
  // Der Nutzer bekommt dann einen Hinweis mit „Neu laden".
  let stallTimer = null;
  let stalledNotified = false;

  function reportStall(frame, grund) {
    if (!frame || frame.id !== activeId) return;
    if (stalledNotified && frame.stalled) return;
    frame.stalled = true;
    stalledNotified = true;
    try {
      onState({ type: 'stalled', site: frame.site, grund });
    } catch (error) {
      // egal
    }
  }

  function startStallWatchdog() {
    if (stallTimer) return;
    stallTimer = setInterval(() => {
      const frame = activeFrame();
      if (!frame) { stalledNotified = false; return; }
      const stuck = (frame.loading && Date.now() - (frame.loadingSince || 0) > 20000) || frame.unresponsive;
      if (!stuck) {
        if (!frame.stalled) stalledNotified = false;
        return;
      }
      reportStall(frame, frame.unresponsive ? 'unresponsive' : 'loading');
    }, 5000);
    if (stallTimer.unref) stallTimer.unref();
  }

  function markResponsive(frame) {
    if (!frame) return;
    frame.unresponsive = false;
    frame.stalled = false;
    stalledNotified = false;
    try {
      onState({ type: 'responsive', site: frame.site });
    } catch (error) {
      // egal
    }
  }

  function activeFrame() {
    return activeId ? frames.get(activeId) || null : null;
  }

  function frameCount() {
    return frames.size;
  }

  function setActiveFrameClass() {
    for (const [id, frame] of frames) {
      frame.element.classList.toggle('active', id === activeId);
    }
  }

  // Split-View-Klassen anwenden (Container + gepinnter Frame).
  function applySplitClasses() {
    const on = Boolean(splitSecondaryId);
    container.classList.toggle('split-view', on);
    for (const [id, frame] of frames) {
      frame.element.classList.toggle('split-left', on && id === splitSecondaryId);
    }
  }

  // Split-View umschalten: die aktuell aktive Seite wird links
  // gepinnt (splitSecondaryId), die nächste Auswahl landet rechts.
  function toggleSplit() {
    if (splitSecondaryId) {
      splitSecondaryId = null;
      applySplitClasses();
      return { on: false };
    }
    if (!activeId || frames.size < 2) return { on: false, error: 'need-two' };
    splitSecondaryId = activeId;
    applySplitClasses();
    return { on: true };
  }

  function createFrame(site) {
    const element = document.createElement('webview');
    element.className = 'site-frame';
    element.setAttribute('partition', 'persist:destiny2tool');
    element.setAttribute('allowpopups', '');
    element.setAttribute('src', site.url);
    element.dataset.siteId = site.id;

    const frame = {
      id: site.id,
      site,
      element,
      lastUsed: Date.now(),
      loading: true,
      failed: false,
      loadingSince: Date.now(),
      stalled: false,
      unresponsive: false,
      title: site.name,
      url: site.url,
      readerCssKey: null
    };

    element.addEventListener('did-start-loading', () => {
      frame.loading = true;
      frame.failed = false;
      frame.loadingSince = Date.now();
      frame.stalled = false;
      frame.unresponsive = false;
      if (frame.id === activeId) onState({ type: 'loading', site, loading: true });
    });

    element.addEventListener('dom-ready', () => {
      // Dem Hauptprozess melden, welche Seite dieses Webview zeigt.
      // Dort wird entschieden, ob Links (z. B. auf Destiny Item
      // Manager) hier oder im passenden Tab geöffnet werden.
      try {
        const contentsId = element.getWebContentsId();
        if (Number.isInteger(contentsId) && contentsId > 0 && api.registerWebview) {
          api.registerWebview(contentsId, site.id);
        }
      } catch (error) {
        // noch nicht bereit
      }
      try {
        // Zoom: pro Seite überschreibbar (web.siteZoom), sonst global.
        const siteZoomMap = (getConfig().web && getConfig().web.siteZoom) || {};
        const override = Number(siteZoomMap[site.id]);
        const factor = Number.isFinite(override) && override > 0
          ? clamp(override, 0.5, 2)
          : clamp(getConfig().web.zoom, 0.5, 2);
        element.setZoomFactor(factor);
      } catch (error) {
        // Zoom gibt es erst nach dem Laden.
      }
      try {
        // Lesemodus: pro Seite überschreibbar (web.readerSites), sonst
        // global (web.readerMode / behavior.readerMode).
        const readerMap = (getConfig().web && getConfig().web.readerSites) || {};
        const override = readerMap[site.id];
        const enabled = typeof override === 'boolean'
          ? override
          : Boolean(getConfig().web.readerMode || getConfig().behavior.readerMode);
        if (enabled) {
          const key = element.insertCSS(READER_CSS);
          frame.readerCssKey = key;
        }
      } catch (error) {
        // CSS-Injektion optional.
      }
      // Cookie-Banner ausblenden: bekannte Consent-Banner-Klassen
      // verdecken im Overlay oft die halbe Seite.
      try {
        element.insertCSS(COOKIE_BLOCK_CSS);
      } catch (error) {
        // optional
      }
    });

    element.addEventListener('unresponsive', () => {
      frame.unresponsive = true;
      reportStall(frame, 'unresponsive');
    });

    element.addEventListener('responsive', () => {
      markResponsive(frame);
    });

    element.addEventListener('did-fail-load', () => {
      frame.loading = false;
      frame.stalled = false;
    });

    element.addEventListener('did-stop-loading', () => {
      frame.loading = false;
      frame.stalled = false;
      frame.unresponsive = false;
      // Gemerkte Scroll-Position anwenden, sobald die Seite bereit ist.
      const pending = Number(frame.pendingScrollValue) || 0;
      if (pending >= 10) {
        frame.pendingScrollValue = 0;
        restoreScroll(frame, pending);
      }
      if (frame.id === activeId) {
        onState({ type: 'loading', site, loading: false });
        try {
          const title = element.getTitle();
          if (title) onTitle({ site, title });
        } catch (error) {
          // egal
        }
      }
    });

    element.addEventListener('page-title-updated', (event) => {
      frame.title = event.title || site.name;
      if (frame.id === activeId) onTitle({ site, title: frame.title });
    });

    element.addEventListener('did-navigate', (event) => {
      frame.url = event.url || site.url;
      frame.failed = false;
      frame.retried = false;
      if (frame.id === activeId) {
        onState({ type: 'navigated', site, url: frame.url });
      }
    });

    element.addEventListener('did-navigate-in-page', (event) => {
      frame.url = event.url || frame.url;
      if (frame.id === activeId) {
        onState({ type: 'navigated', site, url: frame.url });
      }
    });

    element.addEventListener('did-fail-load', (event) => {
      if (event.isMainFrame === false) return;
      // -3 = ERR_ABORTED, z. B. durch einen schnellen Wechsel.
      if (event.errorCode === -3) return;
      // Einmaliger Auto-Retry: kurze Netz-Hänger lösen sich oft nach
      // zwei Sekunden selbst. Erst wenn das auch scheitert, erscheint
      // die Fehlerseite.
      if (!frame.retried) {
        frame.retried = true;
        if (frame.id === activeId) {
          onState({ type: 'loading', site, loading: true });
        }
        setTimeout(() => {
          try { element.reload(); } catch (error) { /* egal */ }
        }, 2000);
        return;
      }
      frame.failed = true;
      frame.loading = false;
      if (frame.id === activeId) {
        onError({
          site,
          code: event.errorCode,
          description: event.errorDescription || 'Unbekannter Fehler',
          url: event.validatedURL || site.url
        });
      }
    });

    element.addEventListener('render-process-gone', () => {
      frame.failed = true;
      frame.loading = false;
      const now = Date.now();
      const lastCrash = Number(frame.lastCrashAt) || 0;
      frame.lastCrashAt = now;
      // Einmal automatisch neu laden; bei Wiederholung in kurzer Zeit
      // nicht in eine Endlosschleife geraten.
      if (now - lastCrash > 30000) {
        setTimeout(() => {
          try { element.reload(); } catch (error) { /* egal */ }
        }, 800);
        if (frame.id === activeId) {
          onError({ site, code: 0, description: 'Der Seitenprozess wurde beendet und die Seite neu geladen.', url: frame.url });
        }
      } else if (frame.id === activeId) {
        onError({ site, code: 0, description: 'Die Seite stürzt wiederholt ab – bitte manuell neu laden.', url: frame.url });
      }
    });

    container.append(element);
    frames.set(site.id, frame);
    return frame;
  }

  function destroyFrame(id) {
    const frame = frames.get(id);
    if (!frame) return;
    // Für "Geschlossene Seite wiederherstellen" merken (echte Sites,
    // max. 10 Einträge, keine Duplikate direkt hintereinander).
    if (frame.site && frame.site.url) {
      closedStack.unshift({ id: frame.id, name: frame.site.name, url: frame.site.url });
      if (closedStack.length > 10) closedStack.length = 10;
    }
    try {
      frame.element.remove();
    } catch (error) {
      // egal
    }
    frames.delete(id);
    if (activeId === id) activeId = null;
    if (splitSecondaryId === id) splitSecondaryId = null;
    applySplitClasses();
  }

  function trimCache(keepId) {
    const limit = clamp(getConfig().web.keepAlive, 1, 8);
    while (frames.size > limit) {
      const candidates = [...frames.values()]
        .filter((frame) => frame.id !== keepId && frame.id !== splitSecondaryId)
        .sort((a, b) => a.lastUsed - b.lastUsed);
      if (!candidates.length) break;
      destroyFrame(candidates[0].id);
    }
  }

  function show(site) {
    if (!site) return;
    // Scroll-Position der bisher aktiven Seite sichern, bevor
    // gewechselt wird (asynchron, stört die Umschaltung nicht).
    const previous = activeFrame();
    if (previous && previous.id !== site.id) captureScroll(previous);
    let frame = frames.get(site.id);
    if (!frame) {
      frame = createFrame(site);
    }
    activeId = site.id;
    frame.lastUsed = Date.now();
    frame.site = site;
    setActiveFrameClass();
    applySplitClasses();
    trimCache(site.id);

    // Gemerkte Scroll-Position wiederherstellen: sofort, wenn die
    // Seite schon geladen ist, sonst nach did-stop-loading.
    const wantedScroll = Number(frame.scrollY) || 0;
    if (wantedScroll >= 10) {
      if (frame.loading) frame.pendingScrollValue = wantedScroll;
      else restoreScroll(frame, wantedScroll);
    }

    if (frame.failed) {
      onError({ site, code: 0, description: 'Die Seite konnte nicht geladen werden.', url: frame.url });
    } else if (!frame.loading) {
      onTitle({ site, title: frame.title });
    }
    onState({ type: 'shown', site, loading: frame.loading });
  }

  // Scroll-Position merken/wiederherstellen (nur im Speicher, pro
  // Sitzung - der Nutzer springt zwischen Tabs und landet dort, wo
  // er aufgehört hat).
  function captureScroll(frame) {
    if (!frame) return;
    try {
      frame.element
        .executeJavaScript('window.scrollY || 0', false)
        .then((value) => { frame.scrollY = Number(value) || 0; })
        .catch(() => {});
    } catch (error) {
      // egal
    }
  }

  function restoreScroll(frame, value) {
    const target = Math.max(0, Math.round(Number(value) || 0));
    if (target < 10) return;
    try {
      frame.element.executeJavaScript(`window.scrollTo(0, ${target})`, false).catch(() => {});
    } catch (error) {
      // egal
    }
  }

  // Laedt eine Seite im Hintergrund, ohne sie anzuzeigen. Die Seite
  // bleibt im Keep-Alive-Cache und ist beim ersten Oeffnen sofort
  // verfuegbar.
  function preload(site) {
    if (!site) return;
    let frame = frames.get(site.id);
    if (!frame) {
      frame = createFrame(site);
      frame.lastUsed = Date.now() - 120000; // aelterer Zeitstempel: wird zuerst entladen
    }
  }

  // Zeigt die Seite einer Kategorie an und lädt dort eine Adresse -
  // z. B. wenn ein Link auf Destiny Item Manager im DIM-Tab geöffnet
  // wird.
  function showUrl(site, url) {
    if (!site || !url) return;
    show(site);
    const frame = frames.get(site.id);
    if (!frame) return;
    try {
      frame.element.loadURL(url);
    } catch (error) {
      frame.element.setAttribute('src', url);
    }
  }

  function reload() {
    const frame = activeFrame();
    if (!frame) return;
    frame.failed = false;
    try {
      frame.element.reload();
    } catch (error) {
      onError({ site: frame.site, code: 0, description: 'Neu laden fehlgeschlagen.', url: frame.url });
    }
  }

  function goBack() {
    const frame = activeFrame();
    if (!frame) return false;
    try {
      if (frame.element.canGoBack()) {
        frame.element.goBack();
        return true;
      }
    } catch (error) {
      // egal
    }
    return false;
  }

  function goForward() {
    const frame = activeFrame();
    if (!frame) return false;
    try {
      if (frame.element.canGoForward()) {
        frame.element.goForward();
        return true;
      }
    } catch (error) {
      // egal
    }
    return false;
  }

  function home() {
    const frame = activeFrame();
    if (!frame) return;
    try {
      frame.element.loadURL(frame.site.url);
    } catch (error) {
      frame.element.setAttribute('src', frame.site.url);
    }
  }

  // Aktive Seite zu einer freien Adresse navigieren (Adressleiste,
  // Tray-Schnellzugriff). Rückgabe true = Navigation angestoßen.
  function navigate(url) {
    const target = String(url || '');
    if (!/^https?:\/\//i.test(target)) return false;
    const frame = activeFrame();
    if (!frame) return false;
    try {
      frame.element.loadURL(target);
    } catch (error) {
      frame.element.setAttribute('src', target);
    }
    return true;
  }

  function openExternal(url) {
    const frame = activeFrame();
    let target = url;
    if (!target && frame) {
      try {
        target = frame.element.getURL();
      } catch (error) {
        target = frame.site.url;
      }
    }
    if (!target) return;
    api.openExternal(target);
  }

  function applyZoom() {
    const globalZoom = clamp(getConfig().web.zoom, 0.5, 2);
    const siteZoomMap = (getConfig().web && getConfig().web.siteZoom) || {};
    for (const frame of frames.values()) {
      const override = Number(siteZoomMap[frame.id]);
      const factor = Number.isFinite(override) && override > 0 ? clamp(override, 0.5, 2) : globalZoom;
      try {
        frame.element.setZoomFactor(factor);
      } catch (error) {
        // Seite lädt noch.
      }
    }
  }

  function applyReaderMode() {
    const globalEnabled = Boolean(getConfig().web.readerMode || getConfig().behavior.readerMode);
    const readerMap = (getConfig().web && getConfig().web.readerSites) || {};
    for (const frame of frames.values()) {
      const override = readerMap[frame.id];
      const enabled = typeof override === 'boolean' ? override : globalEnabled;
      try {
        if (enabled) {
          if (!frame.readerCssKey) frame.readerCssKey = frame.element.insertCSS(READER_CSS);
        } else if (frame.readerCssKey) {
          frame.element.removeInsertedCSS(frame.readerCssKey);
          frame.readerCssKey = null;
        }
      } catch (error) {
        // optional
      }
    }
  }

  function reloadAll() {
    for (const frame of frames.values()) {
      try {
        frame.element.reload();
      } catch (error) {
        // egal
      }
    }
  }

  function unloadAll() {
    for (const id of [...frames.keys()]) destroyFrame(id);
    activeId = null;
    onState({ type: 'empty' });
  }

  // Entlädt alle Seiten außer der aktiven (RAM freimachen). Die
  // aktive Seite bleibt unberührt.
  function unloadOthers() {
    let removed = 0;
    for (const id of [...frames.keys()]) {
      if (id === activeId) continue;
      if (splitSecondaryId && id === splitSecondaryId) continue;
      destroyFrame(id);
      removed += 1;
    }
    return removed;
  }

  // Blendet die aktive Seite aus, ohne sie zu entladen. Wird für
  // leere Kategorien (z. B. "Eigene" ohne Einträge) gebraucht.
  // Zuletzt geschlossene Seite wiederherstellen (Strg+Shift+T).
  // Die Seite wird über die ID in den Kategorien gesucht; existiert
  // sie dort nicht mehr, greift der nächste Stack-Eintrag.
  function restoreLast() {
    while (closedStack.length) {
      const entry = closedStack.shift();
      for (const category of getAllCategoriesSafe()) {
        const site = category.sites.find((candidate) => candidate.id === entry.id);
        if (site) {
          show(site);
          return site;
        }
      }
    }
    return null;
  }

  // Einzelne Hintergrund-Seite entladen (Reiter-Kontextmenü).
  function unloadSite(id) {
    const frame = frames.get(id);
    if (!frame || id === activeId) return false;
    destroyFrame(id);
    return true;
  }

  // IDs der aktuell offenen Seiten (Sitzungs-Wiederherstellung).
  function getOpenSiteIds() {
    return [...frames.keys()];
  }

  // Zugriff auf die Kategorien ohne zirkuläre Abhängigkeit: wird von
  // außen gesetzt (createWebManager-Nutzer).
  let categoryProvider = null;
  function getAllCategoriesSafe() {
    try {
      return typeof categoryProvider === 'function' ? categoryProvider() : [];
    } catch (error) {
      return [];
    }
  }
  function setCategoryProvider(provider) {
    categoryProvider = provider;
  }

  function hide() {
    activeId = null;
    setActiveFrameClass();
    // Dashboard-Ansicht: den gepinnten Split-Frame mitverstecken.
    if (splitSecondaryId) {
      const frame = frames.get(splitSecondaryId);
      if (frame) frame.element.classList.remove('split-left');
      container.classList.remove('split-view');
    }
  }

  function getWebContentsId() {
    const frame = activeFrame();
    if (!frame) return null;
    try {
      const id = frame.element.getWebContentsId();
      return Number.isInteger(id) && id > 0 ? id : null;
    } catch (error) {
      return null;
    }
  }

  function activeElement() {
    const frame = activeFrame();
    return frame ? frame.element : null;
  }

  function activeSite() {
    const frame = activeFrame();
    return frame ? frame.site : null;
  }

  // Inaktive Seiten nach X Minuten entladen (optional).
  let idleUnloadTimer = null;
  function startIdleUnload() {
    if (idleUnloadTimer) return;
    idleUnloadTimer = setInterval(() => {
      const minutes = Math.max(0, Math.round(Number(getConfig().web && getConfig().web.idleUnloadMinutes) || 0));
      if (!minutes) return;
      const limit = Date.now() - minutes * 60000;
      for (const [id, frame] of [...frames.entries()]) {
        if (id === activeId || id === splitSecondaryId) continue;
        if ((frame.lastUsed || 0) > limit) continue;
        try { unload(id); } catch (error) { /* egal */ }
      }
    }, 60000);
    if (idleUnloadTimer.unref) idleUnloadTimer.unref();
  }
  startStallWatchdog();
  startIdleUnload();

  return {
    show,
    preload,
    showUrl,
    reload,
    goBack,
    goForward,
    home,
    navigate,
    openExternal,
    applyZoom,
    applyReaderMode,
    reloadAll,
    unloadAll,
    unloadOthers,
    unloadSite,
    restoreLast,
    toggleSplit,
    splitActive: () => Boolean(splitSecondaryId),
    getOpenSiteIds,
    setCategoryProvider,
    hide,
    getWebContentsId,
    activeElement,
    activeSite,
    get count() {
      return frames.size;
    }
  };
}
