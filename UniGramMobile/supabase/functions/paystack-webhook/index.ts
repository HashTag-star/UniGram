import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { settleSuccessfulPayment } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get('x-paystack-signature') ?? '';
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secretKey) return new Response('Server misconfigured', { status: 500 });

    // Verify HMAC-SHA512 signature from Paystack
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign'],
    );
    const macBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const expectedSig = Array.from(new Uint8Array(macBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison to prevent timing attacks
    const expectedBytes = encoder.encode(expectedSig);
    const providedBytes = encoder.encode(signature);
    if (expectedBytes.length !== providedBytes.length) {
      return new Response('Invalid signature', { status: 401 });
    }
    let mismatch = 0;
    for (let i = 0; i < expectedBytes.length; i++) {
      mismatch |= expectedBytes[i] ^ providedBytes[i];
    }
    if (mismatch !== 0) {
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

    // Amount + currency are checked against OUR payment row inside settleSuccessfulPayment.
    // A failure (including a mismatch) returns 500 so Paystack retries / we notice, and the
    // payment stays 'pending'.
    await settleSuccessfulPayment(
      supabase,
      payment,
      Number(event.data?.amount ?? 0),
      String(event.data?.currency ?? ''),
    );

    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[paystack-webhook]', e);
    return new Response('Internal error', { status: 500 });
  }
});
