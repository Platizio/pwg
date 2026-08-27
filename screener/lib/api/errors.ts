/* The one result shape every API call in this codebase returns.

   Nothing in lib/api throws. A network failure, a timeout, a 500 and a
   malformed body all arrive here as `ok: false` so that callers can keep
   composing with Promise.allSettled and a dead upstream degrades one panel
   instead of blanking the page. */

export type ApiOk<T> = { ok: true; data: T; status: number; ms: number };
export type ApiFailure = { ok: false; error: string; status: number; ms: number };
export type ApiResult<T> = ApiOk<T> | ApiFailure;

export const ok = <T>(data: T, status: number, ms: number): ApiOk<T> => ({
  ok: true,
  data,
  status,
  ms,
});

export const fail = (error: string, status: number, ms: number): ApiFailure => ({
  ok: false,
  error,
  status,
  ms,
});

/** Never let an upstream error string carry a bearer token into a log line. */
export function scrub(message: string): string {
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>");
}
