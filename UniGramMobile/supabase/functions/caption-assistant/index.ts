import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { userId, postType, university, trendingHashtags = [] } = await req.json()

    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) throw new Error('GEMINI_API_KEY not configured in edge function secrets.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch user's interests if not provided
    let interestContext = ''
    if (userId) {
      const { data: interests } = await supabase
        .from('user_interests')
        .select('interest')
        .eq('user_id', userId)
        .limit(10)
      if (interests?.length) {
        interestContext = `User interests: ${interests.map((i: any) => i.interest).join(', ')}.`
      }
    }

    const hashtagHint = trendingHashtags.length
      ? `Trending right now: ${trendingHashtags.slice(0, 8).join(', ')}.`
      : ''

    const prompt = `You are a creative social media assistant for UniGram, a university social network in Ghana.

Generate 3 caption options for a "${postType}" post by a student at ${university || 'a Ghanaian university'}.
${interestContext}
${hashtagHint}

Rules:
- Each caption is 1-3 sentences max
- Tone 1: casual (Gen Z energy, Ghanaian slang welcome e.g. "eeii", "charley", "chale")
- Tone 2: inspirational (motivational, campus pride)
- Tone 3: funny/witty (self-aware, relatable student humor)
- Suggest 5 relevant hashtags

Respond ONLY with valid JSON (no markdown fences):
{
  "captions": [
    {"tone": "casual", "text": "..."},
    {"tone": "inspirational", "text": "..."},
    {"tone": "funny", "text": "..."}
  ],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 512 },
        }),
      }
    )

    const result = await resp.json()
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    // Strip markdown code fences if Gemini wraps the JSON
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)

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
