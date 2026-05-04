import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_TYPES = ['none', 'info', 'warning', 'misleading'] as const
type ContextType = typeof VALID_TYPES[number]

async function callGroq(apiKey: string, prompt: string): Promise<string> {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
    }),
  })
  if (!resp.ok) throw new Error(`Groq HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const result = await resp.json()
  if (result.error) throw new Error(`Groq error: ${result.error.message}`)
  return result.choices?.[0]?.message?.content ?? ''
}

function stripJson(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const empty = { type: 'none' as ContextType, context: '', detail: '', confidence: 0 }

  try {
    const { postId, caption, postType } = await req.json()

    if (!postId) {
      return new Response(JSON.stringify({ error: 'postId required' }), { status: 400, headers: CORS })
    }

    // No caption → nothing to analyze
    if (!caption?.trim() || caption.trim().length < 20) {
      return new Response(JSON.stringify(empty), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Return from cache if already analyzed
    const { data: cached } = await supabase
      .from('post_ai_context')
      .select('context_type, context_text, detail_text, confidence')
      .eq('post_id', postId)
      .single()

    if (cached) {
      return new Response(JSON.stringify({
        type: cached.context_type,
        context: cached.context_text,
        detail: cached.detail_text,
        confidence: cached.confidence,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) throw new Error('GROQ_API_KEY not configured')

    const prompt = `You are an AI fact-checker for UniGram, a university campus social network in Ghana. Analyze the following student post and determine if it contains potentially misleading, false, or harmful information.

Post type: ${postType || 'general'}
Post text: "${caption.slice(0, 800)}"

Evaluate for:
- Medical misinformation or dangerous health advice
- False news, unverified rumors, or extraordinary claims presented as fact
- Scams targeting students (fake scholarships, job fraud, money schemes)
- Dangerous instructions or illegal activity promotion
- Conspiracy theories or fabricated statistics

CRITICAL RULES:
- The vast majority of student posts are completely normal (food, campus life, opinions, jokes, memes, study content). These should return "none".
- Only flag if there is a CLEAR, SPECIFIC misinformation concern — not vague disagreement.
- Do NOT flag: opinions, satire, cultural content, personal stories, speculation, or things you are merely unsure about.
- Confidence must reflect how certain you are that the content is actually harmful/false.

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "type": "none",
  "context": "",
  "detail": "",
  "confidence": 0.0
}

Where type is one of:
- "none": post is fine
- "info": useful clarifying context readers may appreciate (e.g. missing nuance)
- "warning": claim appears unverified or potentially misleading
- "misleading": post contains content that is likely false or harmful`

    const raw = await callGroq(groqKey, prompt)
    const parsed = JSON.parse(stripJson(raw))

    const result = {
      type: (VALID_TYPES.includes(parsed.type) ? parsed.type : 'none') as ContextType,
      context: typeof parsed.context === 'string' ? parsed.context.slice(0, 220) : '',
      detail: typeof parsed.detail === 'string' ? parsed.detail.slice(0, 500) : '',
      confidence: typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0,
    }

    // Cache result (upsert in case of race)
    await supabase.from('post_ai_context').upsert({
      post_id: postId,
      context_type: result.type,
      context_text: result.context,
      detail_text: result.detail,
      confidence: result.confidence,
    })

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[post-ai-context]', err.message)
    // Fail open — never block a post from rendering due to AI error
    return new Response(JSON.stringify(empty), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
