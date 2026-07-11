import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callAiWithFallback, repairJson, sanitizeError, CORS } from '../_shared/groq.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // verify_jwt=false is set so the SDK can call this during post-creation flow,
  // but we still require a valid bearer token to prevent unauthenticated abuse.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { userId, postType, university, trendingHashtags = [], mediaBase64, mediaType } = await req.json()

    // Validate the bearer token is a real Supabase session (not just any string)
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

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

    const baseInstructions = `You are a creative social media assistant for UniGram, a university social network in Ghana.

Generate 3 caption options for a "${postType}" post by a student at ${university || 'a Ghanaian university'}.
${interestContext}
${hashtagHint}

Rules:
- Each caption is 1-3 sentences max
- Tone 1: casual (Gen Z energy, Ghanaian slang welcome e.g. "eeii", "charley", "chale")
- Tone 2: inspirational (motivational, campus pride)
- Tone 3: funny/witty (self-aware, relatable student humor)
- Suggest 5 relevant hashtags
- Base the captions on what you actually see in the media (if provided)

Respond ONLY with valid JSON (no markdown fences):
{
  "captions": [
    {"tone": "casual", "text": "..."},
    {"tone": "inspirational", "text": "..."},
    {"tone": "funny", "text": "..."}
  ],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`

    const textMessages = [{ role: 'user', content: baseInstructions }]
    const textModel = 'llama-3.3-70b-versatile'

    let raw: string

    if (mediaBase64) {
      // Try vision models in order of preference; fall back to text-only on any failure
      const visionModels = [
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'llama-3.2-11b-vision-preview',
      ]
      const mediaHint = mediaType === 'video' ? '(this is a thumbnail frame from the video)' : ''
      const visionMessages = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${mediaBase64}` } },
          { type: 'text', text: `${baseInstructions}\n\nAnalyze the image above ${mediaHint} and use it as the basis for the captions.` },
        ],
      }]

      let visionSucceeded = false
      for (const visionModel of visionModels) {
        try {
          raw = await callAiWithFallback({
            messages: visionMessages,
            temperature: 0.9,
            maxTokens: 512,
            modelOverride: visionModel
          })
          console.log(`[caption-assistant] vision succeeded with ${visionModel}`)
          visionSucceeded = true
          break
        } catch (visionErr: any) {
          console.warn(`[caption-assistant] vision model ${visionModel} failed:`, visionErr.message)
        }
      }

      if (!visionSucceeded) {
        console.log('[caption-assistant] all vision models failed, falling back to text-only')
        raw = await callAiWithFallback({
          messages: textMessages,
          temperature: 0.9,
          maxTokens: 512,
          modelOverride: textModel
        })
      }
    } else {
      raw = await callAiWithFallback({
        messages: textMessages,
        temperature: 0.9,
        maxTokens: 512,
        modelOverride: textModel
      })
    }

    const parsed = JSON.parse(repairJson(raw!))

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    const errorDetails = sanitizeError(err, 'caption-assistant')
    return new Response(JSON.stringify(errorDetails), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
