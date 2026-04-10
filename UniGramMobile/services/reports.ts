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

/**
 * Creates a new report for content or a member.
 */
export async function createReport(
  targetId: string,
  targetType: AdminReport['target_type'],
  reason: string,
  details: string = ''
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to report content.');

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    target_id: targetId,
    target_type: targetType,
    reason,
    details,
    status: 'pending'
  });

  if (error) throw error;
}

/**
 * Checks if a piece of content should be "soft-hidden" based on report count.
 * Default threshold is 5 reports.
 */
export async function shouldHideContent(targetId: string) {
  const { count, error } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('target_id', targetId)
    .eq('status', 'pending');

  if (error) return false;
  return (count || 0) >= 5;
}

/**
 * Deletes the content associated with a report.
 */
export async function deleteReportedContent(targetId: string, targetType: AdminReport['target_type']) {
  let table = '';
  switch (targetType) {
    case 'post': table = 'posts'; break;
    case 'reel': table = 'reels'; break;
    case 'comment': table = 'comments'; break;
    case 'market_item': table = 'market_items'; break;
    default: throw new Error(`Cannot delete content of type ${targetType}`);
  }

  const { error } = await supabase.from(table).delete().eq('id', targetId);
  if (error) throw error;
}

/**
 * Finds the author ID of a reported piece of content.
 */
export async function getAuthorIdForReport(targetId: string, targetType: AdminReport['target_type']): Promise<string | null> {
  if (targetType === 'member') return targetId;

  let table = '';
  switch (targetType) {
    case 'post': table = 'posts'; break;
    case 'reel': table = 'reels'; break;
    case 'comment': table = 'comments'; break;
    case 'market_item': table = 'market_items'; break;
    default: return null;
  }

  const { data, error } = await supabase
    .from(table)
    .select('user_id')
    .eq('id', targetId)
    .maybeSingle();

  if (error || !data) return null;
  return data.user_id;
}
