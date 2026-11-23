import { supabase } from '../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import { callEdgeFunction, verifyPaymentWithPolling } from '../lib/edgeFetch';

export type BoostType = 'spotlight' | 'featured' | 'urgent';

export interface BoostTier {
  type: BoostType;
  label: string;
  description: string;
  price_ghs: number;
  duration: string;
  color: string;
  icon: string;
}

export const BOOST_TIERS: BoostTier[] = [
  {
    type: 'urgent',
    label: 'Urgent Badge',
    description: 'Red "Urgent" badge on your listing — signals buyers immediately.',
    price_ghs: 5,
    duration: 'No expiry',
    color: '#ef4444',
    icon: 'flash',
  },
  {
    type: 'spotlight',
    label: 'Spotlight',
    description: 'Highlighted placement in the browse list.',
    price_ghs: 10,
    duration: '3 days',
    color: '#f59e0b',
    icon: 'star',
  },
  {
    type: 'featured',
    label: 'Featured',
    description: 'Pinned to the top of the market feed.',
    price_ghs: 20,
    duration: '7 days',
    color: '#6366f1',
    icon: 'rocket',
  },
];

export async function initBoostPayment(itemId: string, boostType: BoostType) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('Account email is required for payment');
  const tier = BOOST_TIERS.find(t => t.type === boostType)!;

  return callEdgeFunction('paystack-init', {
    amount_ghs: tier.price_ghs,
    email: user.email,
    product_type: 'market_boost',
    product_id: itemId,
    metadata: { boost_type: boostType },
  }) as Promise<{ authorization_url: string; reference: string }>;
}

/** Test-mode boost: applies the boost directly (owner-only via RLS), no money moves. */
export async function applySimulatedBoost(itemId: string, boostType: BoostType): Promise<void> {
  const days = boostType === 'spotlight' ? 3 : boostType === 'featured' ? 7 : null;
  const boost_expires_at = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  await new Promise<void>(r => setTimeout(r, 900));
  const { data, error } = await supabase
    .from('market_items')
    .update({ boost_type: boostType, boost_expires_at })
    .eq('id', itemId)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Could not boost this listing.');
}

export async function verifyPayment(reference: string) {
  return callEdgeFunction('paystack-verify', { reference }) as Promise<{
    status: string;
    product_type: string;
    product_id: string;
    metadata: any;
  }>;
}

/**
 * Opens the Paystack checkout in an in-app browser then verifies the
 * transaction server-side. Returns { success, boostType } regardless of
 * how the browser closed — the webhook handles edge cases where the
 * callback URL redirect is missed.
 */
export async function openPaystackCheckout(
  authorizationUrl: string,
  reference: string,
): Promise<{ success: boolean; boostType?: BoostType }> {
  await WebBrowser.openAuthSessionAsync(authorizationUrl, 'unigram://payment-callback');

  // Always verify — payment could have succeeded even if the deep-link
  // redirect didn't fire (e.g. user closes the browser manually).
  try {
    const data = await verifyPaymentWithPolling<any>(reference);
    const boostType = data?.metadata?.boost_type as BoostType | undefined;
    return { success: data?.status === 'success', boostType };
  } catch {
    return { success: false };
  }
}
