const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'

// llama-3.3-70b for complex/creative tasks, llama-3.1-8b-instant for fast/simple ones
export const GROQ_MODEL_FAST = 'llama-3.1-8b-instant'
export const GROQ_MODEL_SMART = 'llama-3.3-70b-versatile'

export async function callGroq(opts: {
  apiKey: string
  model?: string
  prompt: string
  temperature?: number
  maxTokens?: number
}): Promise<string> {
  const {
    apiKey,
    model = GROQ_MODEL_SMART,
    prompt,
    temperature = 0.7,
    maxTokens = 1024,
  } = opts

  const resp = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Groq HTTP ${resp.status}: ${errText.slice(0, 300)}`)
  }

  const result = await resp.json()
  if (result.error) throw new Error(`Groq API error: ${result.error.message}`)

  const text: string = result.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Groq returned an empty response')
  return text
}

// Strip markdown code fences that models sometimes wrap JSON in
export function stripJson(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}
