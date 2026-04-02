import React, { useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, Modal, TextInput, FlatList,
  StatusBar, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CURRENT_USER, MOCK_POSTS, MOCK_STORIES } from '../data/mockData';
import { Post, Story } from '../data/types';
import { VerifiedBadge } from '../components/VerifiedBadge';

const { width } = Dimensions.get('window');

// ─── Story Bar ───────────────────────────────────────────────────────────────
const StoryBar: React.FC<{ onStoryPress: (idx: number) => void }> = ({ onStoryPress }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storyScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
    {/* Your story */}
    <TouchableOpacity style={styles.storyItem}>
      <View style={styles.storyRingOwn}>
        <Image source={{ uri: CURRENT_USER.avatar }} style={styles.storyAvatar} />
        <View style={styles.storyAddBtn}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>+</Text>
        </View>
      </View>
      <Text style={styles.storyUsername} numberOfLines={1}>Your Story</Text>
    </TouchableOpacity>
    {/* Others */}
    {MOCK_STORIES.map((story, i) => (
      <TouchableOpacity key={story.id} style={styles.storyItem} onPress={() => onStoryPress(i)}>
        <View style={[styles.storyRing, story.viewed && styles.storyRingViewed]}>
          <Image source={{ uri: story.user.avatar }} style={styles.storyAvatar} />
        </View>
        <Text style={[styles.storyUsername, story.viewed && { color: '#555' }]} numberOfLines={1}>{story.user.username}</Text>
      </TouchableOpacity>
    ))}
  </ScrollView>
);

// ─── Story Viewer ─────────────────────────────────────────────────────────────
const StoryViewer: React.FC<{ visible: boolean; index: number; onClose: () => void }> = ({ visible, index, onClose }) => {
  const [cur, setCur] = useState(index);
  const story = MOCK_STORIES[cur];
  if (!story) return null;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.storyViewerBg}>
        <Image source={{ uri: story.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={StyleSheet.absoluteFill} />
        <View style={styles.storyViewerHeader}>
          <View style={styles.storyViewerUser}>
            <Image source={{ uri: story.user.avatar }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#fff' }} />
            <View style={{ marginLeft: 8 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>{story.user.username}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{story.timestamp}</Text>
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
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => cur < MOCK_STORIES.length - 1 ? setCur(cur + 1) : onClose()} />
      </View>
    </Modal>
  );
};

// ─── Feed Post ────────────────────────────────────────────────────────────────
const FeedPost: React.FC<{ post: Post }> = ({ post }) => {
  const [liked, setLiked] = useState(post.isLiked || false);
  const [likes, setLikes] = useState(post.likes);
  const [saved, setSaved] = useState(post.isSaved || false);
  const [reposted, setReposted] = useState(false);
  const [reposts, setReposts] = useState(post.reposts);

  const toggleLike = () => {
    setLiked(p => !p);
    setLikes(p => liked ? p - 1 : p + 1);
  };
  const toggleRepost = () => {
    setReposted(p => !p);
    setReposts(p => reposted ? p - 1 : p + 1);
  };

  return (
    <View style={styles.postCard}>
      {/* Header */}
      <View style={styles.postHeader}>
        <View style={styles.postUserRow}>
          <View style={styles.avatarRing}>
            <Image source={{ uri: post.user.avatar }} style={styles.postAvatar} />
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.postUsername}>{post.user.username}</Text>
              {post.user.verified && <VerifiedBadge type={post.user.verificationType} />}
            </View>
            <Text style={styles.postMeta}>{post.user.major !== 'Club' ? `${post.user.major} · ` : ''}{post.timestamp}</Text>
          </View>
        </View>
        <TouchableOpacity style={{ padding: 4 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {/* Media */}
      {post.type !== 'thread' && post.mediaUrl ? (
        <Image source={{ uri: post.mediaUrl }} style={[styles.postMedia, { width }]} resizeMode="cover" />
      ) : (
        <View style={styles.threadBadge}>
          <Ionicons name="chatbubbles-outline" size={12} color="rgba(255,255,255,0.4)" />
          <Text style={styles.threadLabel}>Thread</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.postActions}>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <TouchableOpacity onPress={toggleLike} style={styles.actionBtn}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? '#ef4444' : '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="chatbubble-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleRepost} style={styles.actionBtn}>
            <Ionicons name="repeat" size={24} color={reposted ? '#22c55e' : '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="paper-plane-outline" size={23} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setSaved(p => !p)} style={styles.actionBtn}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? '#fbbf24' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Stats & caption */}
      <View style={styles.postInfo}>
        <Text style={styles.likesText}>{likes.toLocaleString()} likes</Text>
        {reposts > 0 && (
          <Text style={[styles.metaStat, reposted && { color: '#22c55e' }]}>
            <Ionicons name="repeat" size={11} /> {reposts.toLocaleString()} reposts
          </Text>
        )}
        <Text style={styles.captionText} numberOfLines={3}>
          <Text style={styles.postUsername}>{post.user.username} </Text>
          {post.caption}
        </Text>
        {post.hashtags && (
          <Text style={styles.hashtagText}>{post.hashtags.join(' ')}</Text>
        )}
        <Text style={styles.timeText}>{post.timestamp}</Text>
      </View>
    </View>
  );
};

// ─── Feed Screen ──────────────────────────────────────────────────────────────
export const FeedScreen: React.FC = () => {
  const [storyIdx, setStoryIdx] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState(MOCK_POSTS);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <FlatList
        data={posts}
        keyExtractor={p => p.id}
        ListHeaderComponent={
          <StoryBar onStoryPress={i => setStoryIdx(i)} />
        }
        renderItem={({ item }) => <FeedPost post={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
      />
      {storyIdx !== null && (
        <StoryViewer visible={true} index={storyIdx} onClose={() => setStoryIdx(null)} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  // Story
  storyScroll: { paddingVertical: 10 },
  storyItem: { alignItems: 'center', gap: 4, width: 70 },
  storyRing: { width: 66, height: 66, borderRadius: 33, padding: 2, borderWidth: 2.5, borderColor: '#ff6b35', backgroundColor: '#ff6b35' },
  storyRingViewed: { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.15)' },
  storyRingOwn: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)', position: 'relative' },
  storyAvatar: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: '#000' },
  storyAddBtn: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#000' },
  storyUsername: { fontSize: 10, color: 'rgba(255,255,255,0.7)', maxWidth: 64, textAlign: 'center' },
  // Story Viewer
  storyViewerBg: { flex: 1, backgroundColor: '#000' },
  storyViewerHeader: { position: 'absolute', top: 50, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storyViewerUser: { flexDirection: 'row', alignItems: 'center' },
  storyCaption: { position: 'absolute', bottom: 100, left: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 12 },
  // Post
  postCard: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', marginBottom: 4 },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  postUserRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarRing: { width: 42, height: 42, borderRadius: 21, padding: 2, backgroundColor: '#ff6b35' },
  postAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#000' },
  postUsername: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  postMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  postMedia: { height: 360, backgroundColor: '#111' },
  threadBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 6 },
  threadLabel: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  postActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6 },
  actionBtn: { padding: 6 },
  postInfo: { paddingHorizontal: 14, paddingBottom: 12 },
  likesText: { fontSize: 13, fontWeight: 'bold', color: '#fff', marginBottom: 3 },
  metaStat: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 },
  captionText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18, marginBottom: 4 },
  hashtagText: { fontSize: 12, color: '#818cf8', marginBottom: 3 },
  timeText: { fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1 },
});
