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
      style={[styles.item, !item.is_read && { backgroundColor: `${colors.accent}08` }]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      {/* Unread accent bar on the left edge */}
      {!item.is_read && (
        <View style={[styles.unreadBar, { backgroundColor: colors.accent }]} />
      )}

      {/* Avatar + icon badge */}
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

      {/* Text — takes all remaining space */}
      <View style={styles.textWrap}>
        <Text style={[styles.notifText, { color: colors.textSub }]} numberOfLines={isExpanded ? undefined : 2}>
          {actor?.username && (
            <Text style={[styles.actorName, { color: colors.text }]}>@{actor.username} </Text>
          )}
          {item.text}
        </Text>
        <Text style={[styles.notifTime, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
      </View>

      {/* Post thumbnail — only when not expanded */}
      {!isExpanded && item.posts?.media_url && (
        <CachedImage uri={item.posts.media_url} style={styles.thumb} />
      )}
    </TouchableOpacity>
  );
});

// ─── Module-level cache (survives tab switches and re-mounts) ─────────────────

let _cachedNotifs: Notif[] = [];
let _cacheUserId = '';
let _cacheAt = 0;
const NOTIFS_TTL = 30_000; // 30 s — background refresh after this

// ─── Main Screen ──────────────────────────────────────────────────────────────

export interface NotificationsScreenProps {
  userId: string;
  onBadgeClear?: () => void;
  onBack?: () => void;
  onUserPress?: (uid: string) => void;
  onPostPress?: (pid: string, uid: string, notifType: string) => void;
  onMessagePress?: (convId: string, otherProfile: any) => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ 
  userId, onBadgeClear, onBack,
  onUserPress, onPostPress, onMessagePress
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Seed state from cache immediately so the screen feels instant on revisit
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

    // If we have a valid fresh cache, show it immediately and bail
    if (cacheValid) {
      setNotifs(_cachedNotifs);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Only show full skeleton when there's no cached data at all
    if (!_cachedNotifs.length || _cacheUserId !== userId) setLoading(true);

    try {
      const data = await getNotifications(userId);
      const formatted = data.map((n: any) => ({
        ...n,
        profiles: Array.isArray(n.profiles) ? n.profiles[0] : n.profiles,
        posts: Array.isArray(n.posts) ? n.posts[0] : n.posts,
      })) as Notif[];

      // Update module-level cache
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

  // Mark all read when screen opens; background-refresh if cache is stale
  useEffect(() => {
    const cacheStale =
      _cacheUserId !== userId ||
      !_cachedNotifs.length ||
      Date.now() - _cacheAt >= NOTIFS_TTL;

    if (cacheStale) {
      load();
    } else {
      // Cache is fresh — data already in state, just schedule a quiet refresh
      const timer = setTimeout(() => load(), NOTIFS_TTL - (Date.now() - _cacheAt));
      markAllNotificationsRead(userId)
        .then(() => onBadgeClear?.())
        .catch(() => {});
      return () => clearTimeout(timer);
    }

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
              setNotifs(prev => {
                const updated = [newNotif, ...prev];
                // Keep cache in sync with live updates
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
          onPostPress?.(item.post_id, item.actor_id, item.type);
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
        <NotificationSkeleton />
      ) : (
        <FlatList
          data={[1]}
          keyExtractor={() => 'sections'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true /* forceRefresh */); }}
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
    paddingLeft: 20,   // wider left pad so content clears the 3px unread bar
    paddingRight: 16,
    paddingVertical: 13,
    gap: 12,
  },

  // Left-edge accent strip shown on unread items
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 0,
  },

  avatarWrap: {
    position: 'relative',
    width: 46,
    height: 46,
    flexShrink: 0,
    alignSelf: 'flex-start',  // anchor to top of row so avatar top = first text line
    marginTop: 1,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
  },

  textWrap: {
    flex: 1,
    gap: 4,
  },
  notifText: { fontSize: 14, lineHeight: 20 },
  actorName: { fontWeight: '700' },
  notifTime: { fontSize: 12 },

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
