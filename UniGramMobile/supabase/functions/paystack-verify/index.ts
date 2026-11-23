import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { settleSuccessfulPayment } from "../_shared/payments.ts";

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

    const { reference } = await req.json();
    if (!reference || typeof reference !== 'string') throw new Error('reference is required');

    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('reference', reference)
      .eq('user_id', user.id)
      .single();
    if (!payment) throw new Error('Payment record not found');

    let status: string;

    if (payment.status === 'success') {
      // Already settled (effects are applied before the row is flipped, so nothing to re-apply).
      status = 'success';
    } else {
      const pRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}` } },
      );
      const pData = await pRes.json();
      if (!pData.status) throw new Error(pData.message ?? 'Paystack verification failed');

      const txStatus: string = pData.data.status; // 'success' | 'failed' | 'abandoned' | 'pending'
      if (txStatus === 'success') {
        // Never trust a 'success' that paid less than we asked for (throws on amount/currency mismatch).
        await settleSuccessfulPayment(
          supabase, payment, Number(pData.data.amount ?? 0), String(pData.data.currency ?? ''),
        );
        status = 'success';
      } else {
        if (txStatus === 'failed') {
          await supabase
            .from('payments')
            .update({ status: 'failed', verified_at: new Date().toISOString() })
            .eq('reference', reference)
            .eq('status', 'pending');
        }
        status = txStatus;
      }
    }

    return new Response(
      JSON.stringify({
        status,
        product_type: payment.product_type,
        product_id: payment.product_id,
        metadata: payment.metadata,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (e: any) {
    console.error('[paystack-verify]', e);
    return new Response(
      JSON.stringify({ error: 'Payment verification failed. Please try again.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    );
  }
});
