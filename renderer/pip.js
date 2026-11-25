'use strict';

// ============================================================
// Bild-in-Bild-Fenster
// ============================================================
// Lädt die übergebene Adresse in einem <webview>. YouTube- und
// Twitch-Adressen werden in Embed-Adressen umgewandelt, damit das
// Video ohne Menü/Leisten im Mini-Fenster läuft. Die Sitzung ist
// dieselbe wie im Hauptfenster - Anmeldungen bleiben erhalten.
// ============================================================

const hint = document.getElementById('pipHint');
if (window.d2 && typeof window.d2.getUiLanguage === 'function') {
  window.d2.getUiLanguage().then((lang) => { if (window.i18n) window.i18n.setLanguage(lang); }).catch(() => {});
  if (typeof window.d2.onUiLanguage === 'function') {
    window.d2.onUiLanguage((lang) => { if (window.i18n) window.i18n.setLanguage(lang); });
  }
}
const webview = document.getElementById('pipWebview');

function readQueryUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const url = String(params.get('url') || '');
    return /^https?:\/\//i.test(url) ? url : '';
  } catch (error) {
    return '';
  }
}

function embedUrlFor(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    // YouTube: watch?v=ID, youtu.be/ID, /shorts/ID -> embed.
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
      let id = '';
      if (host === 'youtu.be') id = parsed.pathname.replace(/^\//, '');
      else if (parsed.pathname === '/watch') id = parsed.searchParams.get('v') || '';
      else {
        const shorts = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
        if (shorts) id = shorts[1];
      }
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      return url;
    }
    // Twitch: Kanalseite -> Embed-Player.
    if (host === 'twitch.tv' || host === 'm.twitch.tv') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length && parts[0] !== 'videos') {
        return `https://player.twitch.tv/?channel=${encodeURIComponent(parts[0])}&parent=localhost`;
      }
      if (parts[0] === 'videos' && parts[1]) {
        return `https://player.twitch.tv/?video=${encodeURIComponent(parts[1])}&parent=localhost`;
      }
      return url;
    }
    return url;
  } catch (error) {
    return url;
  }
}

const rawUrl = readQueryUrl();
if (rawUrl && webview) {
  webview.setAttribute('src', embedUrlFor(rawUrl));
  webview.addEventListener('did-start-loading', () => {
    if (hint) hint.classList.remove('hidden');
  });
  webview.addEventListener('did-stop-loading', () => {
    if (hint) hint.classList.add('hidden');
  });
  webview.addEventListener('did-fail-load', (event) => {
    if (event && event.isMainFrame === false) return;
    if (event && event.errorCode === -3) return;
    if (hint) {
      hint.textContent = 'Die Seite konnte im Mini-Fenster nicht geladen werden.';
      hint.classList.remove('hidden');
    }
  });
} else if (hint) {
  hint.textContent = 'Keine Adresse übergeben.';
}

// Nachträgliches Navigieren (PiP offen, neue Adresse gewählt): die
// Hauptoberfläche schickt die neue Adresse, der Embed-Umwandler
// läuft hier erneut.
if (window.d2 && typeof window.d2.onPipNavigate === 'function') {
  window.d2.onPipNavigate((url) => {
    if (!webview || !url || !/^https?:\/\//i.test(String(url))) return;
    if (hint) hint.classList.remove('hidden');
    try {
      webview.loadURL(embedUrlFor(String(url)));
    } catch (error) {
      webview.setAttribute('src', embedUrlFor(String(url)));
    }
  });
}
