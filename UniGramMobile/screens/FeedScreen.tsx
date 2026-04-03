import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, Modal, FlatList,
  StatusBar, RefreshControl, Animated, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { FeedPostSkeleton, StorySkeleton } from '../components/Skeleton';
import { CommentSheet } from '../components/CommentSheet';
import { likePost, unlikePost, savePost, unsavePost, getLikedPostIds, getSavedPostIds } from '../services/posts';
import { getActiveStories, markStoryViewed, getViewedStoryIds, createStory } from '../services/stories';
import { getPersonalizedFeed, recordImpression } from '../services/algorithm';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';

const { width } = Dimensions.get('window');

function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function fmtCount(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ─── Story Bar ───────────────────────────────────────────────────────────────
const StoryBar: React.FC<{
  storyGroups: any[];
  currentProfile: any;
  viewedIds: string[];
  onStoryPress: (idx: number) => void;
  onYourStoryPress: () => void;
}> = ({ storyGroups, currentProfile, viewedIds, onStoryPress, onYourStoryPress }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    style={styles.storyScroll}
    contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
  >
    <TouchableOpacity style={styles.storyItem} onPress={onYourStoryPress}>
      <View style={styles.storyRingOwn}>
        <View style={styles.storyAvatarClip}>
          {currentProfile?.avatar_url
            ? <Image source={{ uri: currentProfile.avatar_url }} style={styles.storyAvatar} />
            : <View style={[styles.storyAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={22} color="#555" />
              </View>
          }
        </View>
        <View style={styles.storyAddBtn}>
          <Ionicons name="add" size={13} color="#fff" />
        </View>
      </View>
      <Text style={styles.storyUsername} numberOfLines={1}>Your Story</Text>
    </TouchableOpacity>

    {storyGroups.map((group, i) => {
      const allViewed = group.stories.every((s: any) => viewedIds.includes(s.id));
      return (
        <TouchableOpacity key={group.profile.id} style={styles.storyItem} onPress={() => onStoryPress(i)}>
          <View style={[styles.storyRing, allViewed && styles.storyRingViewed]}>
            <View style={styles.storyAvatarClip}>
              {group.profile.avatar_url
                ? <Image source={{ uri: group.profile.avatar_url }} style={styles.storyAvatar} />
                : <View style={[styles.storyAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="person" size={22} color="#555" />
                  </View>
              }
            </View>
          </View>
          <Text style={[styles.storyUsername, allViewed && { color: '#555' }]} numberOfLines={1}>
            {group.profile.username}
          </Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

// ─── Story Viewer ────────────────────────────────────────────────────────────
const StoryViewer: React.FC<{
  visible: boolean; groupIndex: number; storyGroups: any[];
  currentUserId: string; onClose: () => void; onViewed: (id: string) => void;
}> = ({ visible, groupIndex, storyGroups, currentUserId, onClose, onViewed }) => {
  const [gi, setGi] = useState(groupIndex);
  const [si, setSi] = useState(0);
  useEffect(() => { setGi(groupIndex); setSi(0); }, [groupIndex]);
  const group = storyGroups[gi];
  if (!group) return null;
  const story = group.stories[si];
  if (!story) return null;
  useEffect(() => {
    markStoryViewed(story.id, currentUserId).catch(() => {});
    onViewed(story.id);
  }, [story.id]);
  const next = () => {
    if (si < group.stories.length - 1) { setSi(si + 1); return; }
    if (gi < storyGroups.length - 1) { setGi(gi + 1); setSi(0); return; }
    onClose();
  };
  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.storyViewerBg}>
        <Image source={{ uri: story.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.storyViewerHeader}>
          <View style={styles.storyViewerUser}>
            {group.profile.avatar_url
              ? <Image source={{ uri: group.profile.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#fff' }} />
              : <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#222' }} />
            }
            <View style={{ marginLeft: 8 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>{group.profile.username}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{timeAgo(story.created_at)}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        {story.caption ? (
          <View style={styles.storyCaption}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{story.caption}</Text>
          </View>
        ) : null}
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={next} />
      </View>
    </Modal>
  );
};

// ─── Feed Post ───────────────────────────────────────────────────────────────
const FeedPost: React.FC<{
  post: any;
  currentUserId: string;
  isLiked: boolean;
  isSaved: boolean;
  onCommentCountChange?: (postId: string, delta: number) => void;
}> = ({ post, currentUserId, isLiked: initLiked, isSaved: initSaved, onCommentCountChange }) => {
  const [liked, setLiked] = useState(initLiked);
  const [likes, setLikes] = useState(post.likes_count ?? 0);
  const [saved, setSaved] = useState(initSaved);
  const [commentCount, setCommentCount] = useState(post.comments_count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const { medium, success, selection } = useHaptics();

  useEffect(() => {
    if (currentUserId && post.id) recordImpression(post.id, currentUserId).catch(() => {});
  }, [post.id, currentUserId]);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n: number) => next ? n + 1 : n - 1);
    if (next) {
      await medium();
      Animated.sequence([
        Animated.spring(heartScale, { toValue: 1.35, useNativeDriver: true, tension: 200, friction: 5 }),
        Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 5 }),
      ]).start();
    } else { await selection(); }
    try {
      if (next) await likePost(post.id, currentUserId);
      else await unlikePost(post.id, currentUserId);
    } catch { setLiked(!next); setLikes((n: number) => next ? n - 1 : n + 1); }
  };

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    if (next) await success(); else await selection();
    try {
      if (next) await savePost(post.id, currentUserId);
      else await unsavePost(post.id, currentUserId);
    } catch { setSaved(!next); }
  };

  const handleCommentChange = (delta: number) => {
    setCommentCount((n: number) => Math.max(0, n + delta));
    onCommentCountChange?.(post.id, delta);
  };

  const profile = post.profiles;

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.postUserRow}>
          <View style={styles.avatarRing}>
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={styles.postAvatar} />
              : <View style={[styles.postAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={18} color="#555" />
                </View>
            }
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.postUsername}>{profile?.username ?? 'user'}</Text>
              {profile?.is_verified && <VerifiedBadge type={profile.verification_type} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {post.location && (
                <><Ionicons name="location-outline" size={10} color="rgba(255,255,255,0.35)" /><Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{post.location} · </Text></>
              )}
              <Text style={styles.postMeta}>{profile?.major ? `${profile.major} · ` : ''}{timeAgo(post.created_at)}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={{ padding: 4 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {post.type !== 'thread' && post.media_url ? (
        <View>
          <Image source={{ uri: post.media_url }} style={[styles.postMedia, { width }]} resizeMode="cover" />
          {post.type === 'video' && (
            <View style={[StyleSheet.absoluteFill as any, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
              <Ionicons name="play-circle" size={56} color="rgba(255,255,255,0.8)" />
            </View>
          )}
        </View>
      ) : (
        post.caption ? null : (
          <View style={styles.threadBadge}>
            <Ionicons name="chatbubbles-outline" size={12} color="rgba(255,255,255,0.4)" />
            <Text style={styles.threadLabel}>Thread</Text>
          </View>
        )
      )}

      {/* Song banner */}
      {post.song && (
        <View style={styles.songBanner}>
          <Ionicons name="musical-notes" size={13} color="#f43f5e" />
          <Text style={styles.songBannerText}>{post.song}</Text>
        </View>
      )}

      <View style={styles.postActions}>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <TouchableOpacity onPress={toggleLike} style={styles.actionBtn}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? '#ef4444' : '#fff'} />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(true)}>
            <Ionicons name="chatbubble-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}><Ionicons name="repeat" size={24} color="#fff" /></TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}><Ionicons name="paper-plane-outline" size={23} color="#fff" /></TouchableOpacity>
        </View>
        <TouchableOpacity onPress={toggleSave} style={styles.actionBtn}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? '#fbbf24' : '#fff'} />
        </TouchableOpacity>
      </View>

      <View style={styles.postInfo}>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 3 }}>
          <Text style={styles.likesText}>{fmtCount(likes)} likes</Text>
          {commentCount > 0 && (
            <TouchableOpacity onPress={() => setShowComments(true)}>
              <Text style={[styles.likesText, { color: 'rgba(255,255,255,0.5)', fontWeight: '400' }]}>
                {fmtCount(commentCount)} comments
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {post.caption ? (
          <Text style={styles.captionText} numberOfLines={3}>
            <Text style={styles.postUsername}>{profile?.username ?? 'user'} </Text>
            {post.caption}
          </Text>
        ) : null}
        {post.tagged_users?.length > 0 && (
          <Text style={styles.taggedText}>with {post.tagged_users.map((u: string) => `@${u}`).join(', ')}</Text>
        )}
        {post.hashtags?.length > 0 && (
          <Text style={styles.hashtagText}>{post.hashtags.join(' ')}</Text>
        )}
        <Text style={styles.timeText}>{timeAgo(post.created_at)}</Text>
      </View>

      <CommentSheet
        visible={showComments}
        targetId={post.id}
        targetType="post"
        currentUserId={currentUserId}
        onClose={() => setShowComments(false)}
        onCountChange={handleCommentChange}
      />
    </View>
  );
};

// ─── Feed Screen ──────────────────────────────────────────────────────────────
interface FeedScreenProps {
  refreshKey?: number;
  onCreateStory?: () => void;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({ refreshKey = 0, onCreateStory }) => {
  const insets = useSafeAreaInsets();
  const [storyIdx, setStoryIdx] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<any[]>([]);
  const [storyGroups, setStoryGroups] = useState<any[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentProfile, setCurrentProfile] = useState<any>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const headerVisible = useRef(new Animated.Value(1)).current;
  const HEADER_HEIGHT = insets.top + 48;

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (e: any) => {
        const y = e.nativeEvent.contentOffset.y;
        const diff = y - lastScrollY.current;
        if (diff > 8 && y > HEADER_HEIGHT) {
          Animated.timing(headerVisible, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        } else if (diff < -5) {
          Animated.timing(headerVisible, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        }
        lastScrollY.current = y;
      },
    }
  );

  const headerTranslateY = headerVisible.interpolate({
    inputRange: [0, 1],
    outputRange: [-HEADER_HEIGHT, 0],
  });

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const [postsData, storiesData, likedData, savedData, viewedData, prof] = await Promise.all([
        getPersonalizedFeed(user.id),
        getActiveStories(),
        getLikedPostIds(user.id),
        getSavedPostIds(user.id),
        getViewedStoryIds(user.id),
        supabase.from('profiles').select('*').eq('id', user.id).single().then(r => r.data),
      ]);
      setCurrentProfile(prof);
      setPosts(postsData);
      setStoryGroups(storiesData);
      setLikedIds(new Set(likedData));
      setSavedIds(new Set(savedData));
      setViewedIds(viewedData);
    } catch (e) {
      console.error('Feed load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshKey > 0) load(); }, [refreshKey]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleYourStory = async () => {
    if (onCreateStory) { onCreateStory(); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to add a story.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0] && currentUserId) {
      try {
        await createStory(currentUserId, result.assets[0].uri);
        load();
        Alert.alert('Story posted!', 'Your story is live for 24 hours.');
      } catch (e: any) {
        Alert.alert('Error', e.message ?? 'Could not post story.');
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <Animated.View style={[styles.topBar, { paddingTop: insets.top + 6, transform: [{ translateY: headerTranslateY }] }]}>
        <Text style={styles.topBarLogo}>UniGram</Text>
        <TouchableOpacity>
          <Ionicons name="notifications-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      <FlatList
        data={loading ? [] : posts}
        keyExtractor={p => p.id}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <>
            <View style={{ height: HEADER_HEIGHT }} />
            {loading ? <StorySkeleton /> : (
              <StoryBar
                storyGroups={storyGroups}
                currentProfile={currentProfile}
                viewedIds={viewedIds}
                onStoryPress={i => setStoryIdx(i)}
                onYourStoryPress={handleYourStory}
              />
            )}
            {loading && <><FeedPostSkeleton /><FeedPostSkeleton /></>}
          </>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Ionicons name="image-outline" size={48} color="#333" />
              <Text style={{ color: '#555', marginTop: 12, fontSize: 15 }}>Follow people to see their posts!</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <FeedPost
            post={item}
            currentUserId={currentUserId}
            isLiked={likedIds.has(item.id)}
            isSaved={savedIds.has(item.id)}
            onCommentCountChange={(postId, delta) => {
              setPosts(prev => prev.map(p => p.id === postId
                ? { ...p, comments_count: Math.max(0, (p.comments_count ?? 0) + delta) }
                : p
              ));
            }}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" progressViewOffset={HEADER_HEIGHT} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {storyIdx !== null && (
        <StoryViewer
          visible
          groupIndex={storyIdx}
          storyGroups={storyGroups}
          currentUserId={currentUserId}
          onClose={() => setStoryIdx(null)}
          onViewed={id => setViewedIds(prev => [...prev, id])}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
    backgroundColor: '#000',
  },
  topBarLogo: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },

  storyScroll: { paddingVertical: 10 },
  storyItem: { alignItems: 'center', gap: 4, width: 70 },
  storyRing: { width: 66, height: 66, borderRadius: 33, padding: 2, borderWidth: 2.5, borderColor: '#ff6b35' },
  storyRingViewed: { borderColor: 'rgba(255,255,255,0.15)' },
  storyRingOwn: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  storyAvatarClip: { width: 62, height: 62, borderRadius: 31, overflow: 'hidden' },
  storyAvatar: { width: 62, height: 62, borderRadius: 31 },
  storyAddBtn: {
    position: 'absolute', bottom: -3, right: -3,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#000', zIndex: 10,
  },
  storyUsername: { fontSize: 10, color: 'rgba(255,255,255,0.7)', maxWidth: 64, textAlign: 'center' },

  storyViewerBg: { flex: 1, backgroundColor: '#000' },
  storyViewerHeader: { position: 'absolute', top: 50, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storyViewerUser: { flexDirection: 'row', alignItems: 'center' },
  storyCaption: { position: 'absolute', bottom: 100, left: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 12 },

  postCard: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', marginBottom: 4 },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  postUserRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarRing: { width: 42, height: 42, borderRadius: 21, padding: 2, backgroundColor: '#ff6b35', overflow: 'hidden' },
  postAvatar: { width: 38, height: 38, borderRadius: 19 },
  postUsername: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  postMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  postMedia: { height: 360, backgroundColor: '#111' },
  songBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'rgba(244,63,94,0.08)' },
  songBannerText: { fontSize: 12, color: '#f43f5e' },
  threadBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 6 },
  threadLabel: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  postActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6 },
  actionBtn: { padding: 6 },
  postInfo: { paddingHorizontal: 14, paddingBottom: 12 },
  likesText: { fontSize: 13, fontWeight: 'bold', color: '#fff', marginBottom: 3 },
  captionText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18, marginBottom: 4 },
  taggedText: { fontSize: 11, color: '#818cf8', marginBottom: 3 },
  hashtagText: { fontSize: 12, color: '#818cf8', marginBottom: 3 },
  timeText: { fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1 },
});
