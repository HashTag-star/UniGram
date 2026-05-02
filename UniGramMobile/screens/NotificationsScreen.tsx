import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl,
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
import { NotificationSkeleton } from '../components/Skeleton';

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
  comment_id: string | null;
  actor_id: string | null;
  metadata: Record<string, any> | null;
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

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    like: 'New like',
    comment: 'New comment',
    follow: 'New follower',
    mention: 'New mention',
    repost: 'New repost',
    quote: 'New quote',
    save: 'New save',
    live_started: 'Live stream',
    live_ended: 'Stream ended',
    reel_like: 'New reel like',
    reel_comment: 'New reel comment',
    story_view: 'Story view',
    follow_suggestion: 'People you may know',
    message: 'New message',
    new_post: 'New post',
    new_story: 'New story',
    announcement: 'Announcement',
    admin_report: 'New report',
    admin_verification: 'Verification request',
    verification_approved: 'Verification approved',
    verification_rejected: 'Verification update',
    account_suspended: 'Account suspended',
    account_unsuspended: 'Account restored',
    admin_ban: 'Account action',
  };
  return map[type] ?? 'Notification';
}

function notifIcon(type: string): { name: string; color: string; bg: string } {
  switch (type) {
    case 'like':
    case 'reel_like':
      return { name: 'heart', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    case 'comment':
    case 'reel_comment':
      return { name: 'chatbubble', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
    case 'follow':
    case 'follow_suggestion':
      return { name: 'person-add', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
    case 'mention':
      return { name: 'at', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
    case 'repost':
      return { name: 'repeat', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
    case 'quote':
      return { name: 'chatbox', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' };
    case 'story_view':
      return { name: 'eye', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' };
    case 'message':
      return { name: 'mail', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' };
    case 'live_started':
    case 'live_ended':
      return { name: 'radio', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    case 'new_post':
      return { name: 'images', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' };
    case 'new_story':
      return { name: 'film', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' };
    case 'admin_verification':
    case 'verification_approved':
      return { name: 'shield-checkmark', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
    case 'admin_report':
      return { name: 'flag', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    case 'announcement':
      return { name: 'megaphone', color: '#818cf8', bg: 'rgba(129,140,248,0.15)' };
    case 'verification_rejected':
      return { name: 'shield', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    case 'account_suspended':
    case 'admin_ban':
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
  myAvatarUrl?: string | null;
}> = React.memo(({ item, onPress, isExpanded, myAvatarUrl }) => {
  const { colors } = useTheme();
  const icon = notifIcon(item.type);
  const actor = item.profiles;
  const label = typeLabel(item.type);
  const suggestionCount = item.metadata?.suggestion_ids?.length ?? 0;

  const renderAvatar = () => {
    if (item.type === 'follow') {
      // Overlapping dual avatar: recipient (mine) in back, actor (follower) in front
      return (
        <View style={styles.dualAvatarWrap}>
          {myAvatarUrl ? (
            <CachedImage uri={myAvatarUrl} style={styles.avatarBack} />
          ) : (
            <View style={[styles.avatarBack, styles.avatarPlaceholder, { backgroundColor: colors.bg2 }]}>
              <Ionicons name="person" size={13} color={colors.textMuted} />
            </View>
          )}
          {actor?.avatar_url ? (
            <CachedImage uri={actor.avatar_url} style={[styles.avatarFront, { borderColor: colors.bg }]} />
          ) : (
            <View style={[styles.avatarFront, styles.avatarPlaceholder, { backgroundColor: colors.bg2, borderColor: colors.bg }]}>
              <Ionicons name="person" size={15} color={colors.textMuted} />
            </View>
          )}
        </View>
      );
    }

    if (item.type === 'follow_suggestion') {
      // Actor avatar (first suggestion) + +N count badge
      return (
        <View style={styles.avatarWrap}>
          {actor?.avatar_url ? (
            <CachedImage uri={actor.avatar_url} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.bg2 }]}>
              <Ionicons name="people" size={18} color={colors.textMuted} />
            </View>
          )}
          {suggestionCount > 1 && (
            <View style={[styles.suggestionBadge, { backgroundColor: '#22c55e', borderColor: colors.bg }]}>
              <Text style={styles.suggestionBadgeText}>+{suggestionCount - 1}</Text>
            </View>
          )}
        </View>
      );
    }

    // Standard: single actor avatar + type icon badge
    return (
      <View style={styles.avatarWrap}>
        {actor?.avatar_url ? (
          <CachedImage uri={actor.avatar_url} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.bg2 }]}>
            <Ionicons name="person" size={18} color={colors.textMuted} />
          </View>
        )}
        <View style={[styles.iconBadge, { backgroundColor: icon.bg, borderColor: colors.bg }]}>
          <Ionicons name={icon.name as any} size={10} color={icon.color} />
        </View>
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[styles.item, !item.is_read && { backgroundColor: `${colors.accent}08` }]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      {!item.is_read && (
        <View style={[styles.unreadBar, { backgroundColor: colors.accent }]} />
      )}

      {renderAvatar()}

      <View style={styles.textWrap}>
        <View style={styles.labelRow}>
          <Text style={[styles.typeLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
          <Text style={[styles.notifTime, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
        </View>
        <Text style={[styles.notifText, { color: colors.textSub }]} numberOfLines={isExpanded ? undefined : 2}>
          {item.text}
        </Text>
      </View>

      {/* Post thumbnail */}
      {!isExpanded && item.posts?.media_url && item.type !== 'follow' && item.type !== 'follow_suggestion' && (
        <CachedImage uri={item.posts.media_url} style={styles.thumb} />
      )}
    </TouchableOpacity>
  );
});

// ─── Module-level cache (survives tab switches and re-mounts) ─────────────────

let _cachedNotifs: Notif[] = [];
let _cacheUserId = '';
let _cacheAt = 0;
const NOTIFS_TTL = 30_000;

// ─── Main Screen ──────────────────────────────────────────────────────────────

export interface NotificationsScreenProps {
  userId: string;
  myAvatarUrl?: string | null;
  onBadgeClear?: () => void;
  onBack?: () => void;
  onUserPress?: (uid: string) => void;
  onPostPress?: (pid: string, uid: string, notifType: string, commentId?: string) => void;
  onMessagePress?: (convId: string, otherProfile: any) => void;
  onDiscoverPress?: () => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  userId, myAvatarUrl, onBadgeClear, onBack,
  onUserPress, onPostPress, onMessagePress, onDiscoverPress,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const hasFreshCache = _cacheUserId === userId && _cachedNotifs.length > 0;
  const [notifs, setNotifs] = useState<Notif[]>(hasFreshCache ? _cachedNotifs : []);
  const [loading, setLoading] = useState(!hasFreshCache);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  const load = useCallback(async (forceRefresh = false) => {
    const cacheValid =
      !forceRefresh &&
      _cacheUserId === userId &&
      _cachedNotifs.length > 0 &&
      Date.now() - _cacheAt < NOTIFS_TTL;

    if (cacheValid) {
      setNotifs(_cachedNotifs);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!_cachedNotifs.length || _cacheUserId !== userId) setLoading(true);

    try {
      const data = await getNotifications(userId);
      const formatted = data.map((n: any) => ({
        ...n,
        profiles: Array.isArray(n.profiles) ? n.profiles[0] : n.profiles,
        posts: Array.isArray(n.posts) ? n.posts[0] : n.posts,
      })) as Notif[];

      _cachedNotifs = formatted;
      _cacheUserId = userId;
      _cacheAt = Date.now();

      setNotifs(formatted);
    } catch {
      // silent fail — keep whatever is already shown
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    const cacheStale =
      _cacheUserId !== userId ||
      !_cachedNotifs.length ||
      Date.now() - _cacheAt >= NOTIFS_TTL;

    if (cacheStale) {
      load();
    } else {
      const timer = setTimeout(() => load(), NOTIFS_TTL - (Date.now() - _cacheAt));
      markAllNotificationsRead(userId).then(() => onBadgeClear?.()).catch(() => {});
      return () => clearTimeout(timer);
    }

    markAllNotificationsRead(userId).then(() => onBadgeClear?.()).catch(() => {});
  }, [userId]);

  useEffect(() => {
    const channel = supabase
      .channel(`notifs-screen-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as any;
          supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', n.actor_id)
            .maybeSingle()
            .then(({ data: profile }) => {
              const newNotif: Notif = {
                ...n,
                is_read: true,
                profiles: profile,
                posts: null,
              };
              setNotifs(prev => {
                const updated = [newNotif, ...prev];
                if (_cacheUserId === userId) {
                  _cachedNotifs = updated;
                  _cacheAt = Date.now();
                }
                return updated;
              });
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

    const navigationTypes = ['follow', 'like', 'comment', 'mention', 'reel_like', 'reel_comment', 'message', 'verification_approved', 'follow_suggestion'];

    if (!navigationTypes.includes(item.type) || item.type === 'announcement') {
      setExpandedId(prev => (prev === item.id ? null : item.id));
      if (item.type === 'announcement') return;
    }

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
          onPostPress?.(item.post_id, item.actor_id, item.type, item.comment_id ?? undefined);
        }
        break;
      case 'follow_suggestion':
        onDiscoverPress?.();
        break;
      case 'message':
        if (item.actor_id && item.profiles) {
          onMessagePress?.('', item.profiles);
        }
        break;
      default:
        break;
    }
  }, [onUserPress, onPostPress, onMessagePress, onDiscoverPress]);

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
            myAvatarUrl={myAvatarUrl}
          />
        ))}
      </View>
    );
  };

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
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
        <NotificationSkeleton />
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
                  <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
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
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  markAllText: { fontSize: 13, color: '#818cf8', fontWeight: '600' },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 16,
    paddingVertical: 13,
    gap: 12,
  },

  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },

  // Standard avatar + icon badge
  avatarWrap: {
    position: 'relative',
    width: 46,
    height: 46,
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
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
  },

  // Follow dual-avatar stack (IG style)
  dualAvatarWrap: {
    width: 62,
    height: 52,
    position: 'relative',
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  avatarBack: {
    width: 34,
    height: 34,
    borderRadius: 17,
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0.55,
  },
  avatarFront: {
    width: 42,
    height: 42,
    borderRadius: 21,
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2.5,
  },

  // Follow suggestion +N badge
  suggestionBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    paddingHorizontal: 4,
  },
  suggestionBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // Text area
  textWrap: { flex: 1, gap: 2 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  typeLabel: { fontSize: 13, fontWeight: '700', flex: 1 },
  notifText: { fontSize: 13, lineHeight: 18 },
  notifTime: { fontSize: 11, flexShrink: 0 },

  thumb: {
    width: 46,
    height: 46,
    borderRadius: 8,
    flexShrink: 0,
    alignSelf: 'center',
  },

  empty: {
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
