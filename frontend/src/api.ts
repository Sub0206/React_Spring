import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Centralised API client for the LendIQ frontend.
 *
 * Versioning:
 *   • Canonical paths use the `/api/v1/...` (Spring-Boot-aligned) prefix.
 *   • The legacy `/api/...` paths are still served by the FastAPI backend,
 *     so a few resources that don't yet have a v1 alias can fall back here.
 *   • Components SHOULD pass logical paths (e.g. "/clients", "/applications")
 *     and let `apiPath()` resolve to the canonical v1 URL.
 */
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const API_PREFIX = "/api/v1";
const TOKEN_KEY = "smart_lending_token";

export async function saveToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/**
 * Path map — translates the (older) frontend logical paths into the canonical
 * Spring-Boot `/api/v1/...` paths described in
 * `/app/docs/FRONTEND_ENDPOINT_MIGRATION.md`. Any path NOT listed here is
 * forwarded as-is under `/api/v1/`. Existing screens can keep their original
 * `/clients/...` strings — the rewrites happen here transparently.
 */
function rewriteToV1(input: string): string {
  let p = input.startsWith("/") ? input : `/${input}`;
  // Borrowers (Clients renamed)
  if (p.startsWith("/clients")) p = "/borrowers" + p.slice("/clients".length);
  // Repayments restructure: /loans/{id}/repay/{m}            → /loans/{id}/repayments/{m}/pay
  //                         /loans/{id}/undo-pay/{m}         → /loans/{id}/repayments/{m}/undo
  //                         /loans/{id}/reschedule/{m}       → /loans/{id}/repayments/{m}/reschedule
  let m = p.match(/^\/loans\/([^/]+)\/repay\/([^/]+)$/);
  if (m) p = `/loans/${m[1]}/repayments/${m[2]}/pay`;
  m = p.match(/^\/loans\/([^/]+)\/undo-pay\/([^/]+)$/);
  if (m) p = `/loans/${m[1]}/repayments/${m[2]}/undo`;
  m = p.match(/^\/loans\/([^/]+)\/reschedule\/([^/]+)$/);
  if (m) p = `/loans/${m[1]}/repayments/${m[2]}/reschedule`;
  // Audit moved under /reports
  if (p.startsWith("/audit/summary")) p = "/reports" + p;
  // Subscriptions: /me → /current
  if (p === "/subscriptions/me") p = "/subscriptions/current";
  return p;
}

/**
 * Build a fully-qualified URL using the canonical /api/v1 prefix.
 * Use this for fetch calls that need the URL as a string (e.g. file uploads,
 * EventSource, image src, PDF window.open).
 */
export function apiUrl(path: string): string {
  return `${BASE}${API_PREFIX}${rewriteToV1(path)}`;
}

/**
 * Lightweight JSON fetch wrapper.
 * - Auto-attaches Bearer token unless `opts.auth = false`.
 * - Auto-rewrites legacy paths to /api/v1/...
 * - Throws Error(detail) on non-2xx responses for predictable .catch() handling.
 */
export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean; headers?: Record<string, string> } = {}
): Promise<T> {
  const { method = "GET", body, auth = true, headers: extraHeaders } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders || {}),
  };
  if (auth) {
    const t = await getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(apiUrl(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.detail || data?.message || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export const API_BASE = BASE;
