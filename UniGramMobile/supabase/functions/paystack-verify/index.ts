import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function applyPro(supabase: any, payment: any) {
  if (payment.product_type !== 'pro_sub') return;
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({ is_pro: true, pro_expires_at: expiresAt })
    .eq('id', payment.user_id);
  if (error) throw new Error(`applyPro failed: ${error.message}`);
}

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

async function applyBoost(supabase: any, payment: any) {
  if (payment.product_type !== 'market_boost' || !payment.product_id) return;
  const boostType: string = payment.metadata?.boost_type;
  if (!boostType) return;

  let boost_expires_at: string | null = null;
  if (boostType === 'spotlight') boost_expires_at = new Date(Date.now() + 3 * 86_400_000).toISOString();
  if (boostType === 'featured')  boost_expires_at = new Date(Date.now() + 7 * 86_400_000).toISOString();
  // 'urgent' has no expiry — boost_expires_at stays null

  await supabase
    .from('market_items')
    .update({ boost_type: boostType, boost_expires_at })
    .eq('id', payment.product_id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization');

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new Error('Unauthorized');

    const { reference } = await req.json();
    if (!reference) throw new Error('reference is required');

    const pRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}` } },
    );
    const pData = await pRes.json();
    if (!pData.status) throw new Error(pData.message ?? 'Paystack verification failed');

    const txStatus: string = pData.data.status; // 'success' | 'failed' | 'abandoned' | 'pending'
    const isSuccess = txStatus === 'success';

    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('reference', reference)
      .eq('user_id', user.id)
      .single();

    if (!payment) throw new Error('Payment record not found');

    if (payment.status !== 'success') {
      await supabase
        .from('payments')
        .update({
          status: isSuccess ? 'success' : 'failed',
          verified_at: new Date().toISOString(),
        })
        .eq('reference', reference);

      if (isSuccess) {
        await applyBoost(supabase, payment);
        await applyPro(supabase, payment);
        await applyAdPayment(supabase, payment);
      }
    } else if (isSuccess) {
      // Payment was already marked success (webhook fired first).
      // Re-apply Pro in case the earlier attempt failed silently.
      await applyPro(supabase, payment);
    }

    return new Response(
      JSON.stringify({
        status: isSuccess ? 'success' : txStatus,
        product_type: payment.product_type,
        product_id: payment.product_id,
        metadata: payment.metadata,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (e: any) {
    console.error('[paystack-verify]', e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    );
  }
});
