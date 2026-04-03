import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { searchUsers, followUser, unfollowUser, isFollowing } from '../services/profiles';
import { getFeedPosts } from '../services/posts';
import { getTrendingHashtags } from '../services/algorithm';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';

const { width } = Dimensions.get('window');
const COL = (width - 3) / 3;

const TRENDING_TAGS = [
  { tag: '#Finals2026', posts: 1842 },
  { tag: '#CampusLife', posts: 3201 },
  { tag: '#Internship', posts: 987 },
  { tag: '#StudyGroup', posts: 762 },
  { tag: '#Research', posts: 541 },
  { tag: '#Hackathon', posts: 430 },
];

interface Props {
  onUserPress?: (profile: any) => void;
}

export const ExploreScreen: React.FC<Props> = ({ onUserPress }) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [gridPosts, setGridPosts] = useState<any[]>([]);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [trendingTags, setTrendingTags] = useState(TRENDING_TAGS);
  const { selection } = useHaptics();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
    getFeedPosts(12).then(posts => setGridPosts(posts)).catch(() => {});
    supabase.from('profiles').select('*').limit(5).then(({ data }) => {
      setSuggested(data ?? []);
    });
    // Load real trending hashtags
    getTrendingHashtags(8).then(tags => {
      if (tags.length > 0) {
        setTrendingTags(tags.map((t: any) => ({ tag: t.tag, posts: Number(t.post_count) })));
      }
    }).catch(() => {});
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setUsers([]); return; }
    setLoading(true);
    try {
      const results = await searchUsers(q);
      setUsers(results);
      // Check following status
      if (currentUserId && results.length > 0) {
        const checks = await Promise.all(results.map((u: any) => isFollowing(currentUserId, u.id)));
        const ids = new Set<string>();
        results.forEach((u: any, i: number) => { if (checks[i]) ids.add(u.id); });
        setFollowingIds(ids);
      }
    } catch { } finally { setLoading(false); }
  }, [currentUserId]);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const toggleFollow = async (targetId: string) => {
    if (!currentUserId) return;
    const following = followingIds.has(targetId);
    setFollowingIds(prev => {
      const next = new Set(prev);
      if (following) next.delete(targetId); else next.add(targetId);
      return next;
    });
    try {
      if (following) await unfollowUser(currentUserId, targetId);
      else await followUser(currentUserId, targetId);
    } catch {
      setFollowingIds(prev => {
        const next = new Set(prev);
        if (!following) next.delete(targetId); else next.add(targetId);
        return next;
      });
    }
  };

  const UserRow = ({ user }: { user: any }) => {
    const isSelf = user.id === currentUserId;
    const following = followingIds.has(user.id);
    return (
      <TouchableOpacity style={styles.userRow} onPress={() => onUserPress?.(user)}>
        {user.avatar_url
          ? <Image source={{ uri: user.avatar_url }} style={styles.userAvatar} />
          : <View style={[styles.userAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={20} color="#555" />
            </View>
        }
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.userName}>{user.username}</Text>
            {user.is_verified && <VerifiedBadge type={user.verification_type} />}
          </View>
          <Text style={styles.userMeta}>{user.full_name} · {(user.followers_count ?? 0).toLocaleString()} followers</Text>
        </View>
        {!isSelf && (
          <TouchableOpacity
            style={[styles.followBtn, following && styles.followBtnActive]}
            onPress={() => toggleFollow(user.id)}
          >
            <Text style={[styles.followBtnText, following && { color: '#818cf8' }]}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const searching = query.length > 0;

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.topBarTitle}>Explore</Text>
      </View>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people, hashtags..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        {loading && (
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <ActivityIndicator color="#4f46e5" />
          </View>
        )}

        {searching && !loading ? (
          <>
            {users.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>PEOPLE</Text>
                {users.map(user => <UserRow key={user.id} user={user} />)}
              </View>
            )}
            {users.length === 0 && (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Ionicons name="search-outline" size={40} color="#333" />
                <Text style={{ color: '#555', marginTop: 10 }}>No results for "{query}"</Text>
              </View>
            )}
          </>
        ) : !searching ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SUGGESTED FOR YOU</Text>
              {suggested.filter(u => u.id !== currentUserId).slice(0, 4).map(user => (
                <UserRow key={user.id} user={user} />
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>TRENDING ON CAMPUS</Text>
              {TRENDING_TAGS.map(({ tag, posts }, i) => (
                <TouchableOpacity key={tag} style={styles.trendRow}>
                  <Text style={styles.trendNum}>{i + 1}</Text>
                  <View style={styles.hashIcon}>
                    <Ionicons name="pricetag-outline" size={16} color="#818cf8" />
                  </View>
                  <View>
                    <Text style={styles.trendTag}>{tag}</Text>
                    <Text style={styles.trendMeta}>{posts.toLocaleString()} posts</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>EXPLORE</Text>
              <View style={styles.grid}>
                {gridPosts.map((post, i) =>
                  post.media_url ? (
                    <TouchableOpacity key={post.id} style={[styles.gridItem, { width: COL, height: COL }]}>
                      <Image source={{ uri: post.media_url }} style={{ width: '100%', height: '100%' }} />
                    </TouchableOpacity>
                  ) : null
                )}
                {gridPosts.filter(p => p.media_url).length === 0 && (
                  <View style={{ alignItems: 'center', width: '100%', paddingVertical: 20 }}>
                    <Text style={{ color: '#555', fontSize: 13 }}>No photos yet</Text>
                  </View>
                )}
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: { paddingHorizontal: 16, paddingBottom: 4 },
  topBarTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20,
    marginHorizontal: 14, marginVertical: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  section: { marginBottom: 24, paddingHorizontal: 14 },
  sectionTitle: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userName: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  userMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  followBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  followBtnActive: { borderColor: 'rgba(99,102,241,0.4)', backgroundColor: 'rgba(99,102,241,0.1)' },
  followBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  trendNum: { color: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 'bold', width: 16, textAlign: 'right' },
  hashIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(99,102,241,0.1)', alignItems: 'center', justifyContent: 'center' },
  trendTag: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  trendMeta: { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  gridItem: { overflow: 'hidden' },
});
