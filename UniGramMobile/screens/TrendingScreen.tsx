import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Dimensions, ActivityIndicator, RefreshControl, Modal,
  ScrollView, StatusBar, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '../components/CachedImage';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { QuotePostCard } from '../components/QuotePostCard';
import { CommentSheet } from '../components/CommentSheet';
import { FeedPost } from './FeedScreen';
import { getUniversityTrendingFeed } from '../services/algorithm';
import { getLikedPostIds, getSavedPostIds } from '../services/posts';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const RANK_COLORS: Record<number, string[]> = {
  1: ['#f59e0b', '#d97706'],
  2: ['#94a3b8', '#64748b'],
  3: ['#b45309', '#92400e'],
};

type TimeWindow = 1 | 6 | 24 | 48;

const TIME_PILLS: Array<{ label: string; value: TimeWindow }> = [
  { label: 'Last 1h', value: 1 },
  { label: 'Last 6h', value: 6 },
  { label: 'Last 24h', value: 24 },
  { label: 'Last 48h', value: 48 },
];

// ─── TrendingCard ─────────────────────────────────────────────────────────────

const TrendingCard: React.FC<{
  post: any;
  rank: number;
  onPress: (post: any) => void;
  colors: any;
}> = React.memo(({ post, rank, onPress, colors }) => {
  const profile = post.profiles ?? {};
  const rankColors = RANK_COLORS[rank];
  const isVideo = post.type === 'video';
  // Resolve media: prefer media_url, fall back to first item of media_urls array
  const mediaUri: string | null =
    post.media_url ?? (Array.isArray(post.media_urls) && post.media_urls.length > 0 ? post.media_urls[0] : null);
  const hasMedia = !!mediaUri;
  const multiCount = Array.isArray(post.media_urls) && post.media_urls.length > 1 ? post.media_urls.length : 0;

  const RankBadge = () =>
    rankColors ? (
      <LinearGradient colors={rankColors as [string, string]} style={styles.rankBadge}>
        <Text style={styles.rankTextGold}>#{rank}</Text>
      </LinearGradient>
    ) : (
      <View style={[styles.rankBadge, { backgroundColor: colors.bg2 }]}>
        <Text style={[styles.rankTextPlain, { color: colors.textMuted }]}>#{rank}</Text>
      </View>
    );

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.bg2, borderColor: colors.border }]}
      onPress={() => onPress(post)}
      activeOpacity={0.78}
    >
      {/* ── Media preview ── */}
      {hasMedia ? (
        <View style={styles.mediaWrap}>
          <CachedImage uri={mediaUri!} style={styles.mediaImage} />

          {/* Gradient overlay for rank + multi-count badges */}
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'transparent']}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Rank badge top-left */}
          <View style={styles.rankOverlay}>
            <RankBadge />
          </View>

          {/* Video play icon center */}
          {isVideo && (
            <View style={styles.playOverlay}>
              <View style={styles.playCircle}>
                <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 3 }} />
              </View>
            </View>
          )}

          {/* Multi-image count badge top-right */}
          {multiCount > 1 && (
            <View style={[styles.multiCountBadge, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
              <Ionicons name="images-outline" size={11} color="#fff" />
              <Text style={styles.multiCountText}>{multiCount}</Text>
            </View>
          )}
        </View>
      ) : null}

      {/* ── Text body ── */}
      <View style={[styles.cardBody, !hasMedia && styles.cardBodyNoMedia]}>
        {/* Author row — includes rank badge when no media */}
        <View style={styles.authorRow}>
          {!hasMedia && (
            <View style={styles.rankWrapInline}>
              <RankBadge />
            </View>
          )}
          {profile.avatar_url ? (
            <CachedImage uri={profile.avatar_url} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.bg }]}>
              <Ionicons name="person" size={13} color={colors.textMuted} />
            </View>
          )}
          <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
            @{profile.username ?? 'user'}
          </Text>
          {profile.is_verified && <VerifiedBadge type={profile.verification_type} />}
          <Text style={[styles.timeAgo, { color: colors.textMuted }]}>· {timeAgo(post.created_at)}</Text>
        </View>

        {/* Caption */}
        {!!post.caption && (
          <Text style={[styles.caption, { color: colors.text }]} numberOfLines={hasMedia ? 2 : 3}>
            {post.caption}
          </Text>
        )}

        {/* Quoted post embed */}
        {post.type === 'quote' && !!post.quote_post && (
          <QuotePostCard post={post.quote_post} />
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="heart" size={13} color="#ef4444" />
            <Text style={[styles.statText, { color: colors.textMuted }]}>{fmtCount(post.likes_count ?? 0)}</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="chatbubble" size={13} color={colors.accent} />
            <Text style={[styles.statText, { color: colors.textMuted }]}>{fmtCount(post.comments_count ?? 0)}</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="bookmark" size={13} color="#f59e0b" />
            <Text style={[styles.statText, { color: colors.textMuted }]}>{fmtCount(post.saves_count ?? 0)}</Text>
          </View>
          <View style={[styles.stat, styles.statTap]}>
            <Ionicons name="expand-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.statText, { color: colors.textMuted }]}>View</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── Post modal ───────────────────────────────────────────────────────────────

const PostModal: React.FC<{
  post: any;
  currentUserId: string;
  likedIds: Set<string>;
  savedIds: Set<string>;
  onClose: () => void;
  onUserPress: (profile: any) => void;
}> = ({ post, currentUserId, likedIds, savedIds, onClose, onUserPress }) => {
  const { colors } = useTheme();
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments_count ?? 0);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={[styles.modalHeader, {
          borderBottomColor: colors.border,
          paddingTop: insets.top > 0 ? insets.top : 14,
        }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
            @{post.profiles?.username ?? 'Post'}
          </Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <FeedPost
            post={{ ...post, comments_count: commentCount }}
            currentUserId={currentUserId}
            isLiked={likedIds.has(post.id)}
            isSaved={savedIds.has(post.id)}
            isMuted={true}
            isActive={true}
            setIsMuted={() => {}}
            onOpenComments={() => setShowComments(true)}
            onCommentCountChange={(_, delta) => setCommentCount((c: number) => Math.max(0, c + delta))}
            onUserPress={onUserPress}
          />
        </ScrollView>
      </View>
      <CommentSheet
        visible={showComments}
        targetId={post.id}
        targetType="post"
        currentUserId={currentUserId}
        authorId={post.user_id}
        onClose={() => setShowComments(false)}
        onCountChange={delta => setCommentCount((c: number) => Math.max(0, c + delta))}
        onCountSync={count => setCommentCount(count)}
      />
    </Modal>
  );
};

// ─── TrendingScreen ───────────────────────────────────────────────────────────

interface Props {
  userId: string;
  university: string;
  onBack: () => void;
  onUserPress: (profile: any) => void;
}

export const TrendingScreen: React.FC<Props> = ({
  userId,
  university,
  onBack,
  onUserPress,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(24);
  const [likedIds, setLikedIds] = useState(new Set<string>());
  const [savedIds, setSavedIds] = useState(new Set<string>());
  const [selectedPost, setSelectedPost] = useState<any | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [data, liked, saved] = await Promise.all([
        getUniversityTrendingFeed(university, 30, timeWindow),
        getLikedPostIds(userId).catch(() => [] as string[]),
        getSavedPostIds(userId).catch(() => [] as string[]),
      ]);
      setPosts(data);
      setLikedIds(new Set(liked));
      setSavedIds(new Set(saved));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [university, userId, timeWindow]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const handleUserPress = useCallback((profile: any) => {
    setSelectedPost(null);
    onUserPress(profile);
  }, [onUserPress]);

  const renderItem = useCallback(({ item, index }: any) => (
    <TrendingCard
      post={item}
      rank={index + 1}
      onPress={setSelectedPost}
      colors={colors}
    />
  ), [colors]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.statusBar} />

      {/* Header */}
      <View style={[styles.header, {
        paddingTop: insets.top + 8,
        borderBottomColor: colors.border,
        backgroundColor: colors.bg,
      }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Campus Trending</Text>
          {!!university && (
            <Text style={[styles.headerSub, { color: colors.textMuted }]} numberOfLines={1}>
              {university}
            </Text>
          )}
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Time window pills */}
      <View style={[styles.pillRow, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
        {TIME_PILLS.map(pill => {
          const active = pill.value === timeWindow;
          return (
            <TouchableOpacity
              key={pill.value}
              style={[
                styles.pill,
                { borderColor: active ? colors.accent : colors.border },
                active && { backgroundColor: colors.accent + '18' },
              ]}
              onPress={() => setTimeWindow(pill.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, { color: active ? colors.accent : colors.textMuted }]}>
                {pill.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="flame-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing trending yet</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Posts from {university || 'your campus'} will appear here as people engage with them.
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Ionicons name="flame" size={14} color="#ef4444" />
              <Text style={[styles.listHeaderText, { color: colors.textMuted }]}>
                {posts.length} posts ranked by engagement · tap to read
              </Text>
            </View>
          }
        />
      )}

      {/* Post modal */}
      {selectedPost && (
        <PostModal
          post={selectedPost}
          currentUserId={userId}
          likedIds={likedIds}
          savedIds={savedIds}
          onClose={() => setSelectedPost(null)}
          onUserPress={handleUserPress}
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, marginTop: 1 },

  // Pills
  pillRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 13, fontWeight: '600' },

  // States
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  listHeaderText: { fontSize: 12 },

  // Card
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },

  // Media
  mediaWrap: {
    width: '100%',
    height: 200,
    backgroundColor: '#111',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  rankOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiCountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  multiCountText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  rankBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rankTextGold: { fontSize: 13, fontWeight: '900', color: '#fff' },
  rankTextPlain: { fontSize: 13, fontWeight: '900' },
  rankWrapInline: { marginRight: 2 },

  cardBody: { paddingHorizontal: 14, paddingVertical: 11, gap: 7 },
  cardBodyNoMedia: { paddingTop: 13 },

  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' },
  avatar: { width: 24, height: 24, borderRadius: 12 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  username: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  timeAgo: { fontSize: 12, flexShrink: 0 },

  caption: { fontSize: 14, lineHeight: 19 },

  statsRow: { flexDirection: 'row', gap: 14, marginTop: 2, alignItems: 'center' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTap: { marginLeft: 'auto' as any },
  statText: { fontSize: 12, fontWeight: '600' },

  // Post modal
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalClose: { padding: 4 },
  modalTitle: { fontSize: 15, fontWeight: '700' },
});
