import { supabase } from '../lib/supabase';

export async function getNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select(`*, profiles!notifications_actor_id_fkey(*), posts(media_url)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(notificationId: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
}

export async function markAllNotificationsRead(userId: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
}

export async function createNotification(notification: {
  user_id: string;
  actor_id: string;
  type: string;
  post_id?: string;
  text: string;
}) {
  await supabase.from('notifications').insert(notification);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  return count ?? 0;
}

/** Admin sends a notification to one user or all users */
export async function sendAdminNotification(
  adminId: string,
  message: string,
  type: 'announcement' | 'verification_approved' | 'verification_rejected',
  targetUserId?: string,  // undefined = broadcast to all
) {
  if (targetUserId) {
    await supabase.from('notifications').insert({
      user_id: targetUserId,
      actor_id: adminId,
      type,
      text: message,
      is_read: false,
    });
  } else {
    // Broadcast: fetch all user IDs and insert in batch
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .neq('id', adminId)
      .limit(5000);
    if (!users?.length) return;
    const rows = users.map((u: any) => ({
      user_id: u.id,
      actor_id: adminId,
      type,
      text: message,
      is_read: false,
    }));
    // Insert in chunks of 500 to stay within Supabase limits
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('notifications').insert(rows.slice(i, i + 500));
    }
  }
}
