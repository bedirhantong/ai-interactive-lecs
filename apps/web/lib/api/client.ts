/**
 * API client. Same-origin `/api/v1`, cookie session, base response envelope.
 *
 *   success: {success: true,  data, meta: {request_id, pagination}}
 *   error:   {success: false, error: {code, message, request_id, details?}}
 */
export const API_BASE = "/api/v1";

export interface Pagination {
  limit: number;
  next_cursor: number | null;
}

export interface ApiResult<T> {
  data: T;
  status: number;
  headers: Headers;
  pagination: Pagination | null;
}

/** An error response from the API (has a stable `code`) or a network failure (`code === "network"`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown>[] = [],
    readonly requestId: string | null = null,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }

  get isNetwork() {
    return this.code === "network";
  }
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { ...init.headers };
  if (UNSAFE.has(method)) headers["x-atolye-client"] = "1"; // CSRF guard (see API)
  let body: string | undefined;
  if (init.rawBody !== undefined) {
    body = init.rawBody;
    headers["content-type"] ??= "application/json";
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(API_BASE + path, { method, headers, body, credentials: "same-origin", signal: init.signal, cache: "no-store" });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network", "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* not JSON (e.g. the API is not running behind the dev proxy) */
  }
  const envelope = payload as { success?: boolean; data?: T; meta?: { pagination?: Pagination | null }; error?: { code: string; message: string; details?: Record<string, unknown>[]; request_id?: string } } | null;

  if (envelope?.success === true) {
    return { data: envelope.data as T, status: response.status, headers: response.headers, pagination: envelope.meta?.pagination ?? null };
  }
  if (envelope?.success === false && envelope.error) {
    const retry = Number(response.headers.get("retry-after"));
    throw new ApiError(
      response.status,
      envelope.error.code,
      envelope.error.message,
      envelope.error.details ?? [],
      envelope.error.request_id ?? null,
      Number.isFinite(retry) && retry > 0 ? retry : null,
    );
  }
  // No envelope: the API is unreachable (dev proxy error page, 502 from a proxy, ...).
  throw new ApiError(response.status || 0, "network", "Sunucuya ulaşılamadı.");
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Beklenmeyen bir hata oluştu.";
}
