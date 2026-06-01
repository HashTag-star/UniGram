import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

async function applyPro(supabase: any, payment: any) {
  if (payment.product_type !== 'pro_sub') return;
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({ is_pro: true, pro_expires_at: expiresAt })
    .eq('id', payment.user_id);
  if (error) throw new Error(`applyPro failed: ${error.message}`);
}

async function applyBoost(supabase: any, payment: any) {
  if (payment.product_type !== 'market_boost' || !payment.product_id) return;
  const boostType: string = payment.metadata?.boost_type;
  if (!boostType) return;

  let boost_expires_at: string | null = null;
  if (boostType === 'spotlight') boost_expires_at = new Date(Date.now() + 3 * 86_400_000).toISOString();
  if (boostType === 'featured')  boost_expires_at = new Date(Date.now() + 7 * 86_400_000).toISOString();

  await supabase
    .from('market_items')
    .update({ boost_type: boostType, boost_expires_at })
    .eq('id', payment.product_id);
}

// [Kofi Asante - Backend] Webhook was missing ad_payment handling — if Paystack
// fires the webhook before the user comes back to call verify, the ad stays
// stuck in 'pending' indefinitely. Mirror the activation logic from
// paystack-verify here so either entrypoint flips the campaign live.
async function applyAdPayment(supabase: any, payment: any) {
  if (payment.product_type !== 'ad_payment' || !payment.product_id) return;
  const durationDays: number = payment.metadata?.duration_days ?? 7;
  const startDate = new Date().toISOString();
  const endDate   = new Date(Date.now() + durationDays * 86_400_000).toISOString();
  await supabase
    .from('campus_ads')
    .update({ status: 'active', start_date: startDate, end_date: endDate })
    .eq('id', payment.product_id);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get('x-paystack-signature') ?? '';
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')!;

    // Verify HMAC-SHA512 signature from Paystack
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign'],
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const expectedSig = Array.from(new Uint8Array(sigBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (expectedSig !== signature) {
      return new Response('Invalid signature', { status: 401 });
    }

    const event = JSON.parse(body);
    if (event.event !== 'charge.success') {
      return new Response('ok', { status: 200 });
    }

    const reference: string | undefined = event.data?.reference;
    if (!reference) return new Response('ok', { status: 200 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('reference', reference)
      .single();

    if (!payment || payment.status === 'success') {
      return new Response('ok', { status: 200 }); // idempotent
    }

    await supabase
      .from('payments')
      .update({ status: 'success', verified_at: new Date().toISOString() })
      .eq('reference', reference);

    await applyBoost(supabase, payment);
    await applyPro(supabase, payment);
    await applyAdPayment(supabase, payment);

    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[paystack-webhook]', e);
    return new Response('Internal error', { status: 500 });
  }
});
