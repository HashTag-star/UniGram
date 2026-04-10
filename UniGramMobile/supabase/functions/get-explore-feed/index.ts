import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore
const model = new Supabase.ai.Session('gte-small')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { userId, keywords, match_threshold = 0.5, limit = 24 } = await req.json()

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400 })
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
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    // Return the recommended posts
    return new Response(JSON.stringify({ posts }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 200 
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
