import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callAiWithFallback, repairJson, sanitizeError, CORS } from '../_shared/groq.ts'

const VALID_TYPES = ['none', 'info', 'warning', 'misleading'] as const
type ContextType = typeof VALID_TYPES[number]

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const buffer = await resp.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
    const base64 = btoa(binary)
    const ct = resp.headers.get('content-type') ?? ''
    const mimeType = ct.startsWith('image/') ? ct.split(';')[0].trim() : 'image/jpeg'
    return { base64, mimeType }
  } catch {
    return null
  }
}

function buildPrompt(caption: string | null, postType: string, hasImage: boolean): string {
  const imageNote = hasImage
    ? `An image is also attached (flier, poster, photo, or graphic). READ ALL TEXT AND DETAILS VISIBLE IN THE IMAGE — the image is the primary source of information for this post. If the caption references something that is shown in the image, the image is the authoritative source.`
    : `No image is attached; analyze only the text.`

  return `You are a conservative AI fact-checker for UniGram, a university campus social network in Ghana (primarily KNUST, UG, and other Ghanaian universities).

${imageNote}

Post type: ${postType || 'general'}
Caption text: "${caption?.slice(0, 600) ?? '(no caption)'}"

CONTEXT ABOUT THIS PLATFORM — READ CAREFULLY:
- Common legitimate posts: scholarship and bursary announcements with fliers, campus events, academic notices, personal photos, food/lifestyle, memes, opinions, GH¢ promotions, club activities.
- Scholarship/bursary fliers from real institutions (KNUST, UG, government bodies, NGOs) are NORMAL and LEGITIMATE. They routinely post eligibility criteria and application details in the image itself, not the caption.
- "I cannot verify this" or "no external sources cited" is NOT grounds for flagging. Students share real information all the time without citing sources.

ONLY flag if you see CLEAR, SPECIFIC evidence of ONE of these:
1. Demonstrably false medical/health claims (fake cures, dangerous advice)
2. Obvious scam patterns: upfront payment demands, "guaranteed" jobs/visas, requests for passwords/banking details
3. False attribution — pretending to be from an institution that clearly didn't produce the content
4. Dangerous instructions

DO NOT flag:
- Scholarship/grant announcements from recognisable institutions, even if you cannot personally verify the details
- Posts where the image contains the details the caption only briefly references
- Opinions, satire, cultural content, or personal stories
- Promotional posts for events, products, or services (normal campus activity)
- Anything you are merely "unsure about" — uncertainty alone is not a flag

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "type": "none",
  "context": "",
  "detail": "",
  "confidence": 0.0
}

type values: "none" (fine), "info" (extra context readers might value), "warning" (likely misleading), "misleading" (clearly false/harmful)`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const empty = { type: 'none' as ContextType, context: '', detail: '', confidence: 0 }

  try {
    const { postId, caption, postType, mediaUrl, isImage } = await req.json()

    if (!postId) {
      return new Response(JSON.stringify({ error: 'postId required' }), { status: 400, headers: CORS })
    }

    const hasCaption = typeof caption === 'string' && caption.trim().length >= 10
    const hasAnalyzableImage = isImage && typeof mediaUrl === 'string' && mediaUrl.startsWith('http')

    // Nothing to analyze
    if (!hasCaption && !hasAnalyzableImage) {
      return new Response(JSON.stringify(empty), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Return cached result (only if it was analyzed with the same fidelity)
    const { data: cached } = await supabase
      .from('post_ai_context')
      .select('context_type, context_text, detail_text, confidence, analyzed_with_vision')
      .eq('post_id', postId)
      .single()

    // Re-analyze if we now have image data but the cached result was text-only
    const cacheIsStale = cached && hasAnalyzableImage && !cached.analyzed_with_vision
    if (cached && !cacheIsStale) {
      return new Response(JSON.stringify({
        type: cached.context_type,
        context: cached.context_text,
        detail: cached.detail_text,
        confidence: cached.confidence,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const prompt = buildPrompt(caption ?? null, postType ?? 'general', hasAnalyzableImage)

    let raw = ''
    let usedVision = false

    if (hasAnalyzableImage) {
      const img = await fetchImageAsBase64(mediaUrl)
      if (img) {
        try {
          const visionMessages = [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } },
              { type: 'text', text: prompt },
            ]
          }]
          
          raw = await callAiWithFallback({
            messages: visionMessages,
            temperature: 0.1,
            maxTokens: 300,
            modelOverride: 'llama-3.2-11b-vision-preview'
          })
          usedVision = true
        } catch (visionErr: any) {
          console.warn('[post-ai-context] vision failed, falling back to text:', visionErr.message)
        }
      }
    }

    if (!raw) {
      if (!hasCaption) {
        return new Response(JSON.stringify(empty), { headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
      raw = await callAiWithFallback({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 300,
        modelOverride: 'llama-3.1-8b-instant'
      })
    }

    const parsed = JSON.parse(repairJson(raw))

    const result = {
      type: (VALID_TYPES.includes(parsed.type) ? parsed.type : 'none') as ContextType,
      context: typeof parsed.context === 'string' ? parsed.context.slice(0, 220) : '',
      detail: typeof parsed.detail === 'string' ? parsed.detail.slice(0, 500) : '',
      confidence: typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0,
    }

    await supabase.from('post_ai_context').upsert({
      post_id: postId,
      context_type: result.type,
      context_text: result.context,
      detail_text: result.detail,
      confidence: result.confidence,
      analyzed_with_vision: usedVision,
    })

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    sanitizeError(err, 'post-ai-context')
    // Fail-open for client safety: do not block post display if AI check throws
    return new Response(JSON.stringify(empty), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
