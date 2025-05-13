import {
  apiErrorSchema,
  ErrorCode,
  RETRYABLE_CODES,
  type ErrorCode as Code,
} from '@bot-friend/shared';
import { config } from '../config';
import { useSession } from '../session';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: Code,
    message: string,
    readonly retryAfterSeconds?: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
  get retryable() {
    return this.status === 0 || RETRYABLE_CODES.has(this.code);
  }
}

export const OFFLINE_MESSAGE = 'Can’t reach Bot-Friend. Check your connection and try again.';

export function authHeaders(): Record<string, string> {
  const token = useSession.getState().token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function toApiError(res: Response): Promise<ApiClientError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON error
  }
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const e = parsed.data.error;
    return new ApiClientError(res.status, e.code, e.message, e.retryAfterSeconds, e.details);
  }
  return new ApiClientError(
    res.status,
    res.status >= 500 ? ErrorCode.Internal : ErrorCode.ValidationFailed,
    'Something went wrong. Try again.',
  );
}

/** Session expired or revoked: drop it so the app routes back to sign-in. */
function handleUnauthenticated(err: ApiClientError) {
  if (err.code === ErrorCode.Unauthenticated || err.code === ErrorCode.AccountDeleted) {
    void useSession.getState().signOut();
  }
}

export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts: { signal?: AbortSignal; auth?: boolean; token?: string } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method,
      signal: opts.signal,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.auth === false
          ? {}
          : opts.token
            ? { authorization: `Bearer ${opts.token}` }
            : authHeaders()),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiClientError(0, ErrorCode.ProviderUnavailable, OFFLINE_MESSAGE);
  }
  if (!res.ok) {
    const err = await toApiError(res);
    handleUnauthenticated(err);
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
