import { supabase } from '../lib/supabase';

export interface Confession {
  id: string;
  body: string;
  university: string | null;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  mine: boolean;
}

export type ConfessionsResult = { items: Confession[]; unavailable: boolean };

// Lightweight client-side keyword filter (server moderation is the source of truth).
const BLOCKED = [
  /\bkill (yourself|him|her|them)\b/i, /\bkys\b/i, /\bn[i1]gg(er|a)s?\b/i, /\bf[a4]gg?ots?\b/i,
  /\brape\b/i, /\bsuicide\b/i, /\bnudes?\b/i, /\bwhatsapp\s*\+?\d{6,}/i, /\b0\d{9}\b/,
];
export function moderateConfession(text: string): string | null {
  const t = text.trim();
  if (t.length < 5) return 'Write a little more.';
  if (t.length > 500) return 'Keep it under 500 characters.';
  if (BLOCKED.some(r => r.test(t))) return 'That looks like it breaks the community rules (hate, threats, self-harm or personal numbers).';
  return null;
}

export async function getConfessions(university?: string | null): Promise<ConfessionsResult> {
  const { data: { user } } = await supabase.auth.getUser();
  let q = supabase.from('confessions').select('id, body, university, created_at, author_id').order('created_at', { ascending: false }).limit(60);
  if (university) q = q.or(`university.eq.${university.replace(/[,()]/g, ' ')},university.is.null`);
  const { data, error } = await q;
  if (error) return { items: [], unavailable: true };
  const rows = data ?? [];
  if (!rows.length) return { items: [], unavailable: false };
  const { data: likes } = await supabase.from('confession_likes').select('confession_id, user_id').in('confession_id', rows.map((r: any) => r.id));
  return {
    unavailable: false,
    items: rows.map((r: any) => {
      const ls = (likes ?? []).filter((l: any) => l.confession_id === r.id);
      return {
        id: r.id, body: r.body, university: r.university, created_at: r.created_at,
        like_count: ls.length, liked_by_me: ls.some((l: any) => l.user_id === user?.id), mine: r.author_id === user?.id,
      };
    }),
  };
}

export async function postConfession(body: string, university?: string | null): Promise<void> {
  const problem = moderateConfession(body);
  if (problem) throw new Error(problem);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  // author_id is stored for moderation only; RLS must never expose it to other users (see SQL).
  const { error } = await supabase.from('confessions').insert({ author_id: user.id, body: body.trim(), university: university ?? null });
  if (error) throw error;
}

export async function toggleLike(confessionId: string, liked: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  if (liked) {
    const { error } = await supabase.from('confession_likes').delete().eq('confession_id', confessionId).eq('user_id', user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('confession_likes').insert({ confession_id: confessionId, user_id: user.id });
    if (error && !/duplicate/i.test(error.message)) throw error;
  }
}

export async function deleteConfession(id: string): Promise<void> {
  const { error } = await supabase.from('confessions').delete().eq('id', id);
  if (error) throw error;
}
