import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { amount_ghs, email, product_type, product_id, callback_url, metadata } = await req.json();
    if (!amount_ghs || !email || !product_type) throw new Error('amount_ghs, email and product_type are required');

    const amount_pesewas = Math.round(amount_ghs * 100);
    const reference = `UG-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

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
        callback_url: callback_url ?? 'unigram://payment-callback',
        metadata: {
          ...(metadata ?? {}),
          product_type,
          product_id: product_id ?? null,
          user_id: user.id,
          custom_fields: [
            { display_name: 'Product', variable_name: 'product_type', value: product_type },
          ],
        },
      }),
    });

    const pData = await pRes.json();
    if (!pData.status) throw new Error(pData.message ?? 'Paystack initialization failed');

    await supabase.from('payments').insert({
      user_id: user.id,
      reference,
      amount: amount_pesewas,
      currency: 'GHS',
      status: 'pending',
      product_type,
      product_id: product_id ?? null,
      metadata: { ...(metadata ?? {}), boost_type: metadata?.boost_type },
    });

    return new Response(
      JSON.stringify({ authorization_url: pData.data.authorization_url, reference }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (e: any) {
    console.error('[paystack-init]', e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    );
  }
});
