// Shared helpers for edge-function hardening (auth, quotas, media allowlist, bounded fetch).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS } from './groq.ts'

export const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
}

/** Validates the bearer token. Returns the user + a service client, or a ready 401 Response. */
export async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return { error: json({ error: 'Unauthorized' }, 401) }
  const supabase = adminClient()
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7))
  if (error || !user) return { error: json({ error: 'Unauthorized' }, 401) }
  return { user, supabase }
}

/** Per-user daily quota via check_ai_quota_for (migration 065). Fails closed. */
export async function withinQuota(supabase: any, userId: string, fn: string, limit: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_ai_quota_for', { p_user: userId, p_fn: fn, p_limit: limit })
  if (error) { console.error('[quota]', fn, error.message); return false }
  return data === true
}

export async function isActivePro(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('is_pro, pro_expires_at').eq('id', userId).single()
  if (!data?.is_pro) return false
  return !data.pro_expires_at || new Date(data.pro_expires_at).getTime() > Date.now()
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Hosts we are willing to fetch media from / embed in pushes: this project's storage, Cloudinary, optional CDN(s). */
export function allowedMediaHosts(): string[] {
  const hosts = new Set<string>(['res.cloudinary.com'])
  try { hosts.add(new URL(Deno.env.get('SUPABASE_URL') ?? '').host) } catch { /* ignore */ }
  for (const h of (Deno.env.get('MEDIA_CDN_HOSTS') ?? '').split(',')) {
    const t = h.trim().toLowerCase()
    if (t) hosts.add(t)
  }
  return [...hosts].filter(Boolean)
}

export function isAllowedMediaUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > 2048) return false
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && allowedMediaHosts().includes(u.host.toLowerCase())
  } catch { return false }
}

/** Fetch with a hard byte cap (rejects redirects to other hosts by re-validating the final URL). */
export async function fetchBounded(url: string, maxBytes: number): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!isAllowedMediaUrl(url)) return null
  try {
    const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) })
    if (!resp.ok || !isAllowedMediaUrl(resp.url || url)) return null
    const len = Number(resp.headers.get('content-length') ?? 0)
    if (len && len > maxBytes) return null
    const reader = resp.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) { await reader.cancel(); return null }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { bytes.set(c, off); off += c.byteLength }
    return { bytes, contentType: (resp.headers.get('content-type') ?? '').split(';')[0].trim() }
  } catch { return null }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}
