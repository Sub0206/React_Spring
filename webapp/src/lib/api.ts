/** API client shared by all webapp pages.
 *
 * - Prepends `/api/v1` to every call (mirrors mobile behaviour).
 * - Attaches the JWT from localStorage when `auth !== false`.
 * - Transparently proxied to FastAPI via the rewrite in `next.config.mjs`.
 */

const PREFIX = '/api/v1';
const TOKEN_KEY = 'lendiq_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  auth?: boolean;
  headers?: Record<string, string>;
  /** Extra search params appended to the URL. */
  params?: Record<string, string | number | boolean | undefined>;
};

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers = {}, params } = opts;

  let url = `${PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  if (params) {
    const qp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) qp.append(k, String(v));
    });
    const q = qp.toString();
    if (q) url += (url.includes('?') ? '&' : '?') + q;
  }

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (auth) {
    const t = getToken();
    if (t) finalHeaders['Authorization'] = `Bearer ${t}`;
  }

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}
