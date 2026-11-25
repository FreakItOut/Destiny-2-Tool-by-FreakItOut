'use strict';

// Erzeugt docs/local-api.openapi.yaml und docs/local-api-client.js aus
// electron/api-commands.js.
// Aufruf: node tools/make-openapi.js

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('js-yaml');
const { LOCAL_API_COMMANDS } = require('../electron/api-commands');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'docs', 'local-api.openapi.yaml');
const CLIENT = path.join(ROOT, 'docs', 'local-api-client.js');

const jsonResponse = (schema) => ({
  description: 'Ergebnis',
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } }
});

const paths = {};
for (const command of LOCAL_API_COMMANDS) {
  const parameters = Object.entries(command.params || {}).map(([name, description]) => ({
    name,
    in: 'query',
    required: false,
    description,
    schema: { type: 'string' }
  }));
  const workflow = command.path === '/action/workflow';
  const hasBody = workflow || command.body === true;
  const isAction = command.path.startsWith('/action/') || command.method === 'POST';
  const successSchema = command.path === '/health'
    ? 'Health'
    : command.path === '/state'
      ? 'State'
      : command.path.startsWith('/key/') || command.path.startsWith('/badge/')
        ? 'KeyValue'
        : command.path.startsWith('/jobs/')
          ? 'JobResponse'
          : command.path === '/tokens'
            ? 'TokenList'
            : 'JsonObject';
  paths[command.path] = paths[command.path] || {};
  paths[command.path][command.method.toLowerCase()] = {
    summary: command.description,
    ...(command.auth === false ? { security: [] } : {}),
    ...(hasBody
      ? {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: workflow ? '#/components/schemas/WorkflowRequest' : '#/components/schemas/JsonObject' } } }
        }
      }
      : (parameters.length ? { parameters } : {})),
    responses: isAction
      ? { 202: jsonResponse('ActionResult'), 400: jsonResponse('Error'), 401: jsonResponse('Error'), 403: jsonResponse('Error'), 429: jsonResponse('Error') }
      : { 200: jsonResponse(successSchema), 400: jsonResponse('Error'), 401: jsonResponse('Error'), 403: jsonResponse('Error'), 404: jsonResponse('Error'), 429: jsonResponse('Error') }
  };
}
for (const [apiPath, description] of [['/state', 'Gesamtstatus'], ['/state.txt', 'Gesamtstatus als Text'], ['/focus', 'Fokus-Status'], ['/key/{name}', 'Einzelwert als Text oder JSON'], ['/badge/{name}.svg', 'SVG-Badge'], ['/events', 'Server-Sent-Events-Stream'], ['/commands.txt', 'Befehlsliste als Text'], ['/openapi.json', 'OpenAPI-Dokument'], ['/openapi.yaml', 'OpenAPI-Dokument als YAML']]) {
  paths[apiPath] = paths[apiPath] || { get: { summary: description, responses: { 200: { description: 'OK' } } } };
}

