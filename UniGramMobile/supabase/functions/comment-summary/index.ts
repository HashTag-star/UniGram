const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) throw new Error('GEMINI_API_KEY not configured.')

    // Format comments compactly to stay within token budget
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

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
        }),
      }
    )

    const result = await resp.json()
    if (result.error) throw new Error(result.error.message)

    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const highlights: string[] = JSON.parse(cleaned)

    return new Response(JSON.stringify({ highlights: highlights.slice(0, 3) }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ highlights: [] }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
