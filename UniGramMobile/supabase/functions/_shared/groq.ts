const ALLOWED_ORIGINS = [
  'https://unigram-mobile.netlify.app',
  'https://unigram.app',
  'unigram://',
]

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.some(o => origin.startsWith(o)) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

export const CORS = getCorsHeaders(null)

export const GROQ_MODEL_FAST = 'llama-3.1-8b-instant'
export const GROQ_MODEL_SMART = 'llama-3.3-70b-versatile'

// ─── NVIDIA NIM (primary provider) ─────────────────────────────────────────────
// OpenAI-compatible endpoint. The API key is an Edge Function secret
// (NVIDIA_API_KEY); which MODEL serves each tier is chosen by an admin in the app
// and stored in public.ai_settings (migration 060).
export type AiTier = 'fast' | 'smart' | 'vision'

export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
// Defaults must be models NVIDIA currently serves (their catalog rotates: e.g.
// meta/llama-3.1-8b-instruct reached end-of-life and now returns HTTP 410).
export const NVIDIA_DEFAULTS: Record<AiTier, string> = {
  fast: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
  smart: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
  vision: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
}

/** Removes <think>…</think> blocks some reasoning models inline in `content`. */
function stripThinking(text: string | null | undefined): string | null {
  if (text == null) return null
  const t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  return t.length ? t : null
}

interface NvidiaResult { ok: boolean; status: number; message?: any; finish?: string; err?: string }

async function nvidiaRequest(key: string, body: any): Promise<NvidiaResult> {
  const resp = await fetch(NVIDIA_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) return { ok: false, status: resp.status, err: (await resp.text()).slice(0, 300) }
  const data = await resp.json()
  const choice = data.choices?.[0]
  return { ok: true, status: 200, message: choice?.message, finish: choice?.finish_reason }
}

/** Existing call sites pass Groq model names; map them onto a tier. */
export function tierFor(modelOverride?: string, hasTools = false): AiTier {
  const m = (modelOverride ?? '').toLowerCase()
  if (m.includes('vision')) return 'vision'
  if (hasTools || m.includes('70b') || m.includes('versatile')) return 'smart'
  return 'fast'
}

interface AiSettings { provider: string; models: Record<AiTier, string> }
let settingsCache: { at: number; value: AiSettings } | null = null

let keyCache: { at: number; value: string | null } | null = null

/**
 * NVIDIA API key: the NVIDIA_API_KEY edge secret wins; otherwise the key an admin
 * saved from the app (public.ai_secrets, readable only with the service role).
 */
export async function getNvidiaKey(): Promise<string | null> {
  const envKey = Deno.env.get('NVIDIA_API_KEY')
  if (envKey) return envKey
  if (keyCache && Date.now() - keyCache.at < 60_000) return keyCache.value
  let value: string | null = null
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (url && key) {
      const resp = await fetch(`${url}/rest/v1/ai_secrets?select=value&key=eq.nvidia_api_key`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      })
      if (resp.ok) {
        const rows: Array<{ value: string }> = await resp.json()
        value = rows[0]?.value ?? null
      }
    }
  } catch (e: any) {
    console.warn(`[AI-Chain] could not load NVIDIA key: ${e.message}`)
  }
  keyCache = { at: Date.now(), value }
  return value
}

/** Reads the admin's model choices (60s cache). Never throws — falls back to defaults. */
export async function loadAiSettings(): Promise<AiSettings> {
  if (settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache.value
  const value: AiSettings = { provider: 'nvidia', models: { ...NVIDIA_DEFAULTS } }
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (url && key) {
      const resp = await fetch(`${url}/rest/v1/ai_settings?select=key,value`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      })
      if (resp.ok) {
        const rows: Array<{ key: string; value: string }> = await resp.json()
        for (const r of rows) {
          if (r.key === 'ai_provider') value.provider = r.value
          if (r.key === 'ai_model_fast' && r.value) value.models.fast = r.value
          if (r.key === 'ai_model_smart' && r.value) value.models.smart = r.value
          if (r.key === 'ai_model_vision' && r.value) value.models.vision = r.value
        }
      }
    }
  } catch (e: any) {
    console.warn(`[AI-Chain] could not load ai_settings: ${e.message}`)
  }
  settingsCache = { at: Date.now(), value }
  return value
}

/**
 * Standardizes error reporting. Hides raw system exceptions from the user
 * but logs full details to the edge function server logs.
 */
export function sanitizeError(err: Error, context = ''): { error: string; details?: string } {
  console.error(`[AI Engine Failure] Context: ${context} | Error: ${err.message}\nStack: ${err.stack}`)
  
  let friendlyMessage = 'An AI-related service error occurred. The operation could not be completed.'
  if (err.message.includes('rate limit') || err.message.includes('429')) {
    friendlyMessage = 'The AI service is currently overloaded. Please try again in a moment.'
  } else if (err.message.includes('JSON parse') || err.message.includes('validation')) {
    friendlyMessage = 'Failed to validate the AI response. Please try again.'
  } else if (err.message.includes('fallback chain')) {
    friendlyMessage = 'All AI engine providers are currently unreachable. Please try again later.'
  }
  
  return { error: friendlyMessage }
}

