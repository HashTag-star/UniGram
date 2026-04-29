import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function callGroq(apiKey: string, prompt: string, temperature = 0.1, maxTokens = 2048): Promise<string> {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature,
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

function stripJson(raw: string): string {
  return raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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

    const [{ data: reports }, { data: verifications }] = await Promise.all([
      supabase
        .from('reports')
        .select('id, target_type, reason, details, status, created_at, reporter_id, target_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('verification_requests')
        .select('id, type, full_name, university, email, submitted_at, sheerid_verified, document_urls')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })
        .limit(20),
    ])

    const reportCount = (reports || []).length
    const verificationCount = (verifications || []).length

    const prompt = `You are UniGram's content safety AI for a Ghanaian university social network.

Analyze ${reportCount} pending content reports and ${verificationCount} pending student ID verifications.

FOR REPORTS — identify:
- Coordinated harassment (same reporter_id filing multiple reports, or same target_id reported many times)
- Potential bot-generated reports (many reports filed within seconds of each other)
- High-severity content (explicit material, threats, doxxing)
- Recurring bad actors who appear frequently

FOR VERIFICATIONS — identify:
- Multiple requests from the same university with suspiciously similar patterns
- SheerID-bypassed requests that still look fraudulent
- Missing or clearly fake document uploads (empty document_urls array on a non-SheerID request)

Respond ONLY with valid JSON (no markdown fences):
{
  "summary": "one paragraph plain-English assessment of overall platform health",
  "findings": [
    {
      "target_id": "the id of the report or verification",
      "target_type": "report | verification",
      "action": "auto_hide | flag_review | approve | reject | no_action",
      "severity": "low | medium | high | critical",
      "reason": "brief explanation under 20 words"
    }
  ],
  "anomalies": ["description of suspicious patterns you noticed"],
  "stats": {
    "total_reports": ${reportCount},
    "high_severity_reports": 0,
    "total_verifications": ${verificationCount},
    "suspicious_verifications": 0
  }
}

Reports data: ${JSON.stringify((reports || []).slice(0, 25))}
Verifications data: ${JSON.stringify((verifications || []).slice(0, 15))}`

    const raw = await callGroq(groqKey, prompt, 0.1, 2048)
    console.log('[ai-regulation-scan] Groq response length:', raw.length)

    let parsed: any
    try {
      parsed = JSON.parse(stripJson(raw))
    } catch (parseErr: any) {
      console.error('[ai-regulation-scan] JSON parse failed. Raw (first 500):', raw.slice(0, 500))
      throw new Error(`Failed to parse Groq response as JSON: ${parseErr.message}`)
    }

    if (parsed.findings?.length) {
      const severityToConfidence: Record<string, number> = { critical: 0.95, high: 0.82, medium: 0.65, low: 0.45 }
      const rows = parsed.findings
        .filter((f: any) => f.action !== 'no_action')
        .map((f: any) => ({
          action_type: f.action,
          target_id: f.target_id,
          target_type: f.target_type,
          confidence: severityToConfidence[f.severity] ?? 0.5,
          ai_reason: f.reason,
        }))
      if (rows.length) await supabase.from('ai_action_log').insert(rows).catch(() => {})
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