const document = {
  openapi: '3.1.0',
  info: {
    title: 'Destiny 2 Tool – Lokale API',
    version: '1.5.0',
    description: 'Lokale HTTP-API für Stream Deck, Skripte und Overlays. Token per X-D2-Token, Authorization: Bearer, signierter URL oder HMAC. Rollen: read, action, admin.'
  },
  servers: [{ url: 'http://127.0.0.1:7331' }, { url: 'http://127.0.0.1:7331/v1' }],
  security: [{ tokenQuery: [] }, { tokenHeader: [] }, { bearerAuth: [] }],
  paths,
  components: {
    securitySchemes: {
      tokenQuery: { type: 'apiKey', in: 'query', name: 'token' },
      tokenHeader: { type: 'apiKey', in: 'header', name: 'X-D2-Token' },
      bearerAuth: { type: 'http', scheme: 'bearer' }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' }, code: { type: 'string' }, error: { type: 'string' },
          requestId: { type: 'string' }, durationMs: { type: 'integer' }
        }
      },
      JsonObject: { type: 'object', additionalProperties: true },
      ActionResult: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' }, requestId: { type: 'string' }, durationMs: { type: 'integer' }
        },
        additionalProperties: true
      },
      Health: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' }, running: { type: 'boolean' }, ready: { type: 'boolean' },
          degraded: { type: 'boolean' }, api: { type: 'string' }, renderer: { type: 'string' }, game: { type: 'string' }
        }
      },
      State: { type: 'object', additionalProperties: true },
      KeyValue: { type: 'object', additionalProperties: true },
      Job: {
        type: 'object',
        properties: {
          id: { type: 'string' }, kind: { type: 'string' }, state: { type: 'string' },
          progress: { type: 'integer' }, message: { type: 'string' }, error: { type: 'string' },
          startedAt: { type: 'integer' }, finishedAt: { type: 'integer' }
        },
        additionalProperties: true
      },
      JobResponse: { type: 'object', properties: { ok: { type: 'boolean' }, job: { $ref: '#/components/schemas/Job' } } },
      Token: {
        type: 'object',
        properties: {
          id: { type: 'string' }, name: { type: 'string' }, scope: { type: 'string' },
          prefix: { type: 'string' }, expiresAt: { type: 'integer' }, lastUsedAt: { type: 'integer' }
        }
      },
      TokenList: { type: 'object', properties: { ok: { type: 'boolean' }, tokens: { type: 'array', items: { $ref: '#/components/schemas/Token' } } } },
      WorkflowRequest: {
        type: 'object',
        properties: {
          steps: { type: 'array', items: { type: 'object' } },
          dryRun: { type: 'boolean' }, stopOnError: { type: 'boolean' }, timeoutMs: { type: 'integer' }
        }
      }
    }
  }
};

fs.writeFileSync(TARGET, `# Automatisch erzeugt von tools/make-openapi.js – nicht von Hand bearbeiten.\n# Die Laufzeit liefert dieselbe Beschreibung unter /openapi.json und /openapi.yaml.\n${YAML.dump(document, { noRefs: true, lineWidth: 120 })}`, 'utf8');

