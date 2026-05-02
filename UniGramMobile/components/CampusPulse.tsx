import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Dimensions, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { CachedImage } from './CachedImage';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');
const CARD_W = width * 0.42;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcVelocity(post: any): number {
  const ageMs = Date.now() - new Date(post.created_at).getTime();
  const h = ageMs / (1000 * 60 * 60);
  const recency = h < 1 ? 60 : h < 3 ? 30 : h < 6 ? 15 : h < 12 ? 5 : 0;
  return (post.likes_count ?? 0) * 2 + (post.comments_count ?? 0) * 5 + recency;
}

function fmtCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function extractHashtags(posts: any[]): string[] {
  const counts: Record<string, number> = {};
  for (const p of posts) {
    const matches = (p.caption ?? '').match(/#[\wÀ-ž]+/g) ?? [];
    for (const tag of matches) {
      const t = tag.toLowerCase();
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([tag]) => tag);
}

// ─── LiveCard ─────────────────────────────────────────────────────────────────

const LiveCard: React.FC<{
  session: any;
  colors: any;
  onPress: () => void;
}> = React.memo(({ session, colors, onPress }) => {
  const ringPulse = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1.12, duration: 800, useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 0.85, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ringPulse]);

  const profile = session.profiles ?? {};

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: '#180808', borderColor: '#ef4444', borderWidth: 1.5 }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Avatar area */}
      <View style={[styles.imageWrap, styles.liveImageWrap]}>
        <Animated.View style={[styles.liveRing, { transform: [{ scale: ringPulse }] }]} />
        <CachedImage
          uri={profile.avatar_url}
          style={styles.liveAvatar}
          priority="high"
          recyclingKey={session.id}
        />
        {/* LIVE badge top-left */}
        <View style={[styles.rankBadge, { backgroundColor: '#ef4444' }]}>
          <Text style={[styles.rankText, { color: '#fff' }]}>LIVE</Text>
        </View>
        {/* Viewer count top-right */}
        <View style={[styles.tagBadge, styles.viewerBadge]}>
          <Ionicons name="eye" size={9} color="#fff" />
          <Text style={styles.viewerText}>{fmtCount(session.viewer_count ?? 0)}</Text>
        </View>
      </View>

      {/* Meta */}
      <View style={[styles.cardMeta, { borderTopColor: '#ef444433' }]}>
        <Text style={[styles.cardUser, { color: '#fff' }]} numberOfLines={1}>
          @{profile.username ?? 'user'}
        </Text>
        <Text style={[styles.cardCaption, { color: '#ef9999' }]} numberOfLines={1}>
          {session.title || 'Live now'}
        </Text>
        <View style={styles.statsRow}>
          <View style={[styles.velocityPill, { backgroundColor: '#ef444422' }]}>
            <View style={styles.liveDot} />
            <Text style={[styles.velocityText, { color: '#ef4444' }]}>Join Live</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── PulseCard ────────────────────────────────────────────────────────────────

const RANK_COLORS: Record<number, string> = { 1: '#f59e0b', 2: '#94a3b8', 3: '#b45309' };

