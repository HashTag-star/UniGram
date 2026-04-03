import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { FeedPost } from './FeedScreen';
import { searchUsers, followUser, unfollowUser, getFollowing } from '../services/profiles';
import { getFeedPosts, searchPosts, getPostsByHashtag, getLikedPostIds, getSavedPostIds } from '../services/posts';
import { getTrendingHashtags } from '../services/algorithm';
import { Skeleton, ProfilePostsSkeleton } from '../components/Skeleton';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';

const { width } = Dimensions.get('window');
const COL = (width - 3) / 3;

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
  isVisible?: boolean;
}

export const ExploreScreen: React.FC<Props> = ({ onUserPress, isVisible }) => {
  const insets = useSafeAreaInsets();
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

      const [posts, liked, saved, follows] = await Promise.all([
        getFeedPosts(18),
        getLikedPostIds(uid),
        getSavedPostIds(uid),
        getFollowing(uid),
      ]);
      setGridPosts(posts);
      setLikedIds(new Set(liked));
      setSavedIds(new Set(saved));
      setFollowingIds(new Set(follows.map((f: any) => f.id)));

      // suggested users (not already following, not self)
      const followingSet = new Set(follows.map((f: any) => f.id));
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', uid)
        .limit(8);
      setSuggested((prof ?? []).filter((u: any) => !followingSet.has(u.id)).slice(0, 5));
    });

    getTrendingHashtags(8).then(tags => {
      if (tags.length > 0) {
        setTrendingTags(tags.map((t: any) => ({ tag: t.tag, posts: Number(t.post_count) })));
      }
    }).catch(() => {});
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
    setFollowingIds(prev => {
      const next = new Set(prev);
      if (isNowFollowing) next.delete(targetId); else next.add(targetId);
      return next;
    });
    try {
      if (isNowFollowing) await unfollowUser(currentUserId, targetId);
      else await followUser(currentUserId, targetId);
    } catch {
      setFollowingIds(prev => {
        const next = new Set(prev);
        if (!isNowFollowing) next.delete(targetId); else next.add(targetId);
        return next;
      });
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isSearching = query.length > 0;
  const mediaGridPosts = useMemo(() => gridPosts.filter(p => p.media_url), [gridPosts]);

  // ── Sub-components ────────────────────────────────────────────────────────
  const UserRow = useCallback(({ user }: { user: any }) => {
    const isSelf = user.id === currentUserId;
    const following = followingIds.has(user.id);
    return (
      <TouchableOpacity style={styles.userRow} onPress={() => onUserPress?.(user)} activeOpacity={0.75}>
        {user.avatar_url
          ? <Image source={{ uri: user.avatar_url }} style={styles.userAvatar} />
          : <View style={[styles.userAvatar, styles.userAvatarPlaceholder]}>
              <Ionicons name="person" size={20} color="#555" />
            </View>
        }
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.userName}>{user.username}</Text>
            {user.is_verified && <VerifiedBadge type={user.verification_type} />}
          </View>
          <Text style={styles.userMeta}>
            {user.full_name}{user.university ? ` · ${user.university}` : ''}
          </Text>
        </View>
        {!isSelf && (
          <TouchableOpacity
            style={[styles.followBtn, following && styles.followBtnActive]}
            onPress={() => toggleFollow(user.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.followBtnText, following && { color: '#818cf8' }]}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [currentUserId, followingIds, toggleFollow, onUserPress]);

  // ── Search result tabs ────────────────────────────────────────────────────
  const SEARCH_TABS: Array<{ id: SearchTab; label: string }> = [
    { id: 'top', label: 'Top' },
    { id: 'people', label: 'People' },
    { id: 'posts', label: 'Posts' },
    { id: 'tags', label: 'Tags' },
  ];

  const PostGridItem = useCallback(({ post }: { post: any }) => (
    <TouchableOpacity
      style={[styles.gridItem, { width: COL, height: COL }]}
      onPress={() => setDetailPost(post)}
      activeOpacity={0.85}
    >
      <Image source={{ uri: post.media_url }} style={{ width: '100%', height: '100%' }} />
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
  ), []);

  // ── Hashtag results screen ────────────────────────────────────────────────
  if (activeHashtag) {
    return (
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => { setActiveHashtag(null); setHashtagPosts([]); }} style={{ padding: 4, marginRight: 8 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{activeHashtag}</Text>
          <Text style={styles.hashtagPostCount}>{hashtagPosts.length} posts</Text>
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
            renderItem={({ item }) => <PostGridItem post={item} />}
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
      <View style={[styles.container, { paddingTop: insets.top }]}>
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
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.topBarTitle}>Explore</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people, posts, #tags..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setActiveTab('top'); }}>
            <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        )}
      </View>

      {isSearching ? (
        // ─── Search results ──────────────────────────────────────────────
        <View style={{ flex: 1 }}>
          {/* Tab bar */}
          <View style={styles.tabRow}>
            {SEARCH_TABS.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tabBtn, activeTab === t.id && styles.tabBtnActive]}
                onPress={() => setActiveTab(t.id)}
              >
                <Text style={[styles.tabBtnText, activeTab === t.id && styles.tabBtnTextActive]}>
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
                  <Ionicons name="search-outline" size={40} color="#333" />
                  <Text style={{ color: '#555', marginTop: 10 }}>No results for "{query}"</Text>
                </View>
              }
              renderItem={({ item }) => {
                if (activeTab === 'tags' || item.tag) {
                  return (
                    <TouchableOpacity style={styles.userRow} onPress={() => openHashtag(item.tag)}>
                      <View style={styles.hashIcon}>
                        <Ionicons name="pricetag-outline" size={18} color="#818cf8" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.userName}>{item.tag}</Text>
                        <Text style={styles.userMeta}>{(item.posts ?? 0).toLocaleString()} posts</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                    </TouchableOpacity>
                  );
                }
                if (item.username) return <UserRow user={item} />;
                if (item.media_url) {
                  return (
                    <TouchableOpacity style={styles.postResultRow} onPress={() => setDetailPost(item)} activeOpacity={0.8}>
                      <Image source={{ uri: item.media_url }} style={styles.postResultThumb} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.postResultCaption} numberOfLines={2}>{item.caption}</Text>
                        <Text style={styles.postResultMeta}>
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
        <FlatList
          data={[]}
          keyExtractor={() => ''}
          renderItem={null}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListHeaderComponent={
            <>
              {/* Trending hashtags */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>TRENDING ON CAMPUS</Text>
                {trendingTags.map(({ tag, posts: count }, i) => (
                  <TouchableOpacity key={tag} style={styles.trendRow} onPress={() => openHashtag(tag)}>
                    <Text style={styles.trendNum}>{i + 1}</Text>
                    <View style={styles.hashIcon}>
                      <Ionicons name="pricetag-outline" size={16} color="#818cf8" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.trendTag}>{tag}</Text>
                      <Text style={styles.trendMeta}>{count.toLocaleString()} posts</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.2)" />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Suggested people */}
              {suggested.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>SUGGESTED FOR YOU</Text>
                  {suggested.map(user => <UserRow key={user.id} user={user} />)}
                </View>
              )}

              {/* Explore photo grid */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>EXPLORE</Text>
              </View>
              <View style={styles.grid}>
                {mediaGridPosts.map(post => <PostGridItem key={post.id} post={post} />)}
                {mediaGridPosts.length === 0 && (
                  <View style={{ alignItems: 'center', width: '100%', paddingVertical: 20 }}>
                    <Text style={{ color: '#555', fontSize: 13 }}>No photos yet</Text>
                  </View>
                )}
              </View>
            </>
          }
        />
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
  onClose: () => void;
}> = ({ post, currentUserId, isLiked, isSaved, isMuted, setIsMuted, onClose }) => (
  <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, marginLeft: 10 }}>
          {post.profiles?.username ?? 'Post'}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <FeedPost
          post={post}
          currentUserId={currentUserId}
          isLiked={isLiked}
          isSaved={isSaved}
          isActive={true}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
        />
      </ScrollView>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4 },
  topBarTitle: { fontSize: 22, fontWeight: '800', color: '#fff', flex: 1 },
  hashtagPostCount: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20,
    marginHorizontal: 14, marginVertical: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', marginBottom: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#818cf8' },
  tabBtnText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  tabBtnTextActive: { color: '#818cf8' },
  section: { marginBottom: 20, paddingHorizontal: 14 },
  sectionTitle: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userAvatarPlaceholder: { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  userMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  followBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  followBtnActive: { borderColor: 'rgba(99,102,241,0.4)', backgroundColor: 'rgba(99,102,241,0.1)' },
  followBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  trendNum: { color: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 'bold', width: 16, textAlign: 'right' },
  hashIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(99,102,241,0.1)', alignItems: 'center', justifyContent: 'center' },
  trendTag: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  trendMeta: { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1, marginBottom: 80 },
  gridItem: { overflow: 'hidden', position: 'relative' },
  videoIndicator: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 3 },
  gridOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.3)', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  gridStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gridStatText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  postResultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  postResultThumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#111' },
  postResultCaption: { fontSize: 13, color: '#fff', lineHeight: 18 },
  postResultMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 },
});