const endpointLines = LOCAL_API_COMMANDS.map((command) => {
  const method = String(command.method || 'GET').toUpperCase();
  return `  ${JSON.stringify(`${method} ${command.path}`)}: ${JSON.stringify(command.description || command.path)}`;
});
const client = `'use strict';
// Automatisch erzeugt von tools/make-openapi.js.
// Minimaler Client für die lokale Destiny-2-Tool-API.
const ENDPOINTS = {
${endpointLines.join(',\n')}
};

class D2LocalApi {
  constructor(baseUrl = 'http://127.0.0.1:7331', token = '') {
    this.baseUrl = String(baseUrl).replace(/\\/+$/, '');
    this.token = String(token || '');
  }

  url(pathname, params = {}) {
    const target = new URL(pathname, this.baseUrl + '/');
    for (const [key, value] of Object.entries(params)) {
      if (value != null) target.searchParams.set(key, String(value));
    }
    return target;
  }

  async request(pathname, { method = 'GET', params = {}, body = null, timeoutMs = 10000 } = {}) {
    const target = this.url(pathname, params);
    const headers = { Accept: 'application/json' };
    if (this.token) headers['X-D2-Token'] = this.token;
    if (body != null) headers['Content-Type'] = 'application/json';
    const response = await fetch(target, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    let value = null;
    try { value = JSON.parse(text); } catch (error) { value = { text }; }
    return { status: response.status, ok: response.ok && value && value.ok !== false, body: value };
  }

  get(pathname, params = {}) { return this.request(pathname, { params }); }
  post(pathname, body = null, params = {}) { return this.request(pathname, { method: 'POST', params, body }); }
  patch(pathname, body = null, params = {}) { return this.request(pathname, { method: 'PATCH', params, body }); }
  delete(pathname, params = {}) { return this.request(pathname, { method: 'DELETE', params }); }

  health() { return this.get('/health'); }
  state() { return this.get('/state'); }
  key(name, params = {}) { return this.get('/key/' + encodeURIComponent(name), params); }
  action(name, params = {}) { return this.get('/action/' + String(name).replace(/^\\/+/, ''), params); }
  loadouts() { return this.get('/loadouts'); }
  applyLoadout(name) { return this.action('loadout', { name }); }
  checklist() { return this.get('/checklist'); }
  updateChecklist(id, patch) { return this.patch('/checklist/' + encodeURIComponent(id), patch); }
  deleteChecklist(id) { return this.delete('/checklist/' + encodeURIComponent(id)); }
  jobs() { return this.get('/jobs'); }
  job(id) { return this.get('/jobs/' + encodeURIComponent(id)); }
  cancelJob(id) { return this.post('/jobs/' + encodeURIComponent(id) + '/cancel'); }
  createToken(name, scope = 'action', days = 0) { return this.action('tokens/create', { name, scope, days }); }
  revokeToken(id) { return this.action('tokens/revoke', { id }); }
}

module.exports = { D2LocalApi, ENDPOINTS };
`;
fs.writeFileSync(CLIENT, client, 'utf8');
const declaration = `// Automatisch erzeugt von tools/make-openapi.js.
export interface ApiError {
  ok: false;
  code?: string;
  error?: string;
  requestId?: string;
  durationMs?: number;
}

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  body: T;
}

export interface D2LocalApiOptions {
  apiUrl?: string;
  token?: string;
  timeoutMs?: number;
}

export declare class D2LocalApi {
  constructor(baseUrl?: string, token?: string);
  baseUrl: string;
  token: string;
  url(pathname: string, params?: Record<string, string | number | boolean>): URL;
  request<T = Record<string, unknown>>(pathname: string, options?: {
    method?: string;
    params?: Record<string, string | number | boolean>;
    body?: unknown;
    timeoutMs?: number;
  }): Promise<ApiResult<T>>;
  get<T = Record<string, unknown>>(pathname: string, params?: Record<string, string | number | boolean>): Promise<ApiResult<T>>;
  post<T = Record<string, unknown>>(pathname: string, body?: unknown, params?: Record<string, string | number | boolean>): Promise<ApiResult<T>>;
  patch<T = Record<string, unknown>>(pathname: string, body?: unknown, params?: Record<string, string | number | boolean>): Promise<ApiResult<T>>;
  delete<T = Record<string, unknown>>(pathname: string, params?: Record<string, string | number | boolean>): Promise<ApiResult<T>>;
  health(): Promise<ApiResult>;
  state(): Promise<ApiResult>;
  key(name: string, params?: Record<string, string | number | boolean>): Promise<ApiResult>;
  action(name: string, params?: Record<string, string | number | boolean>): Promise<ApiResult>;
  loadouts(): Promise<ApiResult>;
  applyLoadout(name: string): Promise<ApiResult>;
  checklist(): Promise<ApiResult>;
  updateChecklist(id: string, patch: Record<string, unknown>): Promise<ApiResult>;
  deleteChecklist(id: string): Promise<ApiResult>;
  jobs(): Promise<ApiResult>;
  job(id: string): Promise<ApiResult>;
  cancelJob(id: string): Promise<ApiResult>;
  createToken(name: string, scope?: string, days?: number): Promise<ApiResult>;
  revokeToken(id: string): Promise<ApiResult>;
}

export declare const ENDPOINTS: Record<string, string>;
`;
fs.writeFileSync(path.join(ROOT, 'docs', 'local-api.d.ts'), declaration, 'utf8');
console.log(`TypeScript-Deklaration geschrieben: docs/local-api.d.ts`);
console.log(`OpenAPI geschrieben: ${path.relative(ROOT, TARGET)} (${LOCAL_API_COMMANDS.length} Befehle)`);
console.log(`API-Client geschrieben: ${path.relative(ROOT, CLIENT)}`);
