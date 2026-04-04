import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, Modal, FlatList,
  StatusBar, RefreshControl, Animated, Alert, Share,
  TouchableWithoutFeedback, ActivityIndicator, DeviceEventEmitter,
  TextInput, InteractionManager, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CachedImage } from '../components/CachedImage';
import { FeedPostSkeleton, StorySkeleton } from '../components/Skeleton';
import { CommentSheet } from '../components/CommentSheet';
import { ShareSheet } from '../components/ShareSheet';
import { likePost, unlikePost, savePost, unsavePost, getLikedPostIds, getSavedPostIds, deletePost, reportContent } from '../services/posts';
import { PostOptionsSheet } from '../components/PostOptionsSheet';
import { getActiveStories, markStoryViewed, getViewedStoryIds, createStory, getStoryStats, likeStory, unlikeStory, getStoryViewers, deleteStory } from '../services/stories';
import { getPersonalizedFeed, recordImpression } from '../services/algorithm';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import { useSocialLike } from '../hooks/useSocialSync';

const { width } = Dimensions.get('window');

function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

let cachedFeedPosts: any[] = [];
let cachedStoryGroups: any[] = [];
let cachedLikedIds: Set<string> | null = null;
let cachedSavedIds: Set<string> | null = null;
let cachedCurrentProfile: any = null;

