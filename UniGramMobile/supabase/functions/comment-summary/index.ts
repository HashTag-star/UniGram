const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function callGroq(apiKey: string, prompt: string, temperature = 0.7, maxTokens = 512): Promise<string> {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
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
    const { comments } = await req.json()

    if (!Array.isArray(comments) || comments.length < 3) {
      return new Response(JSON.stringify({ highlights: [] }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) throw new Error('GROQ_API_KEY not configured.')

    const formatted = comments
      .slice(0, 40)
      .map((c: any) => `@${c.username}: ${c.text}`)
      .join('\n')

    const prompt = `You are summarizing comments on a social media post for a Ghanaian university app.

Below are the comments. Extract 2-3 short highlight sentences that capture:
- The dominant mood or reaction
- Any standout opinion, debate, or joke
- A notable compliment or critique if present

Rules:
- Each highlight is ONE sentence, max 12 words
- Write from a neutral observer perspective (not "users say")
- Use natural, conversational English — no bullet symbols, no emojis
- If all comments are very short reactions (e.g., "fire", "nice"), return a single highlight like: "Overwhelmingly positive reactions from the crowd."

Respond ONLY with a JSON array of strings, no markdown:
["highlight 1", "highlight 2"]

Comments:
${formatted}`

    const raw = await callGroq(groqKey, prompt, 0.3, 200)
    const highlights: string[] = JSON.parse(stripJson(raw))

    return new Response(JSON.stringify({ highlights: highlights.slice(0, 3) }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ highlights: [] }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
