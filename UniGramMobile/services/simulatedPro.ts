/**
 * Local-only "simulated" Pro entitlement.
 *
 * Used while the real paywall/billing provider isn't wired in yet. Nothing here
 * touches the database or any payment service — it only lives on the device
 * (AsyncStorage), so testers can walk through the whole subscribe / manage /
 * cancel flow and see every Pro-gated feature unlock.
 *
 * `is_pro` / `pro_expires_at` on the real profile stay server-controlled (only
 * the payment webhook can set them). When a real provider is plugged in, the
 * server value wins and this store is simply never written to.
 *
 * This module must stay free of imports from ./pro or ./billing (they import it).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SimulatedPlanId = 'monthly' | 'yearly';

export interface SimulatedEntitlement {
  planId: SimulatedPlanId;
  startedAt: string;
  /** End of the current paid (or trial) period. */
  expiresAt: string;
  autoRenew: boolean;
  isTrial: boolean;
}

const KEY_PREFIX = 'ug_sim_pro:v1:';
const TRIAL_PREFIX = 'ug_sim_pro_trial_used:v1:';

let currentUserId: string | null = null;
let entitlement: SimulatedEntitlement | null = null;
let trialUsed = false;
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach(l => { try { l(); } catch {} });
}

export function subscribeSimulatedPro(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Monotonic counter — bumps on every change so hooks can re-render. */
export function getSimulatedProVersion(): number {
  return version;
}

export function getSimulatedEntitlement(): SimulatedEntitlement | null {
  return entitlement;
}

export function hasUsedSimulatedTrial(): boolean {
  return trialUsed;
}

function isLive(e: SimulatedEntitlement | null): e is SimulatedEntitlement {
  return !!e && new Date(e.expiresAt).getTime() > Date.now();
}

export function isSimulatedProActive(): boolean {
  return isLive(entitlement);
}

/** Load the stored entitlement for this user (call on sign-in / app start). */
export async function hydrateSimulatedPro(userId: string | null): Promise<void> {
  if (userId === currentUserId && (entitlement || !userId)) return;
  currentUserId = userId;
  entitlement = null;
  trialUsed = false;
  if (userId) {
    try {
      const [raw, trial] = await Promise.all([
        AsyncStorage.getItem(KEY_PREFIX + userId),
        AsyncStorage.getItem(TRIAL_PREFIX + userId),
      ]);
      trialUsed = trial === '1';
      if (raw) {
        const parsed = JSON.parse(raw) as SimulatedEntitlement;
        entitlement = renewIfDue(parsed);
      }
    } catch {
      // Corrupt / unavailable storage → behave as "not subscribed".
    }
  }
  emit();
}

/** Simulated auto-renew: roll the period forward while auto-renew is on. */
function renewIfDue(e: SimulatedEntitlement): SimulatedEntitlement | null {
  const now = Date.now();
  let end = new Date(e.expiresAt).getTime();
  if (end > now) return e;
  if (!e.autoRenew) return e; // lapsed — isLive() will report inactive
  const periodMs = (e.planId === 'yearly' ? 365 : 30) * 86_400_000;
  while (end <= now) end += periodMs;
  return { ...e, expiresAt: new Date(end).toISOString(), isTrial: false };
}

async function persist() {
  if (!currentUserId) return;
  try {
    if (entitlement) await AsyncStorage.setItem(KEY_PREFIX + currentUserId, JSON.stringify(entitlement));
    else await AsyncStorage.removeItem(KEY_PREFIX + currentUserId);
  } catch {}
}

export async function grantSimulatedPro(input: {
  userId: string;
  planId: SimulatedPlanId;
  trialDays?: number;
}): Promise<SimulatedEntitlement> {
  if (currentUserId !== input.userId) await hydrateSimulatedPro(input.userId);
  const now = Date.now();
  const isTrial = !!input.trialDays && input.trialDays > 0;
  const periodDays = isTrial ? input.trialDays! : input.planId === 'yearly' ? 365 : 30;
  entitlement = {
    planId: input.planId,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + periodDays * 86_400_000).toISOString(),
    autoRenew: true,
    isTrial,
  };
  if (isTrial) {
    trialUsed = true;
    try { await AsyncStorage.setItem(TRIAL_PREFIX + input.userId, '1'); } catch {}
  }
  await persist();
  emit();
  return entitlement;
}

export async function setSimulatedAutoRenew(enabled: boolean): Promise<void> {
  if (!entitlement) return;
  entitlement = { ...entitlement, autoRenew: enabled };
  await persist();
  emit();
}

/** "Restore purchases" for the simulated store: re-reads what's on the device. */
export async function restoreSimulatedPro(userId: string): Promise<boolean> {
  currentUserId = null; // force a re-read
  await hydrateSimulatedPro(userId);
  return isLive(entitlement);
}

/** Dev helper — wipes the simulated subscription (and trial flag). */
export async function resetSimulatedPro(): Promise<void> {
  const uid = currentUserId;
  entitlement = null;
  trialUsed = false;
  if (uid) {
    try { await AsyncStorage.multiRemove([KEY_PREFIX + uid, TRIAL_PREFIX + uid]); } catch {}
  }
  emit();
}

/**
 * Overlays the simulated subscription onto a profile object so every screen that
 * reads `is_pro` / `pro_expires_at` / `pro_auto_renew` sees one consistent
 * picture. The real (server) subscription always wins when it is active.
 */
export function withSimulatedPro<T extends Record<string, any> | null | undefined>(profile: T): T {
  if (!profile || !isLive(entitlement)) return profile;
  const realActive = !!profile.is_pro && (!profile.pro_expires_at || new Date(profile.pro_expires_at).getTime() > Date.now());
  if (realActive) return profile;
  return {
    ...profile,
    is_pro: true,
    pro_expires_at: entitlement.expiresAt,
    pro_auto_renew: entitlement.autoRenew,
  } as T;
}