// ─── Story Bar ────────────────────────────────────────────────────────────────
const StoryBar: React.FC<{
  storyGroups: any[];
  currentProfile: any;
  viewedIds: string[];
  onStoryPress: (idx: number) => void;
  onYourStoryPress: () => void;
}> = ({ storyGroups, currentProfile, viewedIds, onStoryPress, onYourStoryPress }) => {
  const ownGroupIdx = storyGroups.findIndex(g => g.profile.id === currentProfile?.id);
  const ownGroup = ownGroupIdx !== -1 ? storyGroups[ownGroupIdx] : null;
  const filteredGroups = storyGroups.filter((_, idx) => idx !== ownGroupIdx);
  const hasOwnStories = ownGroup && ownGroup.stories.length > 0;
  
  const thumbUri = hasOwnStories ? ownGroup.stories[0].media_url : currentProfile?.avatar_url;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={styles.storyScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
      
      <TouchableOpacity 
        style={styles.storyItem} 
        onPress={() => hasOwnStories ? onStoryPress(ownGroupIdx) : onYourStoryPress()}
      >
        <View style={[styles.storyRing, hasOwnStories && styles.storyRingOwnActive]}>
          <View style={styles.storyAvatarClip}>
            {thumbUri
              ? <Image source={{ uri: thumbUri }} style={styles.storyAvatar} />
              : <View style={[styles.storyAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={22} color="#555" />
                </View>}
          </View>
          <TouchableOpacity 
            style={styles.storyPlusOverlay} 
            onPress={(e) => { e.stopPropagation(); onYourStoryPress(); }}
          >
            <Ionicons name="add" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.storyUsername} numberOfLines={1}>Your Story</Text>
      </TouchableOpacity>

      {filteredGroups.map((group, i) => {
        const globalIdx = storyGroups.indexOf(group);
        const allViewed = group.stories.every((s: any) => viewedIds.includes(s.id));
        return (
          <TouchableOpacity key={group.profile.id} style={styles.storyItem} onPress={() => onStoryPress(globalIdx)}>
            <View style={[styles.storyRing, allViewed && styles.storyRingViewed]}>
              <View style={styles.storyAvatarClip}>
                {group.profile.avatar_url
                  ? <CachedImage uri={group.profile.avatar_url} style={styles.storyAvatar} />
                  : <View style={[styles.storyAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="person" size={22} color="#555" />
                    </View>}
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
};

// ─── Background Upload Indicator ──────────────────────────────────────────────
const BackgroundUploadIndicator: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | null>(null);
  const [type, setType] = useState<string>('');
  const haptics = useHaptics();
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('upload_status', (data) => {
      setStatus(data.status);
      setType(data.type.charAt(0).toUpperCase() + data.type.slice(1));
      
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8
      }).start();

      if (data.status === 'success') {
        haptics.success();
        setTimeout(dismiss, 3000);
      } else if (data.status === 'error') {
        haptics.error();
        setTimeout(dismiss, 4000);
      }
    });
    return () => sub.remove();
  }, [slideAnim]);

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true
    }).start(() => setStatus(null));
  };

  if (!status) return null;

  const config = {
    loading: { icon: 'cloud-upload', color: '#4f46e5', text: `Adding ${type}...` },
    success: { icon: 'checkmark-circle', color: '#10b981', text: `${type} posted!` },
    error: { icon: 'alert-circle', color: '#ef4444', text: `${type} upload failed` }
  }[status];

  return (
    <Animated.View style={[bi.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={[bi.banner, { borderLeftColor: config.color }]}>
        <Ionicons name={status === 'loading' ? 'sync' : config.icon as any} size={20} color={config.color} />
        <Text style={bi.text}>{config.text}</Text>
        {status === 'loading' && <ActivityIndicator size="small" color={config.color} style={{ marginLeft: 'auto' }} />}
      </View>
    </Animated.View>
  );
};

const bi = StyleSheet.create({
  container: {
    position: 'absolute', top: 100, left: 16, right: 16, zIndex: 1000,
  },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1a1a1a', padding: 14, borderRadius: 12,
    borderLeftWidth: 4, elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  text: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

// ─── Viewers Sheet ────────────────────────────────────────────────────────────
const ViewersSheet: React.FC<{
  visible: boolean;
  storyId: string;
  onClose: () => void;
}> = ({ visible, storyId, onClose }) => {
  const [viewers, setViewers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible && storyId) {
      setLoading(true);
      getStoryViewers(storyId).then(data => {
        setViewers(data);
        setLoading(false);
      }).catch(err => {
        console.error('Error fetching viewers', err);
        setLoading(false);
      });
    }
  }, [visible, storyId]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
       <TouchableWithoutFeedback onPress={onClose}>
        <View style={vv.overlay} />
      </TouchableWithoutFeedback>
      <View style={vv.container}>
        <View style={vv.header}>
          <View style={vv.handle} />
          <Text style={vv.title}>Viewers</Text>
        </View>
        <ScrollView style={vv.scroll}>
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
          ) : viewers.length === 0 ? (
            <View style={vv.empty}>
              <Text style={vv.emptyText}>No views yet</Text>
            </View>
          ) : (
            viewers.map((v, i) => (
              <View key={i} style={vv.item}>
                {v.avatar_url ? (
                  <Image source={{ uri: v.avatar_url }} style={vv.avatar} />
                ) : (
                  <View style={[vv.avatar, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="person" size={20} color="#555" />
                  </View>
                )}
                <View style={vv.info}>
                  <Text style={vv.username}>{v.username}</Text>
                  <Text style={vv.time}>{timeAgo(v.viewed_at)}</Text>
                </View>
                {v.reaction && (
                  <View style={vv.reactionBadge}>
                    <Text style={vv.reactionEmoji}>{v.reaction}</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const STORY_DURATION = 5000;

const StoryViewer: React.FC<{
  visible: boolean;
  groupIndex: number;
  storyGroups: any[];
  currentUserId: string;
  onClose: () => void;
  onViewed: (id: string) => void;
  onDeleted?: (id: string) => void;
}> = ({ visible, groupIndex, storyGroups, currentUserId, onClose, onViewed, onDeleted }) => {
  const [gi, setGi] = useState(groupIndex);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [reply, setReply] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [stats, setStats] = useState({ views: 0, likes: 0, isLiked: false });
  const progress = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef<Animated.CompositeAnimation | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (visible) { setGi(groupIndex); setSi(0); } }, [groupIndex, visible]);

  const group = storyGroups[gi];
  const story = group?.stories[si];

  const fetchStats = async () => {
    if (!story) return;
    const s = await getStoryStats(story.id);
    setStats(s);
  };

  const toggleLike = async (emoji?: string) => {
    if (!story || !currentUserId) return;
    const reaction = emoji || '❤️';
    try {
      if (!emoji && stats.isLiked) {
        await unlikeStory(story.id, currentUserId);
        setStats(ps => ({ ...ps, isLiked: false, likes: Math.max(0, ps.likes - 1) }));
      } else {
        await likeStory(story.id, currentUserId, reaction);
        setStats(ps => ({ ...ps, isLiked: true, likes: emoji ? ps.likes : (ps.isLiked ? ps.likes : ps.likes + 1) }));
        if (emoji) {
          Alert.alert('Sent!', `${emoji} sent to ${group.profile.username}`);
          setPaused(false);
          setIsTyping(false);
        }
      }
    } catch (e) {
      console.error('Like toggle error', e);
    }
  };

  const submitReply = async () => {
    if (!reply.trim() || !story) return;
    try {
      // In a real app, this would create a record in the 'messages' table
      // For now, we simulate a success notification
      Alert.alert('Sent!', `Reply sent to ${group.profile.username}`);
      setReply('');
      setIsTyping(false);
      setPaused(false);
    } catch (e) {
      Alert.alert('Error', 'Could not send reply.');
    }
  };

  const startProgress = useCallback(() => {
    progress.setValue(0);
    progressAnim.current?.stop();
    progressAnim.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    progressAnim.current.start(({ finished }) => {
      if (finished) advance();
    });
  }, [gi, si]);

  useEffect(() => {
    if (!visible || !story) return;
    markStoryViewed(story.id, currentUserId).catch(() => {});
    onViewed(story.id);
    fetchStats();
    startProgress();
    return () => { progressAnim.current?.stop(); };
  }, [story?.id, visible]);

  useEffect(() => {
    if (paused || showViewers || isTyping) progressAnim.current?.stop();
    else if (story) startProgress();
  }, [paused, showViewers, isTyping]);

  const advance = () => {
    if (!group) return;
    if (si < group.stories.length - 1) { setSi(s => s + 1); return; }
    if (gi < storyGroups.length - 1) { setGi(g => g + 1); setSi(0); return; }
    onClose();
  };

  const retreat = () => {
    if (si > 0) { setSi(s => s - 1); return; }
    if (gi > 0) { setGi(g => g - 1); setSi(0); return; }
  };

  const showStoryOptions = () => {
    setPaused(true);
    Alert.alert('Story Options', undefined, [
      {
        text: 'Delete story',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete story?', 'This will permanently remove this story.', [
            { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
            { 
              text: 'Delete', 
              style: 'destructive', 
              onPress: async () => {
                try {
                  await deleteStory(story.id, currentUserId);
                  onDeleted?.(story.id);
                } catch {
                  Alert.alert('Error', 'Could not delete story.');
                  setPaused(false);
                }
              }
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
    ]);
  };

  if (!visible || !group || !story) return null;

  const isOwner = group.profile.id === currentUserId;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={sv.bg}>
        <StatusBar hidden />
        <Image source={{ uri: story.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={sv.topGrad} />
        <View style={sv.bottomGrad} />

        <View style={[sv.progressRow, { top: insets.top + 8 }]}>
          {group.stories.map((_: any, idx: number) => (
            <View key={idx} style={sv.progressTrack}>
              <Animated.View
                style={[
                  sv.progressFill,
                  {
                    width: idx < si ? '100%'
                      : idx === si
                        ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                        : '0%',
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={[sv.header, { top: insets.top + 20 }]}>
          <View style={sv.headerLeft}>
            {group.profile.avatar_url
              ? <Image source={{ uri: group.profile.avatar_url }} style={sv.avatar} />
              : <View style={[sv.avatar, { backgroundColor: '#333' }]} />}
            <View style={{ marginLeft: 8 }}>
              <Text style={sv.username}>{group.profile.username}</Text>
              <Text style={sv.time}>{timeAgo(story.created_at)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {isOwner && (
              <TouchableOpacity onPress={showStoryOptions} style={sv.iconBtn}>
                <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setPaused(p => !p)} style={sv.iconBtn}>
              <Ionicons name={paused ? 'play' : 'pause'} size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={sv.iconBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {story.caption ? (
          <View style={sv.captionBox}>
            <Text style={sv.captionText}>{story.caption}</Text>
          </View>
        ) : null}

        <View style={sv.tapRow} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={retreat} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback onPress={advance} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={{ flex: 2 }} />
          </TouchableWithoutFeedback>
        </View>

        {isTyping && (
          <View style={[sv.reactionOverlay, { bottom: insets.bottom + 80 }]}>
            {['😂', '😮', '😍', '😢', '🔥', '👏'].map(emoji => (
              <TouchableOpacity 
                key={emoji} 
                style={sv.reactionItem} 
                onPress={() => toggleLike(emoji)}
              >
                <Text style={{ fontSize: 28 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[sv.replyRow, { paddingBottom: insets.bottom + 12 }]}>
          {isOwner ? (
            <TouchableOpacity style={sv.viewersBtn} onPress={() => setShowViewers(true)}>
              <View style={sv.viewerAvatars}>
                 <Ionicons name="eye-outline" size={16} color="#fff" />
              </View>
              <Text style={sv.viewersCount}>{stats.views} viewers</Text>
            </TouchableOpacity>
          ) : (
            <View style={[sv.replyInput, isTyping && sv.replyInputActive]}>
              <TextInput
                style={sv.replyTextInput}
                placeholder={`Reply to ${group.profile.username}…`}
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={reply}
                onChangeText={setReply}
                onFocus={() => { setIsTyping(true); setPaused(true); }}
                onBlur={() => { if (!reply) { setIsTyping(false); setPaused(false); } }}
                onSubmitEditing={submitReply}
                returnKeyType="send"
              />
            </View>
          )}
          
          {!isTyping && (
            <>
              <TouchableOpacity style={sv.replyHeart} onPress={() => toggleLike()}>
                <Ionicons name={stats.isLiked ? "heart" : "heart-outline"} size={26} color={stats.isLiked ? "#ff3b30" : "#fff"} />
              </TouchableOpacity>
              <TouchableOpacity style={sv.replyShare}>
                <Ionicons name="paper-plane-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </>
          )}

          {isTyping && reply.trim().length > 0 && (
            <TouchableOpacity style={sv.sendBtn} onPress={submitReply}>
              <Text style={sv.sendBtnText}>Send</Text>
            </TouchableOpacity>
          )}
        </View>

        <ViewersSheet 
          visible={showViewers} 
          storyId={story.id} 
          onClose={() => setShowViewers(false)} 
        />
      </View>
    </Modal>
  );
};

// ─── Video Post ───────────────────────────────────────────────────────────────
const VideoPost: React.FC<{ uri: string; isMuted?: boolean; isActive?: boolean }> = ({ uri, isMuted, isActive }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = isMuted ?? false;
    if (isActive) p.play();
  });

  useEffect(() => {
    if (player) {
      player.muted = isMuted ?? false;
    }
  }, [player, isMuted]);

  useEffect(() => {
    if (!player) return;
    if (isActive) player.play();
    else player.pause();
  }, [player, isActive]);

  return (
    <View style={{ position: 'relative' }}>
      <VideoView
        player={player}
        style={[styles.postMedia, { width }]}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
};

// ─── Post Meta Cycler ─────────────────────────────────────────────────────────
const PostMetaCycler: React.FC<{ location?: string; song?: string }> = ({ location, song }) => {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const items = [location, song].filter(Boolean) as string[];

  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          setIndex(prev => (prev + 1) % items.length);
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        }
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <Animated.View style={{ opacity: fadeAnim, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons 
        name={items[index] === song ? "musical-note" : "location-outline"} 
        size={10} color="rgba(255,255,255,0.4)" 
      />
      <Text style={styles.postMeta} numberOfLines={1}>{items[index]}</Text>
    </Animated.View>
  );
};

// ─── Media Carousel ───────────────────────────────────────────────────────────
const MediaCarousel: React.FC<{
  mediaUrls: string[];
  type: string;
  onDoubleTap: () => void;
  onSingleTap: () => void;
  isMuted?: boolean;
  isActive?: boolean;
}> = ({ mediaUrls, type, onDoubleTap, onSingleTap, isMuted, isActive }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const lastTap = useRef(0);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onDoubleTap();
    } else {
      setTimeout(() => {
        if (Date.now() - lastTap.current >= 300) onSingleTap();
      }, 300);
    }
    lastTap.current = now;
  };

  return (
    <View>
      <FlatList
        data={mediaUrls}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={width}
        snapToAlignment="center"
        scrollEventThrottle={16}
        nestedScrollEnabled={true}
        onScroll={e => {
          const x = e.nativeEvent.contentOffset.x;
          setCurrentIdx(Math.round(x / width));
        }}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <TouchableWithoutFeedback onPress={handleTap}>
            <View style={{ width, height: 360 }}>
              {type === 'video' ? (
                <VideoPost uri={item} isMuted={isMuted} isActive={isActive && currentIdx === index} />
              ) : (
                <CachedImage uri={item} style={styles.postMedia} resizeMode="cover" />
              )}
            </View>
          </TouchableWithoutFeedback>
        )}
      />
      {mediaUrls.length > 1 && (
        <>
          <View style={styles.carouselIndicator}>
            <Text style={styles.indicatorText}>{currentIdx + 1}/{mediaUrls.length}</Text>
          </View>
          <View style={styles.dotContainer}>
            {mediaUrls.map((_, i) => (
              <View key={i} style={[styles.dot, currentIdx === i && styles.dotActive]} />
            ))}
          </View>
        </>
      )}
    </View>
  );
};

// ─── Full Video Modal (Reel-style) ───────────────────────────────────────────
const FullVideoModal: React.FC<{
  visible: boolean;
  uri: string;
  onClose: () => void;
}> = ({ visible, uri, onClose }) => {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.play();
  });

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <VideoView 
          player={player} 
          style={StyleSheet.absoluteFill} 
          contentFit="cover"
          nativeControls
        />
        <TouchableOpacity style={{ position: 'absolute', top: 50, left: 20 }} onPress={onClose}>
          <Ionicons name="chevron-back" size={30} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

// ─── Feed Post ────────────────────────────────────────────────────────────────
export const FeedPost: React.FC<{
  post: any;
  currentUserId: string;
  isLiked?: boolean;
  isSaved?: boolean;
  isActive?: boolean;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
  onCommentCountChange?: (postId: string, delta: number) => void;
  onDeleted?: (postId: string) => void;
}> = React.memo(({ post, currentUserId, isLiked: initLiked, isSaved: initSaved, isActive, isMuted, setIsMuted, onCommentCountChange, onDeleted }) => {
  const { liked, setLiked, count: likes, setCount: setLikes } = useSocialLike(post.id, 'POST', initLiked ?? false, post.likes_count ?? 0);
  const [saved, setSaved] = useState(initSaved);
  const [commentCount, setCommentCount] = useState(post.comments_count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [songLoading, setSongLoading] = useState(false);
  const [fullVideoUri, setFullVideoUri] = useState<string | null>(null);
  const [songPreviewUrl, setSongPreviewUrl] = useState<string | null>(null);
  const songPlayer = useAudioPlayer(songPreviewUrl ?? '', {
    loop: true,
  });

  useEffect(() => {
    if (songPlayer) {
      songPlayer.muted = isMuted;
      songPlayer.loop = true; // redundancy to ensure it stays looped
    }
  }, [songPlayer, isMuted]);

  useEffect(() => {
    if (isActive) {
      if (post.song) toggleSongPreview();
    } else {
      songPlayer.pause();
    }
  }, [isActive]);

  const toggleSongPreview = async () => {
    if (songPlayer.playing) {
      songPlayer.pause();
      return;
    }
    if (songLoading) return;

    if (!songPreviewUrl) {
      setSongLoading(true);
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(post.song)}&media=music&entity=song&limit=1`
        );
        const json = await res.json();
        const url = json.results?.[0]?.previewUrl ?? null;
        if (url) {
          setSongPreviewUrl(url);
        }
      } catch {
      } finally {
        setSongLoading(false);
      }
    }
    songPlayer.play();
  };

  const heartOverlayOpacity = useRef(new Animated.Value(0)).current;
  const heartOverlayScale = useRef(new Animated.Value(0.5)).current;
  const heartScale = useRef(new Animated.Value(1)).current;

  const lastTap = useRef(0);
  const { medium, success, selection } = useHaptics();

  useEffect(() => {
    if (currentUserId && post.id) recordImpression(post.id, currentUserId).catch(() => {});
  }, [post.id, currentUserId]);

  const bounceHeart = () => {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, tension: 200, friction: 5 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 5 }),
    ]).start();
  };

  const showHeartOverlay = () => {
    heartOverlayOpacity.setValue(1);
    heartOverlayScale.setValue(0.5);
    Animated.parallel([
      Animated.spring(heartOverlayScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }),
    ]).start();
    setTimeout(() => {
      Animated.timing(heartOverlayOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }, 600);
  };

  const doLike = async (forceLike?: boolean) => {
    const next = forceLike ?? !liked;
    if (liked === next) return;
    setLiked(next);
    setLikes((n: number) => next ? n + 1 : n - 1);
    bounceHeart();
    if (next) await medium();
    else await selection();
    try {
      if (next) await likePost(post.id, currentUserId);
      else await unlikePost(post.id, currentUserId);
    } catch {
      setLiked(!next);
      setLikes((n: number) => next ? n - 1 : n + 1);
    }
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

  const handleDeletePost = () => {
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        // Optimistic: remove from UI immediately
        onDeleted?.(post.id);
        deletePost(post.id, currentUserId).catch(() => {
          Alert.alert('Error', 'Could not delete post. Please refresh.');
        });
      }},
    ]);
  };

  const profile = post.profiles;

  return (
    <View style={styles.postCard}>
      {fullVideoUri && (
        <FullVideoModal visible uri={fullVideoUri} onClose={() => setFullVideoUri(null)} />
      )}

      <View style={styles.postHeader}>
        <View style={styles.postUserRow}>
          <View style={styles.avatarRing}>
            {profile?.avatar_url
              ? <CachedImage uri={profile.avatar_url} style={styles.postAvatar} />
              : <View style={[styles.postAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={18} color="#555" />
                </View>}
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.postUsername}>{profile?.username ?? 'user'}</Text>
              {profile?.is_verified && <VerifiedBadge type={profile.verification_type} />}
            </View>
            <PostMetaCycler location={post.location} song={post.song} />
            <Text style={styles.postMeta}>{profile?.major ? `${profile.major} · ` : ''}{timeAgo(post.created_at)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => setShowOptions(true)}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <PostOptionsSheet
        visible={showOptions}
        onClose={() => setShowOptions(false)}
        post={post}
        currentUserId={currentUserId}
        isSaved={saved}
        onSave={toggleSave}
        onDelete={handleDeletePost}
        onShare={() => {
          setShowOptions(false);
          Share.share({ message: `Check out this post on UniGram by @${post.profiles?.username ?? 'user'}:\n\n${post.caption ?? ''}` });
        }}
        onCopyLink={() => {
          setShowOptions(false);
          Alert.alert('Link Copied', 'Post link copied to clipboard.');
        }}
      />

      {post.type !== 'thread' && (post.media_url || (post.media_urls && post.media_urls.length > 0)) ? (
        <View>
          <MediaCarousel 
            mediaUrls={post.media_urls && post.media_urls.length > 0 ? post.media_urls : [post.media_url!]}
            type={post.type}
            onDoubleTap={() => {
              if (!liked) doLike(true);
              showHeartOverlay();
            }}
            onSingleTap={() => {
              if (post.type === 'video') {
                setFullVideoUri(post.media_url);
              } else {
                setIsMuted(!isMuted);
              }
            }}
            isMuted={isMuted}
            isActive={isActive}
          />
          
          {(post.type === 'video' || post.song) && (
            <TouchableOpacity 
              style={styles.muteOverlayBtn} 
              onPress={() => setIsMuted(!isMuted)}
              activeOpacity={0.8}
            >
              <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={16} color="#fff" />
            </TouchableOpacity>
          )}

          <Animated.View
            pointerEvents="none"
            style={[styles.heartOverlay, { opacity: heartOverlayOpacity, transform: [{ scale: heartOverlayScale }] }]}
          >
            <Ionicons name="heart" size={90} color="#fff" />
          </Animated.View>
        </View>
      ) : post.type === 'thread' ? (
        <View style={styles.threadBadge}>
          <Ionicons name="chatbubbles-outline" size={12} color="rgba(255,255,255,0.4)" />
          <Text style={styles.threadLabel}>Thread</Text>
        </View>
      ) : null}

      <View style={styles.postActions}>
        <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => doLike()} style={styles.actionBtn}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? '#ef4444' : '#fff'} />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(true)}>
            <Ionicons name="chatbubble-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionBtn}
            onPress={() => setShowShare(true)}
          >
            <Ionicons name="paper-plane-outline" size={23} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={toggleSave} style={styles.actionBtn}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? '#fbbf24' : '#fff'} />
        </TouchableOpacity>
      </View>

      <View style={styles.postInfo}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 3, flexWrap: 'wrap' }}>
          <Text style={styles.likesText}>{fmtCount(likes)} likes</Text>
          {commentCount > 0 && (
            <TouchableOpacity onPress={() => setShowComments(true)}>
              <Text style={[styles.likesText, { color: 'rgba(255,255,255,0.45)', fontWeight: '400' }]}>
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

      <ShareSheet
        visible={showShare}
        onClose={() => setShowShare(false)}
        content={{
          type: 'post',
          id: post.id,
          thumbnail: post.media_url,
          username: profile?.username,
        }}
      />
    </View>
  );
});

// ─── Feed Screen ──────────────────────────────────────────────────────────────
const FEED_PAGE = 12; // posts per page
const FEED_TTL = 2 * 60 * 1000; // 2 minutes before a background refresh

interface FeedScreenProps {
  refreshKey?: number;
  isVisible?: boolean;
  onCreateStory?: () => void;
  onNotifPress?: () => void;
  notifBadge?: number;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({ refreshKey = 0, isVisible = true, onCreateStory, onNotifPress, notifBadge = 0 }) => {
  const insets = useSafeAreaInsets();
  const [storyIdx, setStoryIdx] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(cachedFeedPosts.length === 0);
  const [posts, setPosts] = useState<any[]>(cachedFeedPosts);
  const [storyGroups, setStoryGroups] = useState<any[]>(cachedStoryGroups);
  const [likedIds, setLikedIds] = useState<Set<string>>(cachedLikedIds ?? new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(cachedSavedIds ?? new Set());
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentProfile, setCurrentProfile] = useState<any>(cachedCurrentProfile);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const lastLoadedRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActivePostId(viewableItems[0].key);
    }
  }).current;

  const lastScrollY = useRef(0);
  const headerVisible = useRef(new Animated.Value(1)).current;
  const HEADER_HEIGHT = insets.top + 48;

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    if (diff > 8 && y > HEADER_HEIGHT) {
      Animated.timing(headerVisible, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    } else if (diff < -5) {
      Animated.timing(headerVisible, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
    lastScrollY.current = y;
  };

  const headerTranslateY = headerVisible.interpolate({ inputRange: [0, 1], outputRange: [-HEADER_HEIGHT, 0] });

  const load = useCallback(async (isManualRefresh = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Fetch first page + supporting data in parallel
      const [postsData, storiesData, likedData, savedData, viewedData, prof] = await Promise.all([
        getPersonalizedFeed(user.id, FEED_PAGE, 0),
        getActiveStories(),
        getLikedPostIds(user.id),
        getSavedPostIds(user.id),
        getViewedStoryIds(user.id),
        supabase.from('profiles')
          .select('id, username, full_name, avatar_url, is_verified, verification_type')
          .eq('id', user.id).single().then(r => r.data),
      ]);

      setCurrentProfile(prof);
      setStoryGroups(storiesData);
      setLikedIds(new Set(likedData));
      setSavedIds(new Set(savedData));
      setViewedIds(viewedData);
      setHasMore(postsData.length === FEED_PAGE);
      pageRef.current = 0;
      lastLoadedRef.current = Date.now();

      if (cachedFeedPosts.length > 0 && !isManualRefresh) {
        // Stale-while-revalidate: merge without reordering visible posts
        setPosts(prev => {
          const map = new Map(prev.map((p: any) => [p.id, p]));
          postsData.forEach((p: any) => {
            if (map.has(p.id)) map.set(p.id, { ...map.get(p.id), ...p });
            else map.set(p.id, p); // new post at top handled below
          });
          // Prepend genuinely new posts
          const newOnes = postsData.filter((p: any) => !prev.find((pp: any) => pp.id === p.id));
          return [...newOnes, ...Array.from(map.values()).filter((p: any) => !newOnes.find((n: any) => n.id === p.id))];
        });
      } else {
        setPosts(postsData);
      }

      cachedFeedPosts = postsData;
      cachedStoryGroups = storiesData;
      cachedLikedIds = new Set(likedData);
      cachedSavedIds = new Set(savedData);
      cachedCurrentProfile = prof;
    } catch (e) {
      console.error('Feed load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const nextPage = pageRef.current + 1;
      const morePosts = await getPersonalizedFeed(user.id, FEED_PAGE, nextPage * FEED_PAGE);
      if (morePosts.length === 0) { setHasMore(false); return; }
      pageRef.current = nextPage;
      setHasMore(morePosts.length === FEED_PAGE);
      setPosts(prev => {
        const existing = new Set(prev.map((p: any) => p.id));
        return [...prev, ...morePosts.filter((p: any) => !existing.has(p.id))];
      });
    } catch (e) {
      console.error('loadMore error', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  useEffect(() => {
    // Defer first load until after tab-switch animations settle
    const task = InteractionManager.runAfterInteractions(() => { load(); });
    return () => task.cancel();
  }, [load]);

  // Background refresh when tab becomes visible and data is stale
  useEffect(() => {
    if (isVisible && lastLoadedRef.current > 0) {
      const age = Date.now() - lastLoadedRef.current;
      if (age > FEED_TTL) {
        load(); // silent background refresh, no spinner
      }
    }
  }, [isVisible]);

  // Refresh when app comes back to foreground (like IG does)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        const age = Date.now() - lastLoadedRef.current;
        if (age > FEED_TTL) load();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [load]);

  useEffect(() => { if (refreshKey > 0) { pageRef.current = 0; load(true); } }, [refreshKey]);

  const handleCommentCountChange = useCallback((postId: string, delta: number) => {
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, comments_count: Math.max(0, (p.comments_count ?? 0) + delta) }
      : p
    ));
  }, []);

  const handlePostDeleted = useCallback((postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    cachedFeedPosts = cachedFeedPosts.filter((p: any) => p.id !== postId);
  }, []);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleYourStory = async () => {
    if (onCreateStory) { onCreateStory(); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to add a story.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any, allowsEditing: true, aspect: [9, 16], quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0] && currentUserId) {
      const uri = result.assets[0].uri;
      // Optimistic: show temp story immediately in the story bar
      const tempId = 'temp-story-' + Date.now();
      setStoryGroups(prev => {
        const existing = prev.find(g => g.profile?.id === currentUserId);
        if (existing) return prev; // already has stories, skip temp
        return [{ profile: currentProfile, stories: [{ id: tempId, media_url: uri, _pending: true }] }, ...prev];
      });
      createStory(currentUserId, uri)
        .then(() => load())
        .catch((e: any) => {
          setStoryGroups(prev => prev.filter(g => !g.stories?.some((s: any) => s.id === tempId)));
          Alert.alert('Error', e.message ?? 'Could not post story.');
        });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <Animated.View style={[styles.topBar, { paddingTop: insets.top + 6, transform: [{ translateY: headerTranslateY }] }]}>
        <Text style={styles.topBarLogo}>UniGram</Text>
        <TouchableOpacity onPress={onNotifPress} style={{ position: 'relative' }}>
          <Ionicons name="notifications-outline" size={24} color="#fff" />
          {notifBadge > 0 && (
            <View style={styles.notifHeaderBadge}>
              <Text style={styles.notifHeaderBadgeText}>{notifBadge > 99 ? '99+' : notifBadge}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      <BackgroundUploadIndicator />

      <FlatList
        data={loading ? [] : posts}
        keyExtractor={p => p.id}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        windowSize={4}
        maxToRenderPerBatch={3}
        initialNumToRender={2}
        removeClippedSubviews={true}
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
        ListEmptyComponent={loading ? null : (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Ionicons name="image-outline" size={48} color="#333" />
            <Text style={{ color: '#555', marginTop: 12, fontSize: 15 }}>Follow people to see their posts!</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <FeedPost
            post={item}
            currentUserId={currentUserId}
            isLiked={likedIds.has(item.id)}
            isSaved={savedIds.has(item.id)}
            isActive={isVisible && activePostId === item.id}
            isMuted={isMuted}
            setIsMuted={setIsMuted}
            onCommentCountChange={handleCommentCountChange}
            onDeleted={handlePostDeleted}
          />
        )}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#6366f1" />
          </View>
        ) : null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" progressViewOffset={HEADER_HEIGHT} />
        }
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
          onViewed={id => setViewedIds(prev => {
            if (!prev.includes(id)) return [...prev, id];
            return prev;
          })}
          onDeleted={id => {
            setStoryGroups(prev => prev.map(g => ({
              ...g,
              stories: g.stories.filter((s: any) => s.id !== id)
            })).filter(g => g.stories.length > 0));
          }}
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8, backgroundColor: '#000',
  },
  topBarLogo: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  notifHeaderBadge: {
    position: 'absolute', top: -4, right: -6,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#000',
  },
  notifHeaderBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  storyScroll: { paddingVertical: 10 },
  storyItem: { alignItems: 'center', width: 72 },
  storyRing: { width: 68, height: 68, borderRadius: 34, padding: 2.5, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  storyRingOwnActive: { 
    borderWidth: 2, 
    borderColor: '#ff6b35', 
    padding: 2
  },
  storyRingViewed: { opacity: 0.5 },
  storyAvatarClip: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', backgroundColor: '#333' },
  storyAvatar: { width: '100%', height: '100%' },
  storyPlusOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0095f6',
    borderWidth: 2,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  storyUsername: { fontSize: 10, color: 'rgba(255,255,255,0.7)', maxWidth: 64, textAlign: 'center', marginTop: 4 },

  postCard: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', marginBottom: 4 },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  postUserRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarRing: { width: 42, height: 42, borderRadius: 21, padding: 2, backgroundColor: '#ff6b35', overflow: 'hidden' },
  postAvatar: { width: 38, height: 38, borderRadius: 19 },
  postUsername: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  postMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  postMedia: { height: 360, backgroundColor: '#111' },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  songBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(244,63,94,0.08)' },
  songBannerText: { fontSize: 12, color: '#f43f5e', flex: 1 },
  songBannerHint: { fontSize: 10, color: 'rgba(244,63,94,0.5)' },
  threadBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 6 },
  threadLabel: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  postActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6 },
  actionBtn: { padding: 6 },
  postInfo: { paddingHorizontal: 14, paddingBottom: 14 },
  likesText: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  captionText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18, marginBottom: 4, marginTop: 2 },
  taggedText: { fontSize: 11, color: '#818cf8', marginBottom: 3 },
  timeText: { fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  carouselIndicator: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  indicatorText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  dotContainer: {
    position: 'absolute', bottom: 12, width: '100%',
    flexDirection: 'row', justifyContent: 'center', gap: 4,
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff', width: 12 },
  muteOverlayBtn: {
    position: 'absolute', bottom: 40, right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)', width: 28, height: 28,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
});

const sv = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 140, backgroundColor: 'rgba(0,0,0,0.5)' },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, backgroundColor: 'rgba(0,0,0,0.55)' },
  progressRow: { flexDirection: 'row', paddingHorizontal: 8, gap: 3, position: 'absolute', left: 0, right: 0, zIndex: 10 },
  progressTrack: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  header: {
    position: 'absolute', left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff' },
  username: { color: '#fff', fontWeight: '700', fontSize: 13 },
  time: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },
  iconBtn: { padding: 6 },
  captionBox: {
    position: 'absolute', bottom: 120, left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 10,
  },
  captionText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  tapRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 5 },
  replyRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12, zIndex: 10,
  },
  viewersCount: { color: '#fff', fontSize: 11, fontWeight: '600', marginLeft: 8 },
  viewersBtn: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  viewerAvatars: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  replyInput: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 8,
  },
  replyInputActive: { borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.1)' },
  replyTextInput: { color: '#fff', fontSize: 14, padding: 0 },
  replyHeart: { padding: 4 },
  replyShare: { padding: 4 },
  reactionOverlay: {
    position: 'absolute', left: 20, right: 20,
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 30,
    padding: 12, zIndex: 20,
  },
  reactionItem: { padding: 4 },
  sendBtn: { paddingHorizontal: 4 },
  sendBtnText: { color: '#6366f1', fontWeight: '800', fontSize: 14 },
});

const vv = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  container: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
    backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12,
  },
  header: { alignItems: 'center', marginBottom: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 8 },
  title: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  info: { flex: 1 },
  username: { color: '#fff', fontSize: 14, fontWeight: '600' },
  time: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  reactionBadge: { 
    width: 28, height: 28, borderRadius: 14, 
    backgroundColor: 'rgba(255,255,255,0.05)', 
    alignItems: 'center', justifyContent: 'center' 
  },
  reactionEmoji: { fontSize: 14 },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
});
