import { API_URL } from '@/config';
import { tokenStore } from './token-store';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  /** Send the access token (default true). */
  auth?: boolean;
}

let sessionExpiredListener: (() => void) | null = null;

/** Called when the refresh token is rejected, so the UI can return to the login screen. */
export function onSessionExpired(listener: (() => void) | null): void {
  sessionExpiredListener = listener;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the refresh token for a new pair. Single-flight: concurrent 401s share one refresh call —
 * the API rotates refresh tokens and treats reuse as theft, so two parallel refreshes would log the user out.
 * Resolves false if the session is invalid; throws ApiError(0) on network failure (session is kept).
 */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const current = tokenStore.get();
      if (!current) return false;
      let res: Response;
      try {
        res = await fetch(`${API_URL}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
      } catch {
        throw new ApiError(0, 'Sem conexão com o servidor.');
      }
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      await tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function errorMessage(body: unknown, status: number): string {
  const msg = (body as { message?: unknown } | undefined)?.message;
  if (Array.isArray(msg)) return msg.join('\n');
  if (typeof msg === 'string') return msg;
  return status >= 500 ? 'Erro no servidor. Tente novamente em instantes.' : `Erro ${status}`;
}

export async function request<T>(path: string, opts: RequestOptions = {}, isRetry = false): Promise<T> {
  const useAuth = opts.auth !== false;
  const tokens = useAuth ? tokenStore.get() : null;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;

  let body: FormData | string | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, { method: opts.method ?? 'GET', headers, body });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet.');
  }

  if (res.status === 401 && tokens && !isRetry) {
    if (await refreshSession()) return request<T>(path, opts, true);
    await tokenStore.clear();
    sessionExpiredListener?.();
    throw new ApiError(401, 'Sua sessão expirou. Entre novamente.');
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status), data);
  return data as T;
}

/** Photo URLs may be relative when the API serves files itself (local storage driver). */
export function resolveUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith('/') ? `${API_URL}${url}` : url;
}
