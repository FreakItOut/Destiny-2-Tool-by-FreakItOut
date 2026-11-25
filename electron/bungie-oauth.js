'use strict';

// ============================================================
// Bungie-OAuth-Token-Anfragen
// ============================================================
// Ausgelagert, damit der Token-Tausch inkl. Rotation und Retries
// ohne Electron gegen einen lokalen Fake-Server getestet werden
// kann (tools/oauth-test.js).

const DEFAULT_TOKEN_URL = 'https://www.bungie.net/Platform/App/OAuth/Token/';

function buildTokenBody(params, clientSecret) {
  const body = new URLSearchParams(params);
  if (clientSecret) body.set('client_secret', clientSecret);
  return body.toString();
}

/**
 * Führt einen Token-Request aus (authorization_code oder refresh_token).
 * Gibt { ok, status, body, text, detail } zurück.
 * `fetchImpl`, `tokenUrl` und `sleep` sind für Tests injizierbar.
 */
async function requestToken(options) {
  const {
    fetchImpl = fetch,
    tokenUrl = DEFAULT_TOKEN_URL,
    apiKey,
    userAgent,
    origin,
    clientId,
    clientSecret = '',
    grantType,
    code = '',
    refreshToken = '',
    retries = 1,
    retryDelayMs = 1800,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = options || {};

  if (!grantType) throw new Error('grantType fehlt.');
  if (!clientId) throw new Error('clientId fehlt.');

  const body = buildTokenBody(
    {
      grant_type: grantType,
      ...(grantType === 'authorization_code' ? { code } : { refresh_token: refreshToken }),
      client_id: clientId
    },
    clientSecret
  );

  let response = null;
  let text = '';
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    response = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'User-Agent': userAgent,
        'Origin': origin,
        'Content-Type': 'application/x-www-form-urlencoded',
        'accept': 'application/json'
      },
      body
    });
    text = await response.text();
    const retriable = response.status === 403 || response.status === 429 || response.status >= 500;
    if (retriable && attempt < retries) {
      await sleep(retryDelayMs);
      continue;
    }
    break;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    parsed = null;
  }
  const ok = Boolean(response.ok && parsed && parsed.access_token);
  let detail = '';
  if (!ok) {
    detail = parsed ? [parsed.error, parsed.error_description].filter(Boolean).join(': ') : '';
    if (!detail) detail = `HTTP ${response.status}`;
    if (!parsed && /<html|<!doctype/i.test(String(text || ''))) {
      detail += ' (HTML-Antwort von Bungie – evtl. Cloudflare/Rate-Limit)';
    }
  }
  return { ok, status: response.status, body: parsed, text, detail };
}

module.exports = { DEFAULT_TOKEN_URL, buildTokenBody, requestToken };
