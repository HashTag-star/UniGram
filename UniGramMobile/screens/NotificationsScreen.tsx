import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { CachedImage } from '../components/CachedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notifications';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotifActor {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface Notif {
  id: string;
  type: string;
  text: string;
  is_read: boolean;
  created_at: string;
  post_id: string | null;
  actor_id: string | null;
  profiles: NotifActor | null;
  posts: { media_url: string | null } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 604800) return `${Math.floor(d / 86400)}d`;
  return `${Math.floor(d / 604800)}w`;
}

function notifIcon(type: string): { name: string; color: string; bg: string } {
  switch (type) {
    case 'like':
      return { name: 'heart', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    case 'comment':
      return { name: 'chatbubble', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
    case 'follow':
      return { name: 'person-add', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
    case 'mention':
      return { name: 'at', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
    case 'reel_like':
      return { name: 'heart', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    case 'reel_comment':
      return { name: 'chatbubble', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
    case 'story_view':
      return { name: 'eye', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' };
    case 'message':
      return { name: 'mail', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' };
    case 'admin_verification':
      return { name: 'shield-checkmark', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
    case 'admin_report':
      return { name: 'flag', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    case 'announcement':
      return { name: 'megaphone', color: '#818cf8', bg: 'rgba(129,140,248,0.15)' };
    case 'verification_approved':
      return { name: 'shield-checkmark', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
    case 'verification_rejected':
      return { name: 'shield', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    case 'account_suspended':
      return { name: 'ban', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    case 'account_unsuspended':
      return { name: 'checkmark-circle', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
    default:
      return { name: 'notifications', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' };
  }
}

// ─── Notification Item ────────────────────────────────────────────────────────

const NotifItem: React.FC<{
  item: Notif;
  onPress: (item: Notif) => void;
  isExpanded?: boolean;
}> = React.memo(({ item, onPress, isExpanded }) => {
  const { colors } = useTheme();
  const icon = notifIcon(item.type);
  const actor = item.profiles;

  return (
    <TouchableOpacity
      style={[styles.item, !item.is_read && styles.itemUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      {/* Avatar + icon badge */}
      <View style={styles.avatarWrap}>
        {actor?.avatar_url ? (
          <CachedImage uri={actor.avatar_url} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={18} color="rgba(255,255,255,0.3)" />
          </View>
        )}
        <View style={[styles.iconBadge, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name as any} size={10} color={icon.color} />
        </View>
      </View>

      {/* Text */}
      <View style={styles.textWrap}>
        <Text style={[styles.notifText, { color: colors.textSub }]} numberOfLines={isExpanded ? undefined : 2}>
          {actor?.username && (
            <Text style={[styles.actorName, { color: colors.text }]}>@{actor.username} </Text>
          )}
          {item.text}
        </Text>
        <Text style={[styles.notifTime, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
      </View>

      {/* Post thumbnail (hide if expanding text to give more room) */}
      {!isExpanded && item.posts?.media_url ? (
        <CachedImage uri={item.posts.media_url} style={styles.thumb} />
      ) : (
        <View style={{ width: 0 }} />
      )}

      {/* Unread dot */}
      {!item.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export interface NotificationsScreenProps {
  userId: string;
  onBadgeClear?: () => void;
  onBack?: () => void;
  onUserPress?: (uid: string) => void;
  onPostPress?: (pid: string, uid: string) => void;
  onMessagePress?: (convId: string, otherProfile: any) => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ 
  userId, onBadgeClear, onBack,
  onUserPress, onPostPress, onMessagePress
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await getNotifications(userId);
      const formatted = data.map((n: any) => ({
        ...n,
        profiles: Array.isArray(n.profiles) ? n.profiles[0] : n.profiles,
        posts: Array.isArray(n.posts) ? n.posts[0] : n.posts,
      }));
      setNotifs(formatted as Notif[]);
    } catch (e) {
      // silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  // Mark all read when screen opens
  useEffect(() => {
    load();
    markAllNotificationsRead(userId)
      .then(() => onBadgeClear?.())
      .catch(() => {});
  }, [userId]);

  // Realtime subscription for new notifications
  useEffect(() => {
    const channel = supabase
      .channel(`notifs-screen-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as any;
          // Fetch actor profile for the new notification
          supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', n.actor_id)
            .maybeSingle()
            .then(({ data: profile }) => {
              const newNotif: Notif = {
                ...n,
                is_read: true, // auto-mark read since screen is open
                profiles: profile,
                posts: null,
              };
              setNotifs(prev => [newNotif, ...prev]);
            });
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const handlePress = useCallback((item: Notif) => {
    if (!item.is_read) {
      markNotificationRead(item.id).catch(() => {});
      setNotifs(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
    }

    const navigationTypes = ['follow', 'like', 'comment', 'mention', 'reel_like', 'reel_comment', 'message', 'verification_approved'];

    if (!navigationTypes.includes(item.type) || item.type === 'announcement') {
      setExpandedId(prev => (prev === item.id ? null : item.id));
      if (item.type === 'announcement') return; // Announcements only expand
    }

    // Navigation logic
    switch (item.type) {
      case 'follow':
      case 'verification_approved':
        if (item.actor_id) onUserPress?.(item.actor_id);
        break;
      case 'like':
      case 'comment':
      case 'mention':
      case 'reel_like':
      case 'reel_comment':
        if (item.post_id && item.actor_id) {
          onPostPress?.(item.post_id, item.actor_id);
        }
        break;
      case 'message':
        if (item.actor_id && item.profiles) {
          onMessagePress?.('', item.profiles);
        }
        break;
      default:
        // Already handled expansion for unknowns
        break;
    }
  }, [onUserPress, onPostPress, onMessagePress]);

  const sections = React.useMemo(() => {
    const today: Notif[] = [];
    const thisWeek: Notif[] = [];
    const earlier: Notif[] = [];
    const now = Date.now();
    notifs.forEach(n => {
      const age = (now - new Date(n.created_at).getTime()) / 1000;
      if (age < 86400) today.push(n);
      else if (age < 604800) thisWeek.push(n);
      else earlier.push(n);
    });
    return { today, thisWeek, earlier };
  }, [notifs]);

  const renderSection = (title: string, data: Notif[]) => {
    if (!data.length) return null;
    return (
      <View key={title}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{title}</Text>
        {data.map(item => (
          <NotifItem 
            key={item.id} 
            item={item} 
            onPress={handlePress} 
            isExpanded={expandedId === item.id}
          />
        ))}
      </View>
    );
  };

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {onBack ? (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity
            onPress={() => {
              markAllNotificationsRead(userId).catch(() => {});
              setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
              onBadgeClear?.();
            }}
          >
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#6366f1" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={[1]}
          keyExtractor={() => 'sections'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor="#6366f1"
            />
          }
          renderItem={() => (
            <View>
              {notifs.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="notifications-off-outline" size={48} color="rgba(255,255,255,0.1)" />
                  <Text style={styles.emptyTitle}>No notifications yet</Text>
                  <Text style={styles.emptySubtitle}>
                    When people like, comment, or follow you, you'll see it here.
                  </Text>
                </View>
              ) : (
                <>
                  {renderSection('Today', sections.today)}
                  {renderSection('This Week', sections.thisWeek)}
                  {renderSection('Earlier', sections.earlier)}
                  <View style={{ height: 100 }} />
                </>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  markAllText: {
    fontSize: 13,
    color: '#818cf8',
    fontWeight: '600',
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  itemUnread: {
    backgroundColor: 'rgba(99,102,241,0.05)',
  },

  avatarWrap: { position: 'relative', width: 46, height: 46 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#000',
  },

  textWrap: { flex: 1 },
  notifText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 19 },
  actorName: { fontWeight: '700', color: '#fff' },
  notifTime: { fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 3 },

  thumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  unreadDot: {
    position: 'absolute',
    left: 4,
    top: '50%',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#818cf8',
    marginTop: -3,
  },

  empty: {
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
