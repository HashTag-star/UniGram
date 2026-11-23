/**
 * Shared Supabase Edge Function caller (used by campusAds / pro / payments).
 *  - uses the current session's access token
 *  - 30s AbortController timeout
 *  - errors are turned into friendly, user-safe messages (original kept on `.raw`)
 */
import { supabase } from './supabase';
import { friendlyError } from './friendlyError';

const DEFAULT_TIMEOUT_MS = 30_000;

export class EdgeFunctionError extends Error {
  raw: string;
  status: number;
  constructor(message: string, raw: string, status: number) {
    super(message);
    this.name = 'EdgeFunctionError';
    this.raw = raw;
    this.status = status;
  }
}

export async function callEdgeFunction<T = any>(
  name: string,
  body: object = {},
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new EdgeFunctionError(friendlyError('Not authenticated'), 'Not authenticated', 401);

  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* non-JSON body */ }
    if (!res.ok || json?.error) {
      const raw = String(json?.error ?? json?.message ?? `HTTP ${res.status}`);
      throw new EdgeFunctionError(friendlyError(raw), raw, res.status);
    }
    return json as T;
  } catch (e: any) {
    if (e instanceof EdgeFunctionError) throw e;
    const raw = e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e);
    throw new EdgeFunctionError(friendlyError(raw), raw, 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The checkout webhook can land a few seconds after the user returns, so a single
 * verify call races it. Poll `paystack-verify` until it reports success (or a
 * terminal failure) — every `intervalMs` for up to `maxMs`.
 */
export async function verifyPaymentWithPolling<T extends { status: string } = any>(
  reference: string,
  opts: { maxMs?: number; intervalMs?: number } = {},
): Promise<T | null> {
  const maxMs = opts.maxMs ?? 20_000;
  const intervalMs = opts.intervalMs ?? 2_500;
  const started = Date.now();
  let last: T | null = null;
  for (;;) {
    try {
      last = await callEdgeFunction<T>('paystack-verify', { reference });
      if (last?.status === 'success') return last;
      if (last?.status === 'failed' || last?.status === 'abandoned' || last?.status === 'reversed') return last;
    } catch {
      /* transient — keep polling until the deadline */
    }
    if (Date.now() - started + intervalMs > maxMs) break;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return last;
}
