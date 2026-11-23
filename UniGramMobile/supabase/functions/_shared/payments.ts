// Shared payment-settlement logic for paystack-verify and paystack-webhook.
//
// Ordering: side effects are applied FIRST, the payment row is flipped to 'success' LAST.
// Every effect is idempotent (fund_campus_ad is keyed on the reference, boosts are absolute,
// Pro extension is claimed once via a metadata flag), so a failed apply can simply be retried
// by the next webhook delivery / verify call.

async function applyPro(supabase: any, payment: any) {
  if (payment.product_type !== 'pro_sub') return;

  // Claim the one-time extension. Only the caller that flips the flag applies it.
  const { data: claimed, error: claimErr } = await supabase.rpc('claim_payment_effect', {
    p_reference: payment.reference,
    p_flag: 'pro_applied',
  });
  if (claimErr) throw new Error(`claim failed: ${claimErr.message}`);
  if (claimed !== true) return; // already applied

  try {
    const { data: prof, error: readErr } = await supabase
      .from('profiles').select('pro_expires_at').eq('id', payment.user_id).single();
    if (readErr) throw readErr;
    const days = Number(payment.metadata?.days) > 0 ? Number(payment.metadata.days) : 30;
    const base = Math.max(Date.now(), prof?.pro_expires_at ? new Date(prof.pro_expires_at).getTime() : 0);
    const expiresAt = new Date(base + days * 86_400_000).toISOString();
    const { error } = await supabase
      .from('profiles')
      .update({ is_pro: true, pro_expires_at: expiresAt })
      .eq('id', payment.user_id);
    if (error) throw error;
  } catch (e: any) {
    await supabase.rpc('release_payment_effect', { p_reference: payment.reference, p_flag: 'pro_applied' });
    throw new Error(`applyPro failed: ${e?.message ?? e}`);
  }
}

async function applyAdPayment(supabase: any, payment: any) {
  if (payment.product_type !== 'ad_payment' || !payment.product_id) return;
  const durationDays: number = payment.metadata?.duration_days ?? 7;
  // Money goes ON the campaign (idempotent per payment reference). The DB flips the
  // campaign live only once it is fully funded (migration 062).
  const { error } = await supabase.rpc('fund_campus_ad', {
    p_campaign_id: payment.product_id,
    p_reference: payment.reference,
    p_pesewas: payment.amount,
    p_days: durationDays,
  });
  if (error) throw new Error(`fund_campus_ad failed: ${error.message}`);
}

async function applyBoost(supabase: any, payment: any) {
  if (payment.product_type !== 'market_boost' || !payment.product_id) return;
  const boostType: string = payment.metadata?.boost_type;
  if (!boostType) return;

  let boost_expires_at: string | null = null;
  if (boostType === 'spotlight') boost_expires_at = new Date(Date.now() + 3 * 86_400_000).toISOString();
  if (boostType === 'featured')  boost_expires_at = new Date(Date.now() + 7 * 86_400_000).toISOString();
  // 'urgent' has no expiry — boost_expires_at stays null

  const { error } = await supabase
    .from('market_items')
    .update({ boost_type: boostType, boost_expires_at })
    .eq('id', payment.product_id);
  if (error) throw new Error(`applyBoost failed: ${error.message}`);
}

/**
 * Settles a payment that Paystack reports as successful.
 * `paidPesewas` / `currency` come from Paystack and must cover what we asked for.
 * Returns true if the payment is (now) settled.
 */
export async function settleSuccessfulPayment(
  supabase: any,
  payment: any,
  paidPesewas: number,
  currency: string,
): Promise<boolean> {
  if (!Number.isFinite(paidPesewas) || paidPesewas < payment.amount) {
    throw new Error('Paid amount does not match');
  }
  if ((currency ?? '').toUpperCase() !== (payment.currency ?? 'GHS').toUpperCase()) {
    throw new Error('Currency does not match');
  }

  // 1. effects (idempotent) — a throw here leaves the payment 'pending' so it can be retried
  await applyBoost(supabase, payment);
  await applyPro(supabase, payment);
  await applyAdPayment(supabase, payment);

  // 2. only now mark the payment as settled
  if (payment.status !== 'success') {
    const { error } = await supabase
      .from('payments')
      .update({ status: 'success', verified_at: new Date().toISOString() })
      .eq('reference', payment.reference);
    if (error) throw new Error(`mark success failed: ${error.message}`);
  }
  return true;
}
