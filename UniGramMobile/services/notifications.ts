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
