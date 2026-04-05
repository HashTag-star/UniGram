import { supabase } from '../lib/supabase';

export interface AdminReport {
  id: string;
  reporter_id: string;
  target_id: string;
  target_type: 'post' | 'reel' | 'member' | 'comment' | 'market_item';
  reason: string;
  details: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  reporter?: {
    username: string;
    avatar_url: string;
  };
  target_profile?: {
    username: string;
  };
}

export async function getReports() {
  const { data, error } = await supabase
    .from('reports')
    .select(`
      *,
      reporter:profiles!reports_reporter_id_fkey(username, avatar_url)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  
  // Flatten reporter data
  return (data || []).map(r => ({
    ...r,
    reporter: Array.isArray(r.reporter) ? r.reporter[0] : r.reporter
  })) as AdminReport[];
}

export async function updateReportStatus(reportId: string, status: 'resolved' | 'dismissed') {
  const { error } = await supabase
    .from('reports')
    .update({ status })
    .eq('id', reportId);
  if (error) throw error;
}

export async function banUser(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: true })
    .eq('id', userId);
  if (error) throw error;
}
export async function suspendUser(userId: string, suspended: boolean) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_suspended: suspended })
    .eq('id', userId);
  if (error) throw error;
}
