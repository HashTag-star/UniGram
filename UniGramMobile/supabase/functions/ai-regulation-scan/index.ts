import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    // API key can come from request body (admin UI) or edge function secret
    const geminiKey = body.apiKey || Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) throw new Error('No Gemini API key provided. Set GEMINI_API_KEY in edge function secrets or pass it in the request body.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch pending reports and verifications in parallel
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

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      }
    )

    const geminiResult = await resp.json()

    if (geminiResult.error) {
      throw new Error(`Gemini API error: ${geminiResult.error.message}`)
    }

    const raw = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)

    // Log AI actions to audit table (best-effort, non-blocking)
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
      if (rows.length) {
        await supabase.from('ai_action_log').insert(rows).catch(() => {})
      }
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
