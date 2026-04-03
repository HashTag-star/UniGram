import { supabase } from '../lib/supabase';

export async function submitVerificationRequest(
  userId: string, 
  type: string, 
  fullName: string, 
  email: string, 
  reason: string, 
  documentUrl: string
) {
  // Check for existing pending request
  const { data: existing } = await supabase
    .from('verification_requests')
    .select('id, status')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .single();
  if (existing) throw new Error('You already have a pending verification request.');

  const { data, error } = await supabase
    .from('verification_requests')
    .insert({ 
      user_id: userId, 
      type, 
      full_name: fullName, 
      email, 
      reason, 
      document_url: documentUrl 
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPendingVerificationRequests() {
  const { data, error } = await supabase
    .from('verification_requests')
    .select('*, profiles(username, avatar_url)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getVerificationStatus(userId: string) {
  const { data } = await supabase
    .from('verification_requests')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}
