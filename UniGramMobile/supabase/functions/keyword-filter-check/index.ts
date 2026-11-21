import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': 'unigram://',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMPTY = { flagged: false, matches: [], severity: null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Authenticate the caller via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const token = authHeader.slice(7)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { text } = await req.json()
    if (!text?.trim()) {
      return new Response(JSON.stringify(EMPTY), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: keywords } = await supabase
      .from('keyword_filters')
      .select('keyword, severity')

    if (!keywords?.length) {
      return new Response(JSON.stringify(EMPTY), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const lower = text.toLowerCase()
    const matches = keywords.filter((k: any) =>
      lower.includes(k.keyword.toLowerCase())
    )

    if (!matches.length) {
      return new Response(JSON.stringify(EMPTY), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Return highest severity found
    const severityRank: Record<string, number> = { block: 3, flag: 2, warn: 1 }
    const topSeverity = matches.reduce((top: any, k: any) =>
      (severityRank[k.severity] ?? 0) > (severityRank[top.severity] ?? 0) ? k : top
    ).severity

    return new Response(
      JSON.stringify({
        flagged: true,
        matches: matches.map((k: any) => k.keyword),
        severity: topSeverity,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    // On error, fail open (don't block the user)
    return new Response(JSON.stringify(EMPTY), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
