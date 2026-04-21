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

export async function getActiveCallForUser(userId: string): Promise<CallRecord | null> {
  const { data } = await supabase
    .from('calls')
    .select('*, caller_profile:profiles!calls_caller_id_fkey(id, username, full_name, avatar_url)')
    .eq('callee_id', userId)
    .eq('status', 'ringing')
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
        if (data) onIncoming(data as CallRecord);
      },
    )
    .subscribe();
}
