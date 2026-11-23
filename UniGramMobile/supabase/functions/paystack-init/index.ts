import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Server-side price lists (pesewas). Mirrors services/pro.ts / services/billing.ts PRO_PLANS and
// services/payments.ts BOOST_TIERS — the client-sent amount is never trusted.
const PRO_PLANS: Record<string, { pesewas: number; days: number }> = {
  monthly: { pesewas: 20 * 100, days: 30 },
  yearly: { pesewas: 200 * 100, days: 365 },
};
const BOOST_PRICES: Record<string, number> = {
  urgent: 5 * 100,
  spotlight: 10 * 100,
  featured: 20 * 100,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeCallback(url: unknown): string {
  const fallback = 'unigram://payment-callback';
  if (typeof url !== 'string' || url.length > 500) return fallback;
  return /^(unigram:\/\/|https:\/\/)/i.test(url) ? url : fallback;
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
    // The payer's email comes from the authenticated account, never from the request body.
    const email = user.email;
    if (!email) throw new Error('Account email is required');

    const { amount_ghs, product_type, product_id, callback_url, metadata } = await req.json();
    if (!product_type) throw new Error('product_type is required');

    let amount_pesewas = 0;
    const safeMeta: Record<string, unknown> = {};
    let safeProductId: string | null = null;

    if (product_type === 'pro_sub') {
      const plan = typeof metadata?.plan === 'string' && PRO_PLANS[metadata.plan] ? metadata.plan : 'monthly';
      amount_pesewas = PRO_PLANS[plan].pesewas;
      safeMeta.plan = plan;
      safeMeta.days = PRO_PLANS[plan].days;
    } else if (product_type === 'market_boost') {
      const boostType = metadata?.boost_type;
      if (typeof boostType !== 'string' || !(boostType in BOOST_PRICES)) throw new Error('Invalid boost type');
      if (typeof product_id !== 'string' || !UUID_RE.test(product_id)) throw new Error('Invalid item');
      const { data: item } = await supabase
        .from('market_items').select('id, seller_id').eq('id', product_id).single();
      if (!item || item.seller_id !== user.id) throw new Error('Not your listing');
      amount_pesewas = BOOST_PRICES[boostType];
      safeMeta.boost_type = boostType;
      safeProductId = product_id;
    } else if (product_type === 'ad_payment') {
      if (typeof product_id !== 'string' || !UUID_RE.test(product_id)) throw new Error('Invalid campaign');
      const { data: ad } = await supabase
        .from('campus_ads')
        .select('id, user_id, budget, funded_pesewas, status')
        .eq('id', product_id).single();
      if (!ad || ad.user_id !== user.id) throw new Error('Not your campaign');
      if (!['pending', 'paused'].includes(ad.status)) throw new Error('Campaign cannot be funded');
      const expected = ad.budget * 100 - ad.funded_pesewas; // what is still owed after any credit was applied
      if (expected <= 0) throw new Error('Campaign is already funded');
      // Client sends GHS rounded up from the remaining pesewas. Anything lower underpays -> reject.
      const claimed = Math.round(Number(amount_ghs) * 100);
      if (!Number.isFinite(claimed) || claimed < expected || claimed > expected + 99) {
        throw new Error('Amount does not match what is owed');
      }
      amount_pesewas = Math.ceil(expected / 100) * 100;
      const days = Number(metadata?.duration_days);
      safeMeta.duration_days = Number.isFinite(days) ? Math.min(90, Math.max(1, Math.floor(days))) : 7;
      safeProductId = product_id;
    } else {
      throw new Error('Unknown product_type');
    }

    const reference = `UG-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const pRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount_pesewas,
        email,
        reference,
        currency: 'GHS',
        callback_url: safeCallback(callback_url),
        metadata: {
          ...safeMeta,
          product_type,
          product_id: safeProductId,
          user_id: user.id,
          custom_fields: [
            { display_name: 'Product', variable_name: 'product_type', value: product_type },
          ],
        },
      }),
    });

    const pData = await pRes.json();
    if (!pData.status) throw new Error(pData.message ?? 'Paystack initialization failed');

    const { error: insErr } = await supabase.from('payments').insert({
      user_id: user.id,
      reference,
      amount: amount_pesewas,
      currency: 'GHS',
      status: 'pending',
      product_type,
      product_id: safeProductId,
      metadata: safeMeta,
    });
    if (insErr) throw new Error('Could not record payment');

    return new Response(
      JSON.stringify({ authorization_url: pData.data.authorization_url, reference }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (e: any) {
    console.error('[paystack-init]', e);
    return new Response(
      JSON.stringify({ error: 'Payment initialization failed. Please try again.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    );
  }
});
