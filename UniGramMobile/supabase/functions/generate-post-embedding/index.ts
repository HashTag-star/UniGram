import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { UUID_RE, withinQuota } from '../_shared/guard.ts'

// Edge Function natively supports Supabase.ai sessions
// @ts-ignore - Supabase.ai is injected globally in the Edge Runtime
const model = new Supabase.ai.Session('gte-small')

const CORS = {
  'Access-Control-Allow-Origin': 'unigram://',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Auth is fail-closed: either a valid webhook secret (DB webhook) or a user JWT that owns the post.
  const webhookSecret = Deno.env.get('EDGE_FUNCTION_SECRET')
  const providedSecret = req.headers.get('x-webhook-secret')
  const isWebhook = !!webhookSecret && !!providedSecret && providedSecret === webhookSecret

  let callerId: string | null = null
  if (!isWebhook) {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return j({ error: 'Unauthorized' }, 401)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
    if (authErr || !user) return j({ error: 'Unauthorized' }, 401)
    callerId = user.id
  }

  try {
    const payload = await req.json()
    const id = payload?.record?.id

    if (!id || typeof id !== 'string' || !UUID_RE.test(id)) return j({ error: 'Invalid post ID' }, 400)

    // Load the post server-side; never embed client-supplied text.
    const { data: post, error: postErr } = await supabase
      .from('posts').select('id, user_id, caption, hashtags').eq('id', id).single()
    if (postErr || !post) return j({ error: 'Post not found' }, 404)
    if (!isWebhook && post.user_id !== callerId) return j({ error: 'Forbidden' }, 403)

    if (!isWebhook && !(await withinQuota(supabase, callerId!, 'generate-post-embedding', 100))) {
      return j({ error: 'Too many requests' }, 429)
    }

    const tags = Array.isArray(post.hashtags) ? post.hashtags.slice(0, 30).join(' ') : ''
    const contentToEmbed = `${post.caption || ''} ${tags}`.trim().slice(0, 2000)

    if (!contentToEmbed) return j({ ok: true, message: 'No text content to embed' })

    const embedding = await model.run(contentToEmbed, { mean_pool: true, normalize: true })

    const { error } = await supabase
      .from('posts')
      .update({ embedding: JSON.parse(JSON.stringify(embedding)) }) // ensure array format
      .eq('id', id)

    if (error) {
      console.error('Failed to update post with embedding:', error.message)
      return j({ error: 'Failed to store embedding' }, 500)
    }
    return j({ ok: true })
  } catch (err: any) {
    console.error('Generation error:', err)
    return j({ error: 'Embedding failed' }, 500)
  }
})
