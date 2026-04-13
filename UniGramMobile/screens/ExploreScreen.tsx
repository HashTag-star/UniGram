import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, Dimensions, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CachedImage } from '../components/CachedImage';
import { FeedPost } from './FeedScreen';
import { searchUsers, followUser, unfollowUser, getFollowing } from '../services/profiles';
import { searchPosts, getPostsByHashtag, getLikedPostIds, getSavedPostIds } from '../services/posts';
import { getTrendingHashtags, getPersonalizedExplorePosts, getFollowSuggestions } from '../services/algorithm';
import { trackInterestSignal } from '../services/aiEngine';
import { Skeleton, ProfilePostsSkeleton } from '../components/Skeleton';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import { useSocialFollow } from '../hooks/useSocialSync';
import { SocialSync } from '../services/social_sync';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');
const COL = (width - 3) / 3;

// ─── UserCard — standalone to satisfy Rules of Hooks ─────────────────────────
interface UserCardProps {
  user: any;
  currentUserId: string;
  isFollowing: boolean;
  onPress?: (user: any) => void;
  onDismiss?: (userId: string) => void;
  onFollowToggle: (userId: string, next: boolean) => void;
}
const UserCard: React.FC<UserCardProps> = React.memo(({ user, currentUserId, isFollowing: initFollowing, onPress, onDismiss, onFollowToggle }) => {
  const { colors } = useTheme();
  const [following, setFollowing] = useSocialFollow(user.id, initFollowing);
  const { selection } = useHaptics();

  const handleToggle = async () => {
    const next = !following;
    setFollowing(next);
    SocialSync.emit('FOLLOW_CHANGE', { targetId: user.id, isActive: next });
    selection();
    onFollowToggle(user.id, next);
    try {
      if (next) await followUser(currentUserId, user.id);
      else await unfollowUser(currentUserId, user.id);
    } catch {
      setFollowing(!next);
      SocialSync.emit('FOLLOW_CHANGE', { targetId: user.id, isActive: !next });
      onFollowToggle(user.id, !next);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.suggestedCard, { backgroundColor: colors.bg2, borderColor: colors.border }]}
      onPress={() => onPress?.(user)}
      activeOpacity={0.8}
      accessibilityLabel={`View profile of ${user.username}`}
    >
      <TouchableOpacity
        style={styles.cardClose}
        onPress={() => onDismiss?.(user.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Dismiss suggestion"
      >
        <Ionicons name="close" size={14} color={colors.textMuted} />
      </TouchableOpacity>

      {user.avatar_url
        ? <CachedImage uri={user.avatar_url} style={styles.cardAvatar} />
        : <View style={[styles.cardAvatar, { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="person" size={24} color={colors.textMuted} />
          </View>}

      <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{user.username}</Text>
      <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>{user.full_name}</Text>
      {user.reason ? (
        <Text style={[styles.cardReason, { color: colors.textMuted }]} numberOfLines={1}>{user.reason}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.cardFollowBtn, { backgroundColor: following ? colors.bg : colors.accent }]}
        onPress={handleToggle}
        accessibilityLabel={following ? `Unfollow ${user.username}` : `Follow ${user.username}`}
      >
        <Text style={[styles.cardFollowText, { color: following ? colors.text : '#fff' }]}>
          {following ? 'Following' : 'Follow'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

// ─── UserRow — standalone to satisfy Rules of Hooks ──────────────────────────
interface UserRowProps {
  user: any;
  currentUserId: string;
  isFollowing: boolean;
  onPress?: (user: any) => void;
  onFollowToggle: (userId: string, next: boolean) => void;
}
const UserRow: React.FC<UserRowProps> = React.memo(({ user, currentUserId, isFollowing: initFollowing, onPress, onFollowToggle }) => {
  const { colors } = useTheme();
  const isSelf = user.id === currentUserId;
  const [following, setFollowing] = useSocialFollow(user.id, initFollowing);
  const { selection } = useHaptics();

  const handleToggle = async () => {
    const next = !following;
    setFollowing(next);
    SocialSync.emit('FOLLOW_CHANGE', { targetId: user.id, isActive: next });
    selection();
    onFollowToggle(user.id, next);
    try {
      if (next) await followUser(currentUserId, user.id);
      else await unfollowUser(currentUserId, user.id);
    } catch {
      setFollowing(!next);
      SocialSync.emit('FOLLOW_CHANGE', { targetId: user.id, isActive: !next });
      onFollowToggle(user.id, !next);
    }
  };

  return (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => onPress?.(user)}
      activeOpacity={0.75}
      accessibilityLabel={`View profile of ${user.username}`}
    >
      {user.avatar_url
        ? <CachedImage uri={user.avatar_url} style={styles.userAvatar} />
        : <View style={[styles.userAvatar, styles.userAvatarPlaceholder, { backgroundColor: colors.bg2 }]}>
            <Ionicons name="person" size={20} color={colors.textMuted} />
          </View>}
      <View style={{ flex: 1, marginLeft: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.userName, { color: colors.text }]}>{user.username}</Text>
          {user.is_verified && <VerifiedBadge type={user.verification_type} />}
        </View>
        <Text style={[styles.userMeta, { color: colors.textMuted }]}>
          {user.full_name}{user.university ? ` · ${user.university}` : ''}
        </Text>
      </View>
      {!isSelf && (
        <TouchableOpacity
          style={[
            styles.followBtn,
            { borderColor: following ? 'transparent' : colors.border },
            following && styles.followBtnActive,
          ]}
          onPress={handleToggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={following ? `Unfollow ${user.username}` : `Follow ${user.username}`}
        >
          <Text style={[styles.followBtnText, { color: following ? '#818cf8' : colors.text }]}>
            {following ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

type SearchTab = 'top' | 'people' | 'posts' | 'tags';

const FALLBACK_TRENDS = [
  { tag: '#Finals2026', posts: 1842 },
  { tag: '#CampusLife', posts: 3201 },
  { tag: '#Internship', posts: 987 },
  { tag: '#StudyGroup', posts: 762 },
  { tag: '#Research', posts: 541 },
  { tag: '#Hackathon', posts: 430 },
];

interface Props {
  onUserPress?: (profile: any) => void;
  onDiscoverPress?: () => void;
  isVisible?: boolean;
}

export const ExploreScreen: React.FC<Props> = ({ onUserPress, onDiscoverPress, isVisible }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { selection } = useHaptics();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('top');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [postResults, setPostResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Home state (no query)
  const [gridPosts, setGridPosts] = useState<any[]>([]);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [trendingTags, setTrendingTags] = useState(FALLBACK_TRENDS);
  const [hashtagPosts, setHashtagPosts] = useState<any[]>([]);
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);

  // Post detail
  const [detailPost, setDetailPost] = useState<any | null>(null);

  const [currentUserId, setCurrentUserId] = useState('');
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(true);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const uid = data.user.id;
      setCurrentUserId(uid);

      const [posts, liked, saved, follows, sugg] = await Promise.all([
        getPersonalizedExplorePosts(uid, 18, 0),
        getLikedPostIds(uid),
        getSavedPostIds(uid),
        getFollowing(uid),
        getFollowSuggestions(uid, 10).catch(() => [] as any[]),
      ]);
      setGridPosts(posts);
      setLikedIds(new Set(liked));
      setSavedIds(new Set(saved));
      const followingSet = new Set(follows.map((f: any) => f.id));
      setFollowingIds(followingSet);

      // Filter out already-following users from suggestions
      setSuggested(sugg.filter((u: any) => !followingSet.has(u.id)).slice(0, 10));

      getTrendingHashtags(8, uid).then(tags => {
        if (tags.length > 0) {
          setTrendingTags(tags.map((t: any) => ({ tag: t.tag, posts: Number(t.post_count) })));
        }
      }).catch(() => {});
    });
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setUserResults([]); setPostResults([]); return;
    }
    setLoading(true);
    try {
      const [users, posts] = await Promise.all([
        searchUsers(q),
        searchPosts(q, 20),
      ]);
      setUserResults(users);
      setPostResults(posts);

      // Check following status for results
      if (currentUserId && users.length > 0) {
        const checks = await Promise.all(
          users.map((u: any) => supabase.from('follows')
            .select('follower_id').eq('follower_id', currentUserId).eq('following_id', u.id).maybeSingle()
            .then(({ data }) => !!data))
        );
        const ids = new Set<string>();
        users.forEach((u: any, i: number) => { if (checks[i]) ids.add(u.id); });
        setFollowingIds(prev => new Set([...prev, ...ids]));
      }
    } catch { } finally { setLoading(false); }
  }, [currentUserId]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(query), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, runSearch]);

  // ── Follow toggle (optimistic) ────────────────────────────────────────────
  const toggleFollow = useCallback(async (targetId: string) => {
    if (!currentUserId) return;
    const isNowFollowing = followingIds.has(targetId);
    const next = !isNowFollowing;
    setFollowingIds(prev => {
      const s = new Set(prev);
      if (isNowFollowing) s.delete(targetId); else s.add(targetId);
      return s;
    });
    SocialSync.emit('FOLLOW_CHANGE', { targetId, isActive: next });
    try {
      if (isNowFollowing) await unfollowUser(currentUserId, targetId);
      else await followUser(currentUserId, targetId);
    } catch {
      setFollowingIds(prev => {
        const s = new Set(prev);
        if (!isNowFollowing) s.delete(targetId); else s.add(targetId);
        return s;
      });
      SocialSync.emit('FOLLOW_CHANGE', { targetId, isActive: isNowFollowing });
    }
    selection();
  }, [currentUserId, followingIds, selection]);

  // ── Hashtag filter ────────────────────────────────────────────────────────
  const openHashtag = useCallback(async (tag: string) => {
    setActiveHashtag(tag);
    selection();
    const posts = await getPostsByHashtag(tag, 30).catch(() => []);
    setHashtagPosts(posts);
  }, [selection]);

  // ── Follow sync callback (used by UserCard / UserRow) ────────────────────
  const handleFollowToggle = useCallback((userId: string, next: boolean) => {
    setFollowingIds(prev => {
      const s = new Set(prev);
      if (next) s.add(userId); else s.delete(userId);
      return s;
    });
  }, []);

  const handleDismiss = useCallback((userId: string) => {
    setSuggested(prev => prev.filter(u => u.id !== userId));
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isSearching = query.length > 0;
  const mediaGridPosts = useMemo(() => gridPosts.filter(p => p.media_url), [gridPosts]);

  // ── Search result tabs ────────────────────────────────────────────────────
  const SEARCH_TABS: Array<{ id: SearchTab; label: string }> = [
    { id: 'top', label: 'Top' },
    { id: 'people', label: 'People' },
    { id: 'posts', label: 'Posts' },
    { id: 'tags', label: 'Tags' },
  ];

  const renderPostGridItem = useCallback(({ item: post }: { item: any }) => (
    <TouchableOpacity
      style={[styles.gridItem, { width: COL, height: COL }]}
      onPress={() => {
        setDetailPost(post);
        // Fire-and-forget: extract hashtags from caption and record interest signals
        if (currentUserId && post.caption) {
          const tags = (post.caption.match(/#\w+/g) ?? []) as string[];
          if (tags.length) trackInterestSignal(currentUserId, tags).catch(() => {});
        }
      }}
      activeOpacity={0.85}
      accessibilityLabel={`View post`}
    >
      <CachedImage uri={post.media_url} style={{ width: '100%', height: '100%' }} />
      {post.type === 'video' && (
        <View style={styles.videoIndicator}>
          <Ionicons name="play" size={12} color="#fff" />
        </View>
      )}
      {(post.likes_count > 0 || post.comments_count > 0) && (
        <View style={styles.gridOverlay}>
          <View style={styles.gridStat}>
            <Ionicons name="heart" size={11} color="#fff" />
            <Text style={styles.gridStatText}>{post.likes_count ?? 0}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  ), [currentUserId]);

  // ── Hashtag results screen ────────────────────────────────────────────────
  if (activeHashtag) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => { setActiveHashtag(null); setHashtagPosts([]); }} style={{ padding: 4, marginRight: 8 }}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: colors.text }]}>{activeHashtag}</Text>
          <Text style={[styles.hashtagPostCount, { color: colors.textMuted }]}>{hashtagPosts.length} posts</Text>
        </View>
        {hashtagPosts.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#4f46e5" />
          </View>
        ) : (
          <FlatList
            data={hashtagPosts.filter(p => p.media_url)}
            keyExtractor={p => p.id}
            numColumns={3}
            renderItem={renderPostGridItem}
            contentContainerStyle={{ gap: 1, paddingBottom: 80 }}
            columnWrapperStyle={{ gap: 1 }}
            showsVerticalScrollIndicator={false}
            windowSize={5}
            maxToRenderPerBatch={9}
            initialNumToRender={9}
            removeClippedSubviews={true}
          />
        )}
        {detailPost && (
          <PostDetailModal
            post={detailPost}
            currentUserId={currentUserId}
            isLiked={likedIds.has(detailPost.id)}
            isSaved={savedIds.has(detailPost.id)}
            isMuted={isMuted}
            setIsMuted={setIsMuted}
            onClose={() => setDetailPost(null)}
          />
        )}
      </View>
    );
  }

  if (loading && !query && gridPosts.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Skeleton width={'60%' as any} height={24} style={{ marginBottom: 20 }} />
          <Skeleton width={'100%' as any} height={40} borderRadius={20} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <Skeleton width={130} height={15} style={{ marginBottom: 16 }} />
            {[1,2,3].map(i => <View key={i} style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <Skeleton width={24} height={24} borderRadius={12} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width={'50%' as any} height={14} />
                <Skeleton width={'30%' as any} height={10} />
              </View>
            </View>)}
          </View>
          <ProfilePostsSkeleton colSize={COL} />
          <ProfilePostsSkeleton colSize={COL} />
        </ScrollView>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.topBarTitle, { color: colors.text }]}>Explore</Text>
        <TouchableOpacity 
          onPress={onDiscoverPress} 
          style={styles.discoverBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="person-add-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search people, posts, #tags..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setActiveTab('top'); }}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {isSearching ? (
        // ─── Search results ──────────────────────────────────────────────
        <View style={{ flex: 1 }}>
          {/* Tab bar */}
          <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
            {SEARCH_TABS.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tabBtn, activeTab === t.id && styles.tabBtnActive]}
                onPress={() => setActiveTab(t.id)}
              >
                <Text style={[styles.tabBtnText, { color: activeTab === t.id ? '#818cf8' : colors.textMuted }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <ActivityIndicator color="#4f46e5" />
            </View>
          ) : (
            <FlatList
              data={
                activeTab === 'people' ? userResults
                : activeTab === 'posts' ? postResults.filter(p => p.media_url)
                : activeTab === 'tags' ? trendingTags.filter(t => t.tag.toLowerCase().includes(query.toLowerCase()))
                : [...userResults.slice(0, 3), ...postResults.slice(0, 6)] // top mix
              }
              keyExtractor={(item: any, i) => item.id ?? item.tag ?? String(i)}
              contentContainerStyle={{ paddingBottom: 80 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 40 }}>
                  <Ionicons name="search-outline" size={40} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, marginTop: 10 }}>No results for "{query}"</Text>
                </View>
              }
              renderItem={({ item }) => {
                if (activeTab === 'tags' || item.tag) {
                  return (
                    <TouchableOpacity style={styles.userRow} onPress={() => openHashtag(item.tag)}>
                      <View style={[styles.hashIcon, { backgroundColor: colors.accent + '20' }]}>
                        <Ionicons name="pricetag-outline" size={18} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.userName, { color: colors.text }]}>{item.tag}</Text>
                        <Text style={[styles.userMeta, { color: colors.textMuted }]}>{(item.posts ?? 0).toLocaleString()} posts</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                }
                if (item.username) return (
                  <UserRow
                    user={item}
                    currentUserId={currentUserId}
                    isFollowing={followingIds.has(item.id)}
                    onPress={onUserPress}
                    onFollowToggle={handleFollowToggle}
                  />
                );
                if (item.media_url) {
                  return (
                    <TouchableOpacity style={styles.postResultRow} onPress={() => setDetailPost(item)} activeOpacity={0.8}>
                      <CachedImage uri={item.media_url} style={[styles.postResultThumb, { backgroundColor: colors.bg2 }]} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.postResultCaption, { color: colors.text }]} numberOfLines={2}>{item.caption}</Text>
                        <Text style={[styles.postResultMeta, { color: colors.textMuted }]}>
                          {item.profiles?.username} · {item.likes_count ?? 0} likes
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }
                return null;
              }}
            />
          )}
        </View>
      ) : (
        // ─── Discovery home ──────────────────────────────────────────────
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          {/* Trending hashtags */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>TRENDING ON CAMPUS</Text>
            {trendingTags.map(({ tag, posts: count }, i) => (
              <TouchableOpacity key={tag} style={styles.trendRow} onPress={() => openHashtag(tag)}>
                <Text style={[styles.trendNum, { color: colors.textMuted }]}>{i + 1}</Text>
                <View style={[styles.hashIcon, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trendTag, { color: colors.text }]}>{tag}</Text>
                  <Text style={[styles.trendMeta, { color: colors.textMuted }]}>{(count ?? 0).toLocaleString()} posts</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Suggested people */}
          {suggested.length > 0 && (
            <View style={styles.section}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: colors.textMuted, marginBottom: 0 }]}>SUGGESTED FOR YOU</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingRight: 20 }}
              >
                {suggested.map(user => (
                  <UserCard
                    key={user.id}
                    user={user}
                    currentUserId={currentUserId}
                    isFollowing={followingIds.has(user.id)}
                    onPress={onUserPress}
                    onDismiss={handleDismiss}
                    onFollowToggle={handleFollowToggle}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Explore photo grid — plain View grid (all items visible, no virtualization needed) */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>EXPLORE</Text>
          </View>
          {mediaGridPosts.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>No photos yet</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {mediaGridPosts.map(post => (
                <TouchableOpacity
                  key={post.id}
                  style={[styles.gridItem, { width: COL, height: COL }]}
                  onPress={() => setDetailPost(post)}
                  activeOpacity={0.85}
                  accessibilityLabel="View post"
                >
                  <CachedImage uri={post.media_url} style={{ width: '100%', height: '100%' }} />
                  {post.type === 'video' && (
                    <View style={styles.videoIndicator}>
                      <Ionicons name="play" size={12} color="#fff" />
                    </View>
                  )}
                  {(post.likes_count > 0 || post.comments_count > 0) && (
                    <View style={styles.gridOverlay}>
                      <View style={styles.gridStat}>
                        <Ionicons name="heart" size={11} color="#fff" />
                        <Text style={styles.gridStatText}>{post.likes_count ?? 0}</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Post detail modal */}
      {detailPost && (
        <PostDetailModal
          post={detailPost}
          currentUserId={currentUserId}
          isLiked={likedIds.has(detailPost.id)}
          isSaved={savedIds.has(detailPost.id)}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
          isVisible={isVisible}
          onClose={() => setDetailPost(null)}
        />
      )}
    </View>
  );
};

// ─── Post Detail Modal ─────────────────────────────────────────────────────
const PostDetailModal: React.FC<{
  post: any;
  currentUserId: string;
  isLiked: boolean;
  isSaved: boolean;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
  isVisible?: boolean;
  onClose: () => void;
}> = ({ post, currentUserId, isLiked, isSaved, isMuted, setIsMuted, isVisible, onClose }) => {
  const { colors } = useTheme();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginLeft: 10 }}>
            {post.profiles?.username ?? 'Post'}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <FeedPost
            post={post}
            currentUserId={currentUserId}
            isLiked={isLiked}
            isSaved={isSaved}
            isMuted={isMuted}
            setIsMuted={setIsMuted}
          />
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4 },
  topBarTitle: { fontSize: 22, fontWeight: '800', flex: 1 },
  discoverBtn: { padding: 4 },
  hashtagPostCount: { fontSize: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12,
    marginHorizontal: 14, marginVertical: 6, paddingHorizontal: 14, paddingVertical: 4,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#818cf8' },
  tabBtnText: { fontSize: 13, fontWeight: '600' },
  tabBtnTextActive: { color: '#818cf8' },
  section: { marginBottom: 24, paddingHorizontal: 14 },
  sectionTitle: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 12 },
  
  // Suggested Card (Horizontal)
  suggestedCard: {
    width: 150,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  cardClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 2,
  },
  cardAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 10,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: 11,
    marginBottom: 4,
    textAlign: 'center',
  },
  cardReason: {
    fontSize: 10,
    marginBottom: 10,
    textAlign: 'center',
    opacity: 0.6,
  },
  cardFollowBtn: {
    width: '100%',
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
  },
  cardFollowText: {
    fontSize: 12,
    fontWeight: '700',
  },

  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 13, fontWeight: 'bold' },
  userMeta: { fontSize: 11, marginTop: 1 },
  followBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  followBtnActive: { borderColor: 'rgba(99,102,241,0.4)', backgroundColor: 'rgba(99,102,241,0.1)' },
  followBtnText: { fontSize: 12, fontWeight: '600' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  trendNum: { fontSize: 12, fontWeight: 'bold', width: 16, textAlign: 'right' },
  hashIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  trendTag: { fontSize: 13, fontWeight: 'bold' },
  trendMeta: { fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  gridItem: { overflow: 'hidden', position: 'relative' },
  videoIndicator: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 3 },
  gridOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.3)', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  gridStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gridStatText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  postResultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  postResultThumb: { width: 56, height: 56, borderRadius: 8 },
  postResultCaption: { fontSize: 13, lineHeight: 18 },
  postResultMeta: { fontSize: 11, marginTop: 3 },
});
