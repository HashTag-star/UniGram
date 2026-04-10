import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Edge Function natively supports Supabase.ai sessions
// @ts-ignore - Supabase.ai is injected globally in the Edge Runtime
const model = new Supabase.ai.Session('gte-small')

Deno.serve(async (req) => {
  const payload = await req.json()
  
  // payload.record for row inserts/updates
  const { caption, hashtags, id } = payload.record
  
  // Combine caption and hashtags for a better embedding representation
  const contentToEmbed = `${caption || ''} ${(hashtags || []).join(' ')}`.trim()
  
  if (!contentToEmbed) {
    return new Response('No text content to embed', { status: 200 })
  }

  try {
    // Generate embedding using local Edge equivalent of Transformers.js
    const embedding = await model.run(contentToEmbed, {
      mean_pool: true,
      normalize: true,
    })

    // Store in database
    // We instantiate the supabase client with auth headers from the request
    // This allows it to run with service_role permissions if the webhook sends it,
    // or standard permissions.
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
