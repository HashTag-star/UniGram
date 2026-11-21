/**
 * Billing layer behind the paywall.
 *
 * The UI (PaywallSheet) only talks to `getBillingProvider()`. Two providers ship:
 *
 *  - `simulated` (default for now): no money moves. A purchase "succeeds" after a
 *    short fake processing delay and unlocks Pro on this device only.
 *  - `paystack`: the existing server-verified Paystack checkout.
 *
 * To plug in the real paywall (RevenueCat / StoreKit / Play Billing / ...):
 *   1. implement `BillingProvider` below,
 *   2. call `setBillingProvider(myProvider)` at app start (or add a case in
 *      `resolveProvider`), and
 *   3. set EXPO_PUBLIC_BILLING_MODE accordingly.
 * Nothing in the screens needs to change.
 */
import {
  grantSimulatedPro, restoreSimulatedPro, hasUsedSimulatedTrial,
  type SimulatedPlanId,
} from './simulatedPro';
import { openProCheckout } from './pro';

export type PlanId = SimulatedPlanId;

export interface ProPlan {
  id: PlanId;
  title: string;
  /** Price in GHS for one billing period. */
  priceGHS: number;
  periodLabel: string;
  /** Shown as a pill, e.g. "Best value". */
  badge?: string;
  /** Per-month equivalent, for comparison. */
  perMonthGHS: number;
  savingsPct?: number;
}

export const FREE_TRIAL_DAYS = 7;

export const PRO_PLANS: ProPlan[] = [
  { id: 'yearly', title: 'Yearly', priceGHS: 200, periodLabel: 'year', perMonthGHS: 16.67, badge: 'Best value', savingsPct: 17 },
  { id: 'monthly', title: 'Monthly', priceGHS: 20, periodLabel: 'month', perMonthGHS: 20 },
];

export type BillingMode = 'simulated' | 'paystack';

export interface PurchaseRequest {
  userId: string;
  plan: ProPlan;
  /** Start with a free trial (provider decides whether it is honoured). */
  withTrial: boolean;
  /** Progress text for the UI ("Contacting provider…"). */
  onStatus?: (message: string) => void;
}

export interface PurchaseResult {
  success: boolean;
  /** True when the user backed out — not an error. */
  cancelled?: boolean;
  message?: string;
}

export interface BillingProvider {
  readonly mode: BillingMode;
  /** Shown in the paywall footer / test banner. */
  readonly label: string;
  /** True when no real money is involved (drives the TEST MODE banner). */
  readonly isSimulated: boolean;
  /** Plans this provider can actually sell. */
  readonly plans: PlanId[];
  /** Whether the user can still start a free trial. */
  canStartTrial(userId: string): boolean;
  purchase(req: PurchaseRequest): Promise<PurchaseResult>;
  restore(userId: string): Promise<PurchaseResult>;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── Simulated provider ───────────────────────────────────────────────────────
const simulatedProvider: BillingProvider = {
  mode: 'simulated',
  label: 'Test mode',
  isSimulated: true,
  plans: ['yearly', 'monthly'],
  canStartTrial: () => !hasUsedSimulatedTrial(),
  async purchase({ userId, plan, withTrial, onStatus }) {
    onStatus?.('Contacting payment provider…');
    await sleep(700);
    onStatus?.(withTrial ? 'Starting your free trial…' : 'Confirming payment…');
    await sleep(900);
    await grantSimulatedPro({
      userId,
      planId: plan.id,
      trialDays: withTrial && !hasUsedSimulatedTrial() ? FREE_TRIAL_DAYS : 0,
    });
    return { success: true };
  },
  async restore(userId) {
    await sleep(600);
    const found = await restoreSimulatedPro(userId);
    return found
      ? { success: true, message: 'Your UniGram Pro subscription was restored.' }
      : { success: false, message: 'No previous subscription found on this device.' };
  },
};

// ─── Paystack provider (existing server-verified checkout) ────────────────────
const paystackProvider: BillingProvider = {
  mode: 'paystack',
  label: 'Secured by Paystack',
  isSimulated: false,
  plans: ['monthly'],
  canStartTrial: () => false,
  async purchase({ onStatus }) {
    onStatus?.('Opening secure checkout…');
    // The Paystack flow is monthly-only today and has no trial.
    const ok = await openProCheckout();
    return ok ? { success: true } : { success: false, message: 'Payment was not completed. Try again.' };
  },
  async restore() {
    // Entitlement is server-side (webhook) — a profile refresh is the "restore".
    return { success: false, message: 'Subscriptions are linked to your account — pull to refresh your profile.' };
  },
};

let override: BillingProvider | null = null;

/** Plug in a real provider (e.g. RevenueCat) — see the header comment. */
export function setBillingProvider(provider: BillingProvider | null) {
  override = provider;
}

function resolveProvider(): BillingProvider {
  const mode = (process.env.EXPO_PUBLIC_BILLING_MODE ?? 'simulated').toLowerCase();
  if (mode === 'paystack') return paystackProvider;
  return simulatedProvider;
}

export function getBillingProvider(): BillingProvider {
  return override ?? resolveProvider();
}
