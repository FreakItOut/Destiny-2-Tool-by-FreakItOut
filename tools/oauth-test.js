'use strict';

// ============================================================
// OAuth-Test gegen einen lokalen Fake-Bungie-Server
// ============================================================
// Prüft Token-Tausch, Code-Wiederverwendung, Refresh-Rotation,
// 503-Retry und Cloudflare-HTML-Fehler – ohne Electron und ohne
// echten Bungie-Account.

const http = require('node:http');
const { requestToken, buildTokenBody } = require('../electron/bungie-oauth');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail == null ? '' : String(detail) });
}

const issuedRefresh = new Set();
const usedCodes = new Set();
let refreshCounter = 0;
let flakyHits = 0;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });
  req.on('end', () => {
    const params = new URLSearchParams(raw);
    const grant = params.get('grant_type');
    if (grant === 'authorization_code') {
      const code = params.get('code');
      if (code === 'flaky-code' && flakyHits++ === 0) {
        res.writeHead(503, { 'Content-Type': 'text/html' });
        res.end('<html><body>busy</body></html>');
        return;
      }
      if (code === 'html-code') {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><html><body>blocked</body></html>');
        return;
      }
      if (usedCodes.has(code)) {
        sendJson(res, 400, { error: 'invalid_grant' });
        return;
      }
      usedCodes.add(code);
      refreshCounter += 1;
      const refresh = `refresh-${refreshCounter}`;
      issuedRefresh.add(refresh);
      sendJson(res, 200, {
        access_token: `access-${code}`,
        expires_in: 3600,
        refresh_token: refresh,
        refresh_expires_in: 7776000,
        membership_id: '12345'
      });
      return;
    }
    if (grant === 'refresh_token') {
      const token = params.get('refresh_token');
      if (!issuedRefresh.has(token)) {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'refresh token already used' });
        return;
      }
      issuedRefresh.delete(token);
      refreshCounter += 1;
      const next = `refresh-${refreshCounter}`;
      issuedRefresh.add(next);
      sendJson(res, 200, {
        access_token: `access-${next}`,
        expires_in: 3600,
        refresh_token: next,
        refresh_expires_in: 7776000,
        membership_id: '12345'
      });
      return;
    }
    sendJson(res, 400, { error: 'unsupported_grant_type' });
  });
});

async function run() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const tokenUrl = `http://127.0.0.1:${server.address().port}/token`;

  const base = {
    tokenUrl,
    apiKey: 'test-key',
    userAgent: 'oauth-test',
    origin: 'https://localhost',
    clientId: '99999',
    retries: 1,
    retryDelayMs: 10
  };

  // 1. Authorization-Code-Tausch
  const exchange = await requestToken({ ...base, grantType: 'authorization_code', code: 'good-code' });
  check('Code-Tausch erfolgreich', exchange.ok && exchange.body.access_token === 'access-good-code', exchange.detail);
  check('Refresh-Token ausgestellt', Boolean(exchange.body.refresh_token), exchange.body.refresh_token);

  // 2. Derselbe Code ein zweites Mal → invalid_grant
  const reuseCode = await requestToken({ ...base, grantType: 'authorization_code', code: 'good-code' });
  check('Code-Wiederverwendung abgelehnt', !reuseCode.ok && /invalid_grant/.test(reuseCode.detail), reuseCode.detail);

  // 3. Refresh-Rotation: erster Refresh liefert neuen Token
  const firstRefreshToken = exchange.body.refresh_token;
  const refresh1 = await requestToken({ ...base, grantType: 'refresh_token', refreshToken: firstRefreshToken });
  check('Refresh erfolgreich', refresh1.ok && refresh1.body.access_token.startsWith('access-refresh-'), refresh1.detail);
  const rotated = refresh1.body.refresh_token;
  check('Refresh-Token rotiert', Boolean(rotated) && rotated !== firstRefreshToken, rotated);

  // 4. Alter Refresh-Token ist danach ungültig
  const reuseRefresh = await requestToken({ ...base, grantType: 'refresh_token', refreshToken: firstRefreshToken });
  check('Alter Refresh-Token ungültig', !reuseRefresh.ok && /already used/.test(reuseRefresh.detail), reuseRefresh.detail);

  // 5. Neuer Refresh-Token funktioniert
  const refresh2 = await requestToken({ ...base, grantType: 'refresh_token', refreshToken: rotated });
  check('Rotierter Refresh-Token gültig', refresh2.ok, refresh2.detail);

  // 6. 503 → Retry mit demselben Code
  const flaky = await requestToken({ ...base, grantType: 'authorization_code', code: 'flaky-code' });
  check('503 wird wiederholt', flaky.ok, flaky.detail);
  check('Retry hat 2 Versuche gebraucht', flakyHits >= 2, flakyHits);

  // 7. Cloudflare-HTML 403 wird verständlich gemeldet
  const html = await requestToken({ ...base, grantType: 'authorization_code', code: 'html-code' });
  check('HTML-Fehler erkannt', !html.ok && /HTML-Antwort/.test(html.detail), html.detail);

  // 8. Client-Secret nur bei vertraulichen Clients im Body
  const publicBody = buildTokenBody({ grant_type: 'authorization_code', code: 'x', client_id: '1' }, '');
  const confidentialBody = buildTokenBody({ grant_type: 'authorization_code', code: 'x', client_id: '1' }, 'secret-123');
  check('Public-Client ohne Secret', !publicBody.includes('client_secret'), publicBody);
  check('Vertraulicher Client mit Secret', confidentialBody.includes('client_secret=secret-123'), confidentialBody);
}

run()
  .catch((error) => {
    check('Test ohne Ausnahme', false, error && (error.stack || error.message));
  })
  .finally(() => {
    server.close();
    let failed = 0;
    for (const entry of results) {
      if (!entry.ok) failed += 1;
      console.log(`${entry.ok ? 'OK  ' : 'FAIL'} ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}`);
    }
    console.log(`\n${results.length - failed}/${results.length} OAuth-Tests bestanden.`);
    process.exit(failed ? 1 : 0);
  });
