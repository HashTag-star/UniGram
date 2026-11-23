import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export type CallType = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined' | 'missed' | 'busy';

export interface CallRecord {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  type: CallType;
  status: CallStatus;
  offer: RTCSessionDescriptionInit | null;
  answer: RTCSessionDescriptionInit | null;
  created_at: string;
  ended_at: string | null;
  caller_profile?: any;
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

export async function initiateCall(
  callerId: string,
  calleeId: string,
  conversationId: string,
  type: CallType,
  offer: RTCSessionDescriptionInit,
): Promise<CallRecord> {
  const { data, error } = await supabase
    .from('calls')
    .insert({ caller_id: callerId, callee_id: calleeId, conversation_id: conversationId, type, offer, status: 'ringing' })
    .select('*, caller_profile:profiles!calls_caller_id_fkey(id, username, full_name, avatar_url)')
    .single();
  if (error) throw error;
  return data as CallRecord;
}

/** Caller publishes its real SDP offer once the peer connection has created it. */
export async function updateCallOffer(callId: string, offer: RTCSessionDescriptionInit): Promise<void> {
  const { error } = await supabase.from('calls').update({ offer }).eq('id', callId);
  if (error) throw error;
}

/** Latest copy of a call row (the offer may have been filled in after the INSERT). */
export async function getCall(callId: string): Promise<CallRecord | null> {
  const { data } = await supabase
    .from('calls')
    .select('*, caller_profile:profiles!calls_caller_id_fkey(id, username, full_name, avatar_url)')
    .eq('id', callId)
    .maybeSingle();
  return (data as CallRecord) ?? null;
}

export async function answerCall(callId: string, answer: RTCSessionDescriptionInit): Promise<void> {
  const { error } = await supabase
    .from('calls')
    .update({ status: 'active', answer })
    .eq('id', callId);
  if (error) throw error;
}

export async function declineCall(callId: string): Promise<void> {
  const { error } = await supabase
    .from('calls')
    .update({ status: 'declined', ended_at: new Date().toISOString() })
    .eq('id', callId);
  if (error) throw error;
}

export async function endCall(callId: string): Promise<void> {
  const { error } = await supabase
    .from('calls')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', callId);
  if (error) throw error;
}

export async function sendIceCandidate(
  callId: string,
  senderId: string,
  candidate: RTCIceCandidateInit,
): Promise<void> {
  await supabase
    .from('call_ice_candidates')
    .insert({ call_id: callId, sender_id: senderId, candidate })
    .then(({ error }) => { if (error) console.warn('ICE insert error:', error.message); });
}

/** A ringing call older than this is considered missed / stale. */
export const RING_WINDOW_MS = 60_000;

/** True when the call is still ringing and was created within the ring window. */
export function isFreshRingingCall(call: Pick<CallRecord, 'status' | 'created_at'> | null | undefined): boolean {
  if (!call || call.status !== 'ringing') return false;
  const age = Date.now() - new Date(call.created_at).getTime();
  return age >= -5_000 && age < RING_WINDOW_MS;
}

/** ICE candidates the other side already sent (needed when subscribing late). */
export async function getExistingIceCandidates(callId: string, myUserId: string): Promise<RTCIceCandidateInit[]> {
  const { data } = await supabase
    .from('call_ice_candidates')
    .select('candidate, sender_id')
    .eq('call_id', callId)
    .neq('sender_id', myUserId)
    .order('created_at', { ascending: true });
  return (data ?? []).map((r: any) => r.candidate as RTCIceCandidateInit);
}

export async function getActiveCallForUser(userId: string): Promise<CallRecord | null> {
  const { data } = await supabase
    .from('calls')
    .select('*, caller_profile:profiles!calls_caller_id_fkey(id, username, full_name, avatar_url)')
    .eq('callee_id', userId)
    .eq('status', 'ringing')
    // A call nobody answered stays 'ringing' forever; only recent ones are real.
    .gte('created_at', new Date(Date.now() - RING_WINDOW_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as CallRecord | null;
}

// ─── Realtime ──────────────────────────────────────────────────────────────────

export function subscribeToCall(
  callId: string,
  onUpdate: (call: CallRecord) => void,
): RealtimeChannel {
  return supabase
    .channel(`call:${callId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
      (payload) => onUpdate(payload.new as CallRecord),
    )
    .subscribe();
}

export function subscribeToIceCandidates(
  callId: string,
  myUserId: string,
  onCandidate: (candidate: RTCIceCandidateInit) => void,
): RealtimeChannel {
  return supabase
    .channel(`ice:${callId}:${myUserId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_ice_candidates', filter: `call_id=eq.${callId}` },
      (payload) => {
        if (payload.new.sender_id !== myUserId) {
          onCandidate(payload.new.candidate as RTCIceCandidateInit);
        }
      },
    )
    .subscribe();
}

export function subscribeToIncomingCalls(
  userId: string,
  onIncoming: (call: CallRecord) => void,
): RealtimeChannel {
  return supabase
    .channel(`incoming-calls:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${userId}` },
      async (payload) => {
        const { data } = await supabase
          .from('calls')
          .select('*, caller_profile:profiles!calls_caller_id_fkey(id, username, full_name, avatar_url)')
          .eq('id', payload.new.id)
          .single();
        if (data && isFreshRingingCall(data as CallRecord)) onIncoming(data as CallRecord);
      },
    )
    .subscribe();
}
