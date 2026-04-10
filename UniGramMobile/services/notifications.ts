import { supabase } from '../lib/supabase';
import { sendPushToUser } from './pushNotifications';

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

const PUSH_TITLES: Record<string, string> = {
  verification_approved: 'Verification Approved',
  verification_rejected: 'Verification Update',
  announcement: 'Announcement',
  account_suspended: 'Account Suspended',
  account_unsuspended: 'Account Restored',
};

/** Admin sends a notification to one user or all users */
export async function sendAdminNotification(
  adminId: string,
  message: string,
  type: 'announcement' | 'verification_approved' | 'verification_rejected' | 'account_suspended' | 'account_unsuspended',
  targetUserId?: string,  // undefined = broadcast to all
) {
  if (targetUserId) {
    const { error } = await supabase.from('notifications').insert({
      user_id: targetUserId,
      actor_id: adminId,
      type,
      text: message,
      is_read: false,
    });
    if (error) throw error;

    // Send device push notification
    const pushTitle = PUSH_TITLES[type] ?? 'UniGram';
    sendPushToUser(targetUserId, pushTitle, message, { type }).catch(() => {});

  } else {
    // Broadcast: fetch all user IDs (including the admin so they can verify delivery)
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .limit(5000);
    if (!users?.length) return;

    const rows = users.map((u: any) => ({
      user_id: u.id,
      actor_id: adminId,
      type,
      text: message,
      is_read: false,
    }));

    // Insert in chunks of 500
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('notifications').insert(rows.slice(i, i + 500));
      if (error) throw error;
    }

    // Push to all (best-effort, no await to avoid blocking)
    users.forEach((u: any) => {
      sendPushToUser(u.id, PUSH_TITLES[type] ?? 'UniGram', message, { type }).catch(() => {});
    });
  }
}
