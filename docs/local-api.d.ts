// Automatisch erzeugt von tools/make-openapi.js.
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
