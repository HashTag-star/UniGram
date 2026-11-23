import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withinQuota } from '../_shared/guard.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
const model = new Supabase.ai.Session('gte-small')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  // [Kofi Asante - Backend] Auth gate: previously any unauthenticated caller
  // could invoke this and burn embedding-generation compute. Require a Bearer
  // token, verify it against Supabase auth, and bind the request's userId to
  // auth.uid() so a caller can't pass someone else's id.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const keywords: string = typeof body.keywords === 'string' ? body.keywords.slice(0, 300) : ''
    const match_threshold = Math.min(1, Math.max(0, Number(body.match_threshold) || 0.5))
    const limit = Math.min(50, Math.max(1, Math.floor(Number(body.limit) || 24)))

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const userId = user.id

    const quotaClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    if (!(await withinQuota(quotaClient, userId, 'get-explore-feed', 300))) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Default search text if no keywords
    const searchText = keywords && keywords.trim() ? keywords : 'university student life college'

    // Generate embedding for interests
    const embedding = await model.run(searchText, {
      mean_pool: true,
      normalize: true,
    })

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Call the vector RPC we just created!
    const { data: posts, error } = await supabaseClient
      .rpc('get_vector_explore_posts', {
        p_embedding: JSON.parse(JSON.stringify(embedding)), // ensure array
        p_user_id: userId,
        p_match_threshold: match_threshold,
        p_limit: limit
      })

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to load explore feed' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Return the recommended posts
    return new Response(JSON.stringify({ posts }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Failed to load explore feed' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
