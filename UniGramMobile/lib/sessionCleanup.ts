/**
 * Central session cleanup. Call `resetSessionState()` whenever the signed-in user
 * changes (sign-out, account switch, account deletion) so the next account never
 * sees the previous account's cached data, queued interactions or ad state.
 *
 * Modules that keep their own per-user module-level caches (e.g. services/algorithm.ts
 * `_blockedCache` / `_reportsCache`) should subscribe with `onSessionReset(cb)`.
 */
import { Cache } from './cache';
import { resetAdDeliveryState } from '../services/adDelivery';
import { clearInteractionQueue } from '../hooks/usePostTracker';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to session resets. Returns an unsubscribe function. */
export function onSessionReset(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Notify subscribers only (no built-in cleanup). */
export function emitSessionReset() {
  listeners.forEach(l => { try { l(); } catch {} });
}

let inFlight: Promise<void> | null = null;

/** Clears every per-user cache/queue, then notifies subscribers. Safe to call repeatedly. */
export function resetSessionState(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try { clearInteractionQueue(); } catch {}
    try { resetAdDeliveryState(); } catch {}
    try { await Cache.clearAll(); } catch {}
    emitSessionReset();
  })().finally(() => { inFlight = null; });
  return inFlight;
}
