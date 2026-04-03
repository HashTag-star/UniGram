import { supabase } from '../lib/supabase';

export async function saveUserInterests(userId: string, interests: string[]) {
  // Delete old interests
  await supabase.from('user_interests').delete().eq('user_id', userId);
  if (interests.length === 0) return;
  const rows = interests.map(interest => ({ user_id: userId, interest }));
  const { error } = await supabase.from('user_interests').insert(rows);
  if (error) throw error;
}

export async function getUserInterests(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('user_interests')
    .select('interest')
    .eq('user_id', userId);
  return data?.map((r: any) => r.interest) ?? [];
}

export async function completeOnboarding(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', userId);
  if (error) throw error;
}

export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', userId)
    .single();
  return data?.onboarding_completed ?? false;
}

export async function getSuggestedUsers(userId: string, limit = 10): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_suggested_users', {
    p_user_id: userId,
    p_limit: limit,
  });
  if (error) throw error;
  return data ?? [];
}

export async function updateProfileSetup(userId: string, updates: {
  university?: string;
  major?: string;
  year?: string;
  bio?: string;
  pronouns?: string;
}) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  if (error) throw error;
}
