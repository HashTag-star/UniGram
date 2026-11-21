import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Edge Function natively supports Supabase.ai sessions
// @ts-ignore - Supabase.ai is injected globally in the Edge Runtime
const model = new Supabase.ai.Session('gte-small')

const CORS = {
  'Access-Control-Allow-Origin': 'unigram://',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Verify webhook secret or JWT auth
  const authHeader = req.headers.get('Authorization')
  const webhookSecret = Deno.env.get('EDGE_FUNCTION_SECRET')

  if (webhookSecret) {
    // Webhook mode: verify shared secret
    const providedSecret = req.headers.get('x-webhook-secret')
    if (providedSecret !== webhookSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
  } else if (authHeader?.startsWith('Bearer ')) {
    // JWT mode: verify user token
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const token = authHeader.slice(7)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
  } else {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  try {
    const payload = await req.json()

    // payload.record for row inserts/updates
    const { caption, hashtags, id } = payload.record

    if (!id || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return new Response(JSON.stringify({ error: 'Invalid post ID' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Combine caption and hashtags for a better embedding representation
    const contentToEmbed = `${caption || ''} ${(hashtags || []).join(' ')}`.trim()

    if (!contentToEmbed) {
      return new Response('No text content to embed', { status: 200 })
    }

    // Generate embedding using local Edge equivalent of Transformers.js
    const embedding = await model.run(contentToEmbed, {
      mean_pool: true,
      normalize: true,
    })

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error } = await supabaseClient
      .from('posts')
      .update({ embedding: JSON.parse(JSON.stringify(embedding)) }) // ensure array format
      .eq('id', id)

    if (error) {
      console.error('Failed to update post with embedding:', error.message)
      return new Response(`Error: ${error.message}`, { status: 500 })
    }

    return new Response('Embedding generated successfully', { status: 200 })
  } catch (err: any) {
    console.error('Generation error:', err)
    return new Response(`Error: ${err.message}`, { status: 500 })
  }
})
