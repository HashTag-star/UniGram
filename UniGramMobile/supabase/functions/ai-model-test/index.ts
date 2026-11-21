import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { callAiMessageWithFallback, sanitizeError, CORS } from '../_shared/groq.ts'

/**
 * Admin-only: sends one tiny prompt to a specific NVIDIA model so the admin can
 * confirm the API key works and see the latency BEFORE switching the app to it.
 * Body: { model: string }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ ok: false, error: 'Not authenticated' }, 401)
    const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!prof?.is_admin) return json({ ok: false, error: 'Admins only' }, 403)

    const { model } = await req.json()
    if (typeof model !== 'string' || !/^[\w.\-]+\/[\w.\-:]+$/.test(model)) {
      return json({ ok: false, error: 'Enter a valid model id like meta/llama-3.3-70b-instruct' }, 400)
    }

    const started = Date.now()
    const msg = await callAiMessageWithFallback({
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      temperature: 0,
      maxTokens: 16,
      forceNvidiaModel: model,
    })
    return json({ ok: true, ms: Date.now() - started, sample: String(msg.content ?? '').slice(0, 80) })
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message ?? err).slice(0, 220), ...sanitizeError(err, 'ai-model-test') }, 200)
  }
})
