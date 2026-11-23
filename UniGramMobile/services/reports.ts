import { supabase } from '../lib/supabase';
import { assertUuid, cleanUserText, requireText } from '../lib/contentSafety';

export interface AdminReport {
  id: string;
  reporter_id: string;
  target_id: string;
  target_type: 'post' | 'reel' | 'member' | 'comment' | 'market_item';
  // NOTE: people are stored as 'member' (what the admin UI reads). 'user' is accepted as an alias on write.
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

export async function getReports(limit = 200, offset = 0) {
  const { data, error } = await supabase
    .from('reports')
    .select(`
      id, reporter_id, target_id, target_type, reason, details, status, created_at,
      reporter:profiles!reports_reporter_id_fkey(username, avatar_url)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  // Flatten reporter data
  return (data || []).map((r: any) => ({
    ...r,
    reporter: Array.isArray(r.reporter) ? r.reporter[0] : r.reporter
  })) as AdminReport[];
}

export async function updateReportStatus(reportId: string, status: 'resolved' | 'dismissed') {
  assertUuid(reportId, 'Report ID');
  const { error } = await supabase
    .from('reports')
    .update({ status })
    .eq('id', reportId);
  if (error) throw error;
}

export async function banUser(userId: string) {
  assertUuid(userId, 'User ID');
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: true })
    .eq('id', userId);
  if (error) throw error;
}
export async function suspendUser(userId: string, suspended: boolean) {
  assertUuid(userId, 'User ID');
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
  targetType: AdminReport['target_type'] | 'user',
  reason: string,
  details: string = ''
) {
  const normalizedType: AdminReport['target_type'] = targetType === 'user' ? 'member' : targetType;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to report content.');
  assertUuid(targetId, 'Target ID');
  const safeReason = requireText(cleanUserText(reason, 'reportReason'), 'Report reason');
  const safeDetails = cleanUserText(details, 'reportDetails');

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    target_id: targetId,
    target_type: normalizedType,
    reason: safeReason,
    details: safeDetails,
    status: 'pending'
  });

  if (error) throw error;

  // Notify all admins about the new report (fire-and-forget)
  const { notifyAdmins } = require('./notifications');
  notifyAdmins({
    type: 'admin_report',
    text: `reported ${normalizedType} content: "${safeReason}"`,
    actorId: user.id,
    postId: normalizedType === 'post' ? targetId : undefined,
  }).catch(() => {});
}

/**
 * Checks if a piece of content should be "soft-hidden" based on report count.
 * Default threshold is 5 reports.
 */
export async function shouldHideContent(targetId: string) {
  assertUuid(targetId, 'Target ID');
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
  assertUuid(targetId, 'Target ID');
  if (targetType === 'comment') {
    // There is no generic 'comments' table: a reported comment is a post comment or a reel comment.
    for (const table of ['post_comments', 'reel_comments']) {
      const { data, error } = await supabase.from(table).delete().eq('id', targetId).select('id');
      if (error) throw error;
      if (data?.length) return;
    }
    throw new Error('That comment no longer exists.');
  }
  let table = '';
  switch (targetType) {
    case 'post': table = 'posts'; break;
    case 'reel': table = 'reels'; break;
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
  assertUuid(targetId, 'Target ID');
  if (targetType === 'member') return targetId;

  const tables: string[] =
    targetType === 'post' ? ['posts'] :
    targetType === 'reel' ? ['reels'] :
    targetType === 'comment' ? ['post_comments', 'reel_comments'] :
    targetType === 'market_item' ? ['market_items'] : [];
  const col = targetType === 'market_item' ? 'seller_id' : 'user_id';

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select(col)
      .eq('id', targetId)
      .maybeSingle();
    if (error) throw error;
    if (data) return (data as any)[col] ?? null;
  }
  return null;
}
