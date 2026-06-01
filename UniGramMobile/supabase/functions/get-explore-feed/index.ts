import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { keywords, match_threshold = 0.5, limit = 24 } = body

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
      return new Response(JSON.stringify({ error: error.message }), {
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