/**
 * Strips markdown code fences from JSON strings.
 */
export function stripJson(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

/**
 * Automatically repairs common JSON defects generated by LLMs
 * (e.g. trailing commas, missing closing brackets).
 */
export function repairJson(raw: string): string {
  let cleaned = stripJson(raw)
  
  // Remove trailing commas in JSON arrays/objects: ,} -> } and ,] -> ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')
  
  // Balance curly braces
  const openBraces = (cleaned.match(/{/g) || []).length
  const closeBraces = (cleaned.match(/}/g) || []).length
  if (openBraces > closeBraces) {
    cleaned += '}'.repeat(openBraces - closeBraces)
  }
  
  // Balance square brackets
  const openBrackets = (cleaned.match(/\[/g) || []).length
  const closeBrackets = (cleaned.match(/\]/g) || []).length
  if (openBrackets > closeBrackets) {
    cleaned += ']'.repeat(openBrackets - closeBrackets)
  }
  
  return cleaned
}

export interface AiMessage {
  role: string
  content: string | null
  tool_calls?: any[]
}

/**
 * Full message completion call returning the message object with optional tool_calls.
 */
export async function callAiMessageWithFallback(opts: {
  messages: Array<{ role: string; content: any }>
  temperature?: number
  maxTokens?: number
  modelOverride?: string
  tools?: any[] | null
  /** Admin "test model" button: use exactly this NVIDIA model, no fallbacks. */
  forceNvidiaModel?: string
}): Promise<AiMessage> {
  const {
    messages,
    temperature = 0.7,
    maxTokens = 1024,
    modelOverride,
    tools = null,
    forceNvidiaModel,
  } = opts

  const startTime = Date.now()

  // 0. Primary: NVIDIA NIM, with the model the admin picked for this tier
  const nvidiaKey = await getNvidiaKey()
  if (nvidiaKey) {
    const settings = await loadAiSettings()
    if (forceNvidiaModel || settings.provider !== 'off') {
      const tier = tierFor(modelOverride, !!(tools && tools.length > 0))
      const model = forceNvidiaModel || settings.models[tier]
      try {
        console.log(`[AI-Chain] Attempting NVIDIA (${model}, tier=${tier})`)
        const base: any = { model, messages, temperature, max_tokens: maxTokens }
        if (tools && tools.length > 0) base.tools = tools

        // Reasoning models ("thinking") can burn the whole token budget before writing
        // the answer, leaving content=null. Ask for no thinking; if a model rejects
        // the option, retry plain.
        let r = await nvidiaRequest(nvidiaKey, { ...base, chat_template_kwargs: { enable_thinking: false } })
        if (!r.ok && (r.status === 400 || r.status === 422)) r = await nvidiaRequest(nvidiaKey, base)

        // Still empty because thinking ate the budget → one retry with a bigger budget.
        const hasContent = (m: any) => !!(stripThinking(m?.content) || (m?.tool_calls && m.tool_calls.length))
        if (r.ok && !hasContent(r.message) && r.finish === 'length') {
          r = await nvidiaRequest(nvidiaKey, { ...base, max_tokens: Math.min(8192, maxTokens * 4), chat_template_kwargs: { enable_thinking: false } })
        }

        if (r.ok && hasContent(r.message)) {
          console.log(`[AI-Chain] NVIDIA success in ${Date.now() - startTime}ms`)
          return { ...r.message, content: stripThinking(r.message.content) }
        }
        const why = r.ok ? 'empty response (no content)' : `HTTP ${r.status}: ${r.err}`
        console.warn(`[AI-Chain] NVIDIA failed: ${why}`)
        if (forceNvidiaModel) throw new Error(`NVIDIA ${why}`)
      } catch (e: any) {
        console.warn(`[AI-Chain] NVIDIA exception: ${e.message}`)
        if (forceNvidiaModel) throw e
      }
    }
  } else if (forceNvidiaModel) {
    throw new Error('No NVIDIA API key set. Add it in Admin → AI Models.')
  }

  // 1. Fallback: Groq
  const groqKey = Deno.env.get('GROQ_API_KEY')
  if (groqKey) {
    const model = modelOverride || GROQ_MODEL_SMART
    try {
      console.log(`[AI-Chain] Attempting Groq (${model})`)
      const body: any = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }
      if (tools && tools.length > 0) body.tools = tools

      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify(body),
      })
      if (resp.ok) {
        const data = await resp.json()
        const message = data.choices?.[0]?.message
        if (message) {
          console.log(`[AI-Chain] Groq success in ${Date.now() - startTime}ms`)
          return message
        }
      } else {
        const errText = await resp.text()
        console.warn(`[AI-Chain] Groq HTTP error ${resp.status}: ${errText.slice(0, 200)}`)
      }
    } catch (e: any) {
      console.warn(`[AI-Chain] Groq exception: ${e.message}`)
    }
  }

  // 2. Attempt Secondary: OpenAI
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  if (openAiKey) {
    const model = modelOverride?.includes('vision') ? 'gpt-4o-mini' : 'gpt-4o-mini'
    try {
      console.log(`[AI-Chain] Falling back to OpenAI (${model})`)
      const body: any = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }
      if (tools && tools.length > 0) body.tools = tools

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`,
        },
        body: JSON.stringify(body),
      })
      if (resp.ok) {
        const data = await resp.json()
        const message = data.choices?.[0]?.message
        if (message) {
          console.log(`[AI-Chain] OpenAI success in ${Date.now() - startTime}ms`)
          return message
        }
      } else {
        const errText = await resp.text()
        console.warn(`[AI-Chain] OpenAI HTTP error ${resp.status}: ${errText.slice(0, 200)}`)
      }
    } catch (e: any) {
      console.warn(`[AI-Chain] OpenAI exception: ${e.message}`)
    }
  }

  // 3. Attempt Tertiary: Gemini
  const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY')
  if (geminiKey) {
    try {
      console.log('[AI-Chain] Falling back to Gemini (gemini-1.5-flash)')
      
      // Adapt messages array to Gemini contents structure
      const geminiContents = messages.map(msg => {
        let parts = []
        if (Array.isArray(msg.content)) {
          parts = msg.content.map(part => {
            if (part.type === 'text') {
              return { text: part.text }
            } else if (part.type === 'image_url' && part.image_url?.url) {
              const matches = part.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/)
              if (matches) {
                return {
                  inlineData: {
                    mimeType: matches[1],
                    data: matches[2]
                  }
                }
              }
            }
            return { text: JSON.stringify(part) }
          })
        } else {
          parts = [{ text: String(msg.content) }]
        }
        
        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts
        }
      })

      const systemInstruction = messages.find(m => m.role === 'system')?.content
      const filteredContents = geminiContents.filter(c => c.role !== 'system')

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`
      const body: any = { contents: filteredContents }
      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: String(systemInstruction) }] }
      }
      
      // Map tools to Gemini schema if provided (Gemini handles function calling as well)
      if (tools && tools.length > 0) {
        body.tools = [{
          functionDeclarations: tools.map(t => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters
          }))
        }]
      }

      body.generationConfig = {
        temperature,
        maxOutputTokens: maxTokens,
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (resp.ok) {
        const data = await resp.json()
        const candidate = data.candidates?.[0]
        const geminiContent = candidate?.content?.parts?.[0]?.text
        const functionCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall)

        if (functionCalls && functionCalls.length > 0) {
          // Map Gemini function call back to OpenAI tool_calls format
          const toolCalls = functionCalls.map((fc: any, index: number) => ({
            id: `call_${fc.functionCall.name}_${index}`,
            type: 'function',
            function: {
              name: fc.functionCall.name,
              arguments: JSON.stringify(fc.functionCall.args)
            }
          }))
          console.log(`[AI-Chain] Gemini success (tool use) in ${Date.now() - startTime}ms`)
          return {
            role: 'assistant',
            content: geminiContent || null,
            tool_calls: toolCalls
          }
        }

        if (geminiContent !== undefined) {
          console.log(`[AI-Chain] Gemini success in ${Date.now() - startTime}ms`)
          return {
            role: 'assistant',
            content: geminiContent
          }
        }
      } else {
        const errText = await resp.text()
        console.warn(`[AI-Chain] Gemini HTTP error ${resp.status}: ${errText.slice(0, 200)}`)
      }
    } catch (e: any) {
      console.warn(`[AI-Chain] Gemini exception: ${e.message}`)
    }
  }

  throw new Error('All model API endpoints in the fallback chain failed or were unconfigured.')
}

/**
 * Standard content completion call returning raw string.
 */
export async function callAiWithFallback(opts: {
  messages: Array<{ role: string; content: any }>
  temperature?: number
  maxTokens?: number
  modelOverride?: string
  forceNvidiaModel?: string
}): Promise<string> {
  const message = await callAiMessageWithFallback(opts)
  return message.content || ''
}

/**
 * Drop-in wrapper for legacy code importing callGroq.
 */
export async function callGroq(opts: {
  apiKey: string
  model?: string
  prompt: string
  temperature?: number
  maxTokens?: number
}): Promise<string> {
  return callAiWithFallback({
    messages: [{ role: 'user', content: opts.prompt }],
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    modelOverride: opts.model
  })
}
