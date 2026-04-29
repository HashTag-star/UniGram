import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function callGroq(apiKey: string, messages: Array<{role: string, content: string}>, maxTokens = 400): Promise<string> {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  })
  if (!resp.ok) throw new Error(`Groq HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const result = await resp.json()
  if (result.error) throw new Error(`Groq error: ${result.error.message}`)
  const text: string = result.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Groq returned empty response')
  return text
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── Admin auth gate ───────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: CORS })
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }
    const { data: adminProfile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminProfile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: CORS })
    }
    // ─────────────────────────────────────────────────────────────────────────

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) throw new Error('GROQ_API_KEY not configured in edge function secrets.')

    const { query } = await req.json()
    if (!query?.trim()) throw new Error('No query provided.')

    // Fetch live platform context in parallel
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
      { count: totalUsers },
      { count: newUsers7d },
      { count: pendingReports },
      { count: pendingVerifications },
      { count: liveSessions },
      { count: posts24h },
      { data: topReports },
      { data: topVerifications },
      { data: recentUsers },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('live_sessions').select('*', { count: 'exact', head: true }).eq('status', 'live'),
      supabase.from('posts').select('*', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
      supabase.from('reports').select('id, target_type, reason, status, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      supabase.from('verification_requests').select('id, full_name, university, type, status, submitted_at').eq('status', 'pending').order('submitted_at', { ascending: false }).limit(5),
      supabase.from('profiles').select('username, university, created_at').order('created_at', { ascending: false }).limit(5),
    ])

    const context = `
UNIGRAM PLATFORM — LIVE DATA SNAPSHOT
======================================
Users: ${totalUsers ?? 0} total | ${newUsers7d ?? 0} new this week
Content: ${posts24h ?? 0} posts in last 24h
Live sessions: ${liveSessions ?? 0} active right now

MODERATION QUEUE
Pending reports: ${pendingReports ?? 0}
Recent reports: ${JSON.stringify(topReports ?? [])}

Pending verifications: ${pendingVerifications ?? 0}
Recent verifications: ${JSON.stringify(topVerifications ?? [])}

RECENT SIGNUPS (last 5)
${JSON.stringify(recentUsers ?? [])}
`.trim()

    const messages = [
      {
        role: 'system',
        content: `You are the UniGram Admin AI — a sharp, concise assistant for the admin dashboard of a Ghanaian university social network.
You have access to real-time platform data provided as context.
Rules:
- Answer in under 120 words unless the admin explicitly asks for detail
- Be direct and actionable — admins want decisions, not explanations
- Reference specific numbers from the data when relevant
- If asked about threats or suspicious activity, flag concrete patterns from the data
- Never make up data not present in the context`,
      },
      {
        role: 'user',
        content: `Platform context:\n${context}\n\nAdmin question: ${query}`,
      },
    ]

    const answer = await callGroq(groqKey, messages, 400)

    return new Response(JSON.stringify({ answer }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