const PulseCard: React.FC<{
  post: any;
  rank: number;
  colors: any;
  onPress: () => void;
}> = React.memo(({ post, rank, colors, onPress }) => {
  const entry = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entry, {
      toValue: 1,
      delay: rank * 55,
      tension: 70,
      friction: 9,
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isHot = (post.velocity ?? 0) > 50;
  const isNew = (Date.now() - new Date(post.created_at).getTime()) < 3 * 60 * 60 * 1000;

  return (
    <Animated.View style={{
      opacity: entry,
      transform: [{ translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    }}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={styles.imageWrap}>
          <CachedImage uri={post.media_url} style={styles.cardImage} recyclingKey={post.id} />
          <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[rank] ?? colors.bg2 + 'dd' }]}>
            <Text style={[styles.rankText, { color: rank <= 3 ? '#fff' : colors.textMuted }]}>
              #{rank}
            </Text>
          </View>
          {(isHot || isNew) && (
            <View style={[styles.tagBadge, { backgroundColor: isHot ? '#ef4444' : '#6366f1' }]}>
              <Text style={styles.tagText}>{isHot ? '🔥' : '✨'}</Text>
            </View>
          )}
        </View>
        <View style={[styles.cardMeta, { borderTopColor: colors.border }]}>
          <Text style={[styles.cardUser, { color: colors.text }]} numberOfLines={1}>
            @{post.profiles?.username ?? 'user'}
          </Text>
          {post.caption ? (
            <Text style={[styles.cardCaption, { color: colors.textMuted }]} numberOfLines={1}>
              {post.caption}
            </Text>
          ) : null}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="heart" size={10} color="#ef4444" />
              <Text style={[styles.statText, { color: colors.textMuted }]}>
                {fmtCount(post.likes_count ?? 0)}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="chatbubble" size={10} color={colors.accent} />
              <Text style={[styles.statText, { color: colors.textMuted }]}>
                {fmtCount(post.comments_count ?? 0)}
              </Text>
            </View>
            <View style={[styles.velocityPill, { backgroundColor: colors.accent + '18' }]}>
              <Ionicons name="trending-up-outline" size={9} color={colors.accent} />
              <Text style={[styles.velocityText, { color: colors.accent }]}>
                {fmtCount(Math.round(post.velocity ?? 0))}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── CampusPulse ──────────────────────────────────────────────────────────────

export const CampusPulse: React.FC<{
  userId: string;
  university?: string | null;
  onPostPress: (post: any) => void;
  onSeeAll?: () => void;
  onLivePress?: (sessionId: string) => void;
}> = ({ userId, university, onPostPress, onSeeAll, onLivePress }) => {
  const { colors } = useTheme();
  const [trending, setTrending] = useState<any[]>([]);
  const [liveSessions, setLiveSessions] = useState<any[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showNewBadge, setShowNewBadge] = useState(false);

  const pulseDot = useRef(new Animated.Value(1)).current;
  const newBadgeOpacity = useRef(new Animated.Value(0)).current;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFirstLoad = useRef(true);

  // ── Pulsing dot ────────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseDot, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseDot, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseDot]);

  // ── Flash "↑ Updated" badge ─────────────────────────────────────────────────
  const flashNewBadge = useCallback(() => {
    setShowNewBadge(true);
    newBadgeOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(newBadgeOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(4000),
      Animated.timing(newBadgeOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start(() => setShowNewBadge(false));
  }, [newBadgeOpacity]);

  // ── Fetch live sessions filtered by campus ─────────────────────────────────
  const fetchLive = useCallback(async () => {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('live_sessions')
      .select('id, title, viewer_count, started_at, creator_id, profiles!creator_id(id, username, avatar_url, university)')
      .eq('status', 'live')
      .gt('started_at', since);

    const filtered = (data ?? []).filter(
      (s: any) => !university || s.profiles?.university === university
    );
    setLiveSessions(filtered);
  }, [university]);

  // ── Fetch trending posts ─────────────────────────────────────────────────────
  const fetchTrending = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(prev => (isFirstLoad.current ? true : prev));

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_hybrid_campus_feed', {
        p_user_id: userId,
        p_limit: 12,
        p_offset: 0,
      });

      let posts: any[] = [];

      if (!rpcErr && rpcData && rpcData.length > 0) {
        posts = rpcData
          .filter((p: any) => p.media_url)
          .map((p: any) => ({ ...p, velocity: p.score ?? calcVelocity(p) }));
      } else {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: fb } = await supabase
          .from('posts')
          .select('*, profiles!posts_user_id_fkey(*)')
          .not('media_url', 'is', null)
          .gte('created_at', since)
          .order('likes_count', { ascending: false })
          .limit(15);

        posts = (fb ?? []).map((p: any) => ({ ...p, velocity: calcVelocity(p) }));
      }

      const ranked = posts
        .sort((a, b) => b.velocity - a.velocity)
        .slice(0, 8);

      const wasEmpty = isFirstLoad.current;
      isFirstLoad.current = false;

      setTrending(ranked);
      setHashtags(extractHashtags(ranked));
      setLastUpdated(new Date());

      if (!wasEmpty && silent && ranked.length > 0) flashNewBadge();
    } catch (err) {
      console.warn('Campus Pulse fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [userId, flashNewBadge]);

  const debouncedRefresh = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchTrending(true), 8_000);
  }, [fetchTrending]);

  // ── Setup: initial fetch + realtime + polling ──────────────────────────────
  useEffect(() => {
    fetchTrending(false);
    fetchLive();

    pollingTimer.current = setInterval(() => {
      fetchTrending(true);
      fetchLive();
    }, 60_000);

    const postCh = supabase
      .channel(`pulse_posts_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, debouncedRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, debouncedRefresh)
      .subscribe();

    const likeCh = supabase
      .channel(`pulse_likes_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_likes' }, debouncedRefresh)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'post_likes' }, debouncedRefresh)
      .subscribe();

    const commentCh = supabase
      .channel(`pulse_comments_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments' }, debouncedRefresh)
      .subscribe();

    const liveCh = supabase
      .channel(`pulse_live_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_sessions' }, () => fetchLive())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_sessions' }, () => fetchLive())
      .subscribe();

    return () => {
      supabase.removeChannel(postCh);
      supabase.removeChannel(likeCh);
      supabase.removeChannel(commentCh);
      supabase.removeChannel(liveCh);
      if (pollingTimer.current) clearInterval(pollingTimer.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [userId, fetchTrending, fetchLive, debouncedRefresh]);

  const visiblePosts = activeHashtag
    ? trending.filter(p => (p.caption ?? '').toLowerCase().includes(activeHashtag))
    : trending;

  if (!loading && trending.length === 0 && liveSessions.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.dotWrap}>
            <Animated.View style={[styles.dotOuter, { opacity: pulseDot, borderColor: '#ef444466' }]} />
            <View style={styles.dotInner} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Campus Pulse</Text>
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
          <View style={{ flex: 1 }} />
          {onSeeAll && (
            <TouchableOpacity
              onPress={onSeeAll}
              style={styles.seeAllBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.seeAllText, { color: colors.accent }]}>See all</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.accent} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.subtitleRow}>
          <Text style={[styles.tagline, { color: colors.textMuted }]}>
            {lastUpdated
              ? `Updated ${timeAgo(lastUpdated.toISOString())}`
              : 'Trending at your university'}
          </Text>
          {showNewBadge && (
            <Animated.View style={[styles.newBadge, { opacity: newBadgeOpacity }]}>
              <Text style={styles.newBadgeText}>↑ Updated</Text>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Hashtag pills */}
      {hashtags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsContent}
          style={styles.pillsRow}
        >
          <TouchableOpacity
            style={[
              styles.hashPill,
              activeHashtag === null
                ? { backgroundColor: colors.accent, borderColor: colors.accent }
                : { backgroundColor: colors.bg2, borderColor: colors.border },
            ]}
            onPress={() => setActiveHashtag(null)}
          >
            <Text style={[styles.hashPillText, { color: activeHashtag === null ? '#fff' : colors.textMuted }]}>
              All
            </Text>
          </TouchableOpacity>
          {hashtags.map(tag => (
            <TouchableOpacity
              key={tag}
              style={[
                styles.hashPill,
                activeHashtag === tag
                  ? { backgroundColor: colors.accent + '20', borderColor: colors.accent }
                  : { backgroundColor: colors.bg2, borderColor: colors.border },
              ]}
              onPress={() => setActiveHashtag(prev => prev === tag ? null : tag)}
            >
              <Text style={[styles.hashPillText, { color: activeHashtag === tag ? colors.accent : colors.textMuted }]}>
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
      >
        {loading ? (
          [1, 2, 3].map(i => (
            <View key={i} style={[styles.skeleton, { backgroundColor: colors.bg2 }]} />
          ))
        ) : (
          <>
            {liveSessions.map(session => (
              <LiveCard
                key={session.id}
                session={session}
                colors={colors}
                onPress={() => onLivePress?.(session.id)}
              />
            ))}
            {visiblePosts.map((post, i) => (
              <PulseCard
                key={post.id}
                post={post}
                rank={i + 1}
                colors={colors}
                onPress={() => onPostPress(post)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },

  // Header
  header: { paddingHorizontal: 16, marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, marginLeft: 26 },

  dotWrap: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  dotOuter: {
    position: 'absolute', width: 16, height: 16, borderRadius: 8,
    borderWidth: 1.5,
  },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },

  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },

  liveBadge: {
    backgroundColor: '#ef444422',
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: '#ef444440',
  },
  liveBadgeText: { fontSize: 10, fontWeight: '900', color: '#ef4444', letterSpacing: 1 },

  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  seeAllText: { fontSize: 13, fontWeight: '700' },

  tagline: { fontSize: 12 },
  newBadge: {
    backgroundColor: '#6366f122',
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: '#6366f140',
  },
  newBadgeText: { fontSize: 10, fontWeight: '800', color: '#818cf8' },

  // Hashtag pills
  pillsRow: { marginBottom: 10 },
  pillsContent: { paddingHorizontal: 14, gap: 7 },
  hashPill: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  hashPillText: { fontSize: 12, fontWeight: '600' },

  // Scroll
  scrollContent: { paddingHorizontal: 12, gap: 12, paddingBottom: 2 },

  // Card (shared by Live and Post)
  card: {
    width: CARD_W,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // Post card image area
  imageWrap: { position: 'relative' },
  cardImage: {
    width: '100%',
    height: CARD_W * 1.1,
    backgroundColor: '#111',
  },

  // Live card image area
  liveImageWrap: {
    height: CARD_W * 1.1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#180808',
  },
  liveRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2.5,
    borderColor: '#ef4444',
    opacity: 0.6,
  },
  liveAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#ef4444',
  },

  // Rank / tag badges (absolute positioned inside imageWrap)
  rankBadge: {
    position: 'absolute', top: 7, left: 7,
    minWidth: 28, height: 22, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rankText: { fontSize: 11, fontWeight: '900' },
  tagBadge: {
    position: 'absolute', top: 7, right: 7,
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  tagText: { fontSize: 11 },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#00000099',
  },
  viewerText: { fontSize: 9, color: '#fff', fontWeight: '700' },

  // Card meta footer
  cardMeta: { padding: 9, borderTopWidth: 0.5 },
  cardUser: { fontSize: 12, fontWeight: '700' },
  cardCaption: { fontSize: 11, marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontSize: 10, fontWeight: '600' },
  velocityPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
    marginLeft: 'auto',
  },
  velocityText: { fontSize: 10, fontWeight: '800' },

  // Skeleton
  skeleton: {
    width: CARD_W,
    height: CARD_W * 1.45,
    borderRadius: 16,
  },
});
