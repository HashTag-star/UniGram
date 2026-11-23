import { supabase } from '../lib/supabase';

/**
 * Follow requests for private accounts. Backed by `follow_requests`
 * (requester_id, target_id, status 'pending'|'approved'|'denied'). Reads degrade
 * gracefully (empty / false) when the table is missing; writes throw so the UI can toast.
 */
async function me(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return user.id;
}

export async function sendRequest(targetId: string): Promise<void> {
  const uid = await me();
  const { error } = await supabase.from('follow_requests')
    .upsert({ requester_id: uid, target_id: targetId, status: 'pending' }, { onConflict: 'requester_id,target_id' });
  if (error) throw error;
}

export async function cancelRequest(targetId: string): Promise<void> {
  const uid = await me();
  const { error } = await supabase.from('follow_requests').delete().eq('requester_id', uid).eq('target_id', targetId);
  if (error) throw error;
}

export async function hasPendingRequest(targetId: string): Promise<boolean> {
  try {
    const uid = await me();
    const { data, error } = await supabase.from('follow_requests').select('requester_id')
      .eq('requester_id', uid).eq('target_id', targetId).eq('status', 'pending').maybeSingle();
    if (error) return false;
    return !!data;
  } catch { return false; }
}

export interface IncomingRequest {
  requester_id: string;
  created_at: string;
  profile: { id: string; username: string; full_name?: string | null; avatar_url?: string | null } | null;
}

export async function listIncoming(): Promise<IncomingRequest[]> {
  try {
    const uid = await me();
    const { data: rows, error } = await supabase.from('follow_requests')
      .select('requester_id, created_at').eq('target_id', uid).eq('status', 'pending').order('created_at', { ascending: false });
    if (error || !rows?.length) return [];
    const { data: profs } = await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', rows.map((r: any) => r.requester_id));
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return rows.map((r: any) => ({ ...r, profile: (map.get(r.requester_id) as any) ?? null }));
  } catch { return []; }
}

export async function countIncoming(): Promise<number> {
  try {
    const uid = await me();
    const { count, error } = await supabase.from('follow_requests').select('requester_id', { count: 'exact', head: true })
      .eq('target_id', uid).eq('status', 'pending');
    if (error) return 0;
    return count ?? 0;
  } catch { return 0; }
}

/** Approve: prefers the `approve_follow_request` RPC (atomic); falls back to client-side inserts. */
export async function approve(requesterId: string): Promise<void> {
  const uid = await me();
  const rpc = await supabase.rpc('approve_follow_request', { p_requester: requesterId });
  if (!rpc.error) return;
  const { error: fErr } = await supabase.from('follows').insert({ follower_id: requesterId, following_id: uid });
  if (fErr && !/duplicate|already exists/i.test(fErr.message)) throw fErr;
  const { error } = await supabase.from('follow_requests').update({ status: 'approved' }).eq('requester_id', requesterId).eq('target_id', uid);
  if (error) throw error;
}

export async function deny(requesterId: string): Promise<void> {
  const uid = await me();
  const { error } = await supabase.from('follow_requests').update({ status: 'denied' }).eq('requester_id', requesterId).eq('target_id', uid);
  if (error) throw error;
}
