// ============================================================
// Einrichtungs-Assistent (erster Start)
// ============================================================
// Führt in sechs Schritten durch Sprache, API-Key, Spielsprache,
// OAuth-Client, Anmeldung und Verbindungstest. Nutzt ausschließlich
// die vorhandenen IPC-Bridges. Die Sprachen lassen sich hier direkt
// umstellen und werden sofort gespeichert.

export function createOnboarding(ctx) {
  const { api, getConfig, setConfig, toast } = ctx;
  let modal = null;
  let busy = false;

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'onboarding-backdrop hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      `<div class="onboarding-card">` +
        `<header class="onboarding-head"><div><span class="onboarding-kicker">Willkommen</span><h2>Destiny 2 Tool einrichten</h2></div>` +
          `<div class="onboarding-lang"><label for="onboardingLanguage">Sprache</label>` +
            `<select id="onboardingLanguage" class="control" data-onboarding-language>` +
              `<option value="de">Deutsch</option><option value="en">English</option>` +
            `</select></div>` +
          `<button type="button" class="icon-btn" data-onboarding-close aria-label="Schließen">✕</button></header>` +
        `<p class="onboarding-intro">In sechs Schritten ist das Tool startklar. Du kannst alles später unter Einstellungen → Bungie ändern.</p>` +
        `<ol class="onboarding-steps">` +
          `<li><b>1. API-Key</b><span>Kostenlos im Bungie-Entwicklerportal erstellen und hier einfügen.</span>` +
            `<div class="onboarding-row"><input data-onboarding-key type="password" autocomplete="off" placeholder="Bungie-API-Key">` +
            `<button type="button" class="btn ghost small" data-onboarding-save-key>Speichern</button>` +
            `<button type="button" class="btn ghost small" data-onboarding-portal>Entwicklerportal öffnen</button></div>` +
            `<small data-onboarding-key-state class="onboarding-hint">Noch kein Key gespeichert.</small></li>` +
          `<li><b>2. Spielsprache der Gegenstände</b><span>Bestimmt, in welcher Sprache Bungie Item-Namen, Beschreibungen und Perks liefert. Gilt für Inventar, Loadouts und Werkzeuge.</span>` +
            `<div class="onboarding-row"><select id="onboardingContentLanguage" class="control" data-onboarding-content-language>` +
              `<option value="de">Deutsch</option><option value="en">English</option>` +
            `</select></div>` +
            `<small data-onboarding-content-state class="onboarding-hint">Gegenstände und Beschreibungen werden auf Deutsch geladen.</small></li>` +
          `<li><b>3. OAuth-Client</b><span>Für dauerhaftes Angemeldetbleiben: OAuth-Client-ID und optional das Client-Secret aus dem Entwicklerportal eintragen.</span>` +
            `<div class="onboarding-row"><input data-onboarding-client type="text" maxlength="40" spellcheck="false" autocomplete="off" placeholder="OAuth-Client-ID">` +
            `<button type="button" class="btn ghost small" data-onboarding-save-client>Speichern</button></div>` +
            `<div class="onboarding-row"><input data-onboarding-secret type="password" maxlength="200" spellcheck="false" autocomplete="new-password" placeholder="OAuth-Client-Secret (optional)">` +
            `<button type="button" class="btn ghost small" data-onboarding-save-secret>Speichern</button></div>` +
            `<small data-onboarding-client-state class="onboarding-hint">Noch keine Client-ID gespeichert.</small>` +
            `<small data-onboarding-secret-state class="onboarding-hint">Noch kein Client-Secret gespeichert.</small></li>` +
          `<li><b>4. Anmeldung</b><span>Für Inventar, Loadouts und Aktionen: Bungie-OAuth starten. Scopes und Client-Secret stehen in den Einstellungen.</span>` +
            `<div class="onboarding-row"><button type="button" class="btn primary small" data-onboarding-login>Bungie anmelden</button>` +
            `<button type="button" class="btn ghost small" data-onboarding-settings>Einstellungen öffnen</button></div>` +
            `<small data-onboarding-login-state class="onboarding-hint">Nicht angemeldet.</small></li>` +
          `<li><b>5. Verbindung testen</b><span>Prüft API-Key, Client, Anmeldung und Scopes.</span>` +
            `<div class="onboarding-row"><button type="button" class="btn ghost small" data-onboarding-test>Test starten</button></div>` +
            `<div data-onboarding-test-state class="onboarding-test"></div></li>` +
          `<li><b>6. Fertig</b><span>Das Dashboard zeigt danach deine Prioritäten, Hüter und den Wochenstatus.</span>` +
            `<div class="onboarding-row"><button type="button" class="btn ghost small" data-onboarding-dashboard>Zum Dashboard</button></div></li>` +
        `</ol>` +
        `<footer class="onboarding-actions">` +
          `<button type="button" class="btn ghost small" data-onboarding-skip>Später</button>` +
          `<button type="button" class="btn primary" data-onboarding-finish>Fertig</button>` +
        `</footer>` +
      `</div>`;
    document.body.appendChild(modal);

    const q = (selector) => modal.querySelector(selector);
    const setHint = (selector, text, state) => {
      const el = q(selector);
      if (!el) return;
      el.textContent = text;
      el.dataset.state = state || '';
    };

    async function refreshStatus() {
      const status = await api.bungieOAuthStatus().catch(() => null);
      if (!status) return;
      setHint('[data-onboarding-key-state]',
        status.apiKeyStored
          ? (status.apiKeyReadable ? `Key gespeichert (${Number(status.apiKeyLength) || 0} Zeichen).` : 'Key gespeichert, aber nicht lesbar – bitte neu eingeben.')
          : 'Noch kein Key gespeichert.',
        status.apiKeyStored ? 'ok' : '');
      const clientId = String((getConfig().bungie && getConfig().bungie.oauthClientId) || '').trim();
      setHint('[data-onboarding-client-state]', clientId ? 'Client-ID gespeichert.' : 'Noch keine Client-ID gespeichert.', clientId ? 'ok' : '');
      setHint('[data-onboarding-secret-state]', status.hasClientSecret ? 'Client-Secret gespeichert.' : 'Noch kein Client-Secret gespeichert.', status.hasClientSecret ? 'ok' : '');
      setHint('[data-onboarding-login-state]',
        status.loggedIn ? `Angemeldet${status.displayName ? ` als ${status.displayName}` : ''}.` : 'Nicht angemeldet.',
        status.loggedIn ? 'ok' : '');
      const clientInput = q('[data-onboarding-client]');
      if (clientInput && !clientInput.value) clientInput.placeholder = clientId || 'OAuth-Client-ID';
      const secretInput = q('[data-onboarding-secret]');
      if (secretInput && !secretInput.value) secretInput.placeholder = status.hasClientSecret ? 'Secret gespeichert – leer lassen zum Beibehalten' : 'OAuth-Client-Secret (optional)';
    }

    const languageSelect = q('[data-onboarding-language]');
    const applyIntro = () => {
      const intro = q('.onboarding-intro');
      if (!intro) return;
      const en = window.i18n && window.i18n.getLanguage() === 'en';
      intro.textContent = en
        ? 'The tool is ready in six steps. You can change everything later in Settings → Bungie.'
        : 'In sechs Schritten ist das Tool startklar. Du kannst alles später unter Einstellungen → Bungie ändern.';
    };
    if (languageSelect) {
      languageSelect.value = (getConfig().appearance && getConfig().appearance.uiLanguage) === 'en' ? 'en' : 'de';
      languageSelect.addEventListener('change', () => {
        const value = languageSelect.value === 'en' ? 'en' : 'de';
        setConfig({ appearance: { uiLanguage: value } });
        if (window.i18n) window.i18n.setLanguage(value);
        applyIntro();
        setTimeout(refreshStatus, 40);
      });
    }

    const contentSelect = q('[data-onboarding-content-language]');
    if (contentSelect) {
      contentSelect.value = (getConfig().bungie && getConfig().bungie.contentLanguage) === 'en' ? 'en' : 'de';
      const applyContentHint = () => setHint('[data-onboarding-content-state]',
        contentSelect.value === 'en'
          ? 'Gegenstände und Beschreibungen werden auf Englisch geladen.'
          : 'Gegenstände und Beschreibungen werden auf Deutsch geladen.',
        '');
      applyContentHint();
      contentSelect.addEventListener('change', () => {
        const value = contentSelect.value === 'en' ? 'en' : 'de';
        setConfig({ bungie: { contentLanguage: value } });
        applyContentHint();
        toast('Spielsprache gespeichert – Gegenstände werden beim nächsten Aktualisieren neu geladen.', 'info', 3200);
      });
    }

    q('[data-onboarding-close]').addEventListener('click', close);
    q('[data-onboarding-skip]').addEventListener('click', () => {
      setConfig({ onboardingDone: true });
      close();
    });
    q('[data-onboarding-finish]').addEventListener('click', () => {
      setConfig({ onboardingDone: true });
      close();
      toast('Einrichtung abgeschlossen.', 'success', 2400);
    });
    q('[data-onboarding-dashboard]').addEventListener('click', () => {
      setConfig({ onboardingDone: true });
      close();
      if (ctx.dashboard && ctx.dashboard.open) ctx.dashboard.open();
    });
    q('[data-onboarding-settings]').addEventListener('click', () => {
      close();
      if (ctx.openSettings) ctx.openSettings('bungie');
    });
    q('[data-onboarding-portal]').addEventListener('click', () => {
      if (api.openExternal) api.openExternal('https://www.bungie.net/en/Application').catch(() => {});
    });
    q('[data-onboarding-save-key]').addEventListener('click', async () => {
      const input = q('[data-onboarding-key]');
      const key = String((input && input.value) || '').trim();
      if (!key) {
        toast('Bitte einen API-Key eingeben.', 'info', 2000);
        return;
      }
      busy = true;
      try {
        const result = await api.bungieSetApiKey(key);
        if (result && result.ok) {
          input.value = '';
          toast('API-Key gespeichert.', 'success', 2200);
          await refreshStatus();
        } else {
          toast((result && result.error) || 'API-Key konnte nicht gespeichert werden.', 'error', 3000);
        }
      } finally {
        busy = false;
      }
    });
    q('[data-onboarding-save-client]').addEventListener('click', () => {
      const input = q('[data-onboarding-client]');
      const clientId = String((input && input.value) || '').trim();
      setConfig({ bungie: { oauthClientId: clientId } });
      if (input) input.value = clientId;
      toast(clientId ? 'Client-ID gespeichert.' : 'Client-ID entfernt.', 'success', 2000);
      refreshStatus();
    });
    q('[data-onboarding-save-secret]').addEventListener('click', async () => {
      const input = q('[data-onboarding-secret]');
      const secret = String((input && input.value) || '').trim();
      if (!secret) {
        toast('Bitte ein Client-Secret eingeben.', 'info', 2000);
        return;
      }
      const result = await api.bungieSetSecret(secret).catch(() => null);
      if (result && result.ok) {
        input.value = '';
        toast('Client-Secret gespeichert.', 'success', 2600);
        await refreshStatus();
      } else {
        toast((result && result.error) || 'Client-Secret konnte nicht gespeichert werden.', 'error', 3000);
      }
    });
    q('[data-onboarding-login]').addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await api.bungieOAuthStart();
        if (result && result.ok === false) toast(result.error || 'Anmeldung konnte nicht gestartet werden.', 'error', 3200);
        setTimeout(refreshStatus, 1500);
      } catch (error) {
        toast(error.message || String(error), 'error', 3200);
      } finally {
        busy = false;
      }
    });
    q('[data-onboarding-test]').addEventListener('click', async () => {
      const target = q('[data-onboarding-test-state]');
      if (target) target.innerHTML = '<span class="onboarding-hint">Prüfe …</span>';
      try {
        const result = await api.bungieConnectionCheck();
        const steps = (result && result.steps) || [];
        if (target) {
          target.innerHTML = steps.length
            ? steps.map((step) => `<span class="onboarding-test-step ${step.state === 'ok' ? 'ok' : step.state === 'warn' ? 'warn' : 'bad'}">` +
                `${step.state === 'ok' ? '✓' : step.state === 'warn' ? '!' : '✗'} ${escapeText(step.label)}${step.hint ? ` – ${escapeText(step.hint)}` : ''}</span>`).join('')
            : `<span class="onboarding-hint">${escapeText((result && result.error) || 'Keine Antwort.')}</span>`;
        }
      } catch (error) {
        if (target) target.innerHTML = `<span class="onboarding-hint">${escapeText(error.message || String(error))}</span>`;
      }
    });
    return modal;
  }

  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, (character) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]
    ));
  }

  function open() {
    const current = ensureModal();
    current.classList.remove('hidden');
    const languageSelect = current.querySelector('[data-onboarding-language]');
    if (languageSelect) languageSelect.value = (getConfig().appearance && getConfig().appearance.uiLanguage) === 'en' ? 'en' : 'de';
    const contentSelect = current.querySelector('[data-onboarding-content-language]');
    if (contentSelect) contentSelect.value = (getConfig().bungie && getConfig().bungie.contentLanguage) === 'en' ? 'en' : 'de';
    const intro = current.querySelector('.onboarding-intro');
    if (intro) {
      const en = window.i18n && window.i18n.getLanguage() === 'en';
      intro.textContent = en
        ? 'The tool is ready in six steps. You can change everything later in Settings → Bungie.'
        : 'In sechs Schritten ist das Tool startklar. Du kannst alles später unter Einstellungen → Bungie ändern.';
    }
    const input = current.querySelector('[data-onboarding-key]');
    if (input) setTimeout(() => input.focus(), 80);
    const status = async () => {
      const oauth = await api.bungieOAuthStatus().catch(() => null);
      if (!oauth) return;
      const keyState = current.querySelector('[data-onboarding-key-state]');
      const loginState = current.querySelector('[data-onboarding-login-state]');
      if (keyState) {
        keyState.textContent = oauth.apiKeyStored
          ? (oauth.apiKeyReadable ? `Key gespeichert (${Number(oauth.apiKeyLength) || 0} Zeichen).` : 'Key gespeichert, aber nicht lesbar – bitte neu eingeben.')
          : 'Noch kein Key gespeichert.';
      }
      if (loginState) {
        loginState.textContent = oauth.loggedIn
          ? `Angemeldet${oauth.displayName ? ` als ${oauth.displayName}` : ''}.`
          : 'Nicht angemeldet.';
      }
    };
    status();
  }

  function close() {
    if (modal) modal.classList.add('hidden');
  }

  function maybeStart() {
    const config = getConfig();
    if (config.onboardingDone === true) return;
    open();
  }

  return { open, close, maybeStart };
}
