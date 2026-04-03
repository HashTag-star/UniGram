import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, StatusBar, Pressable,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, withDelay, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CommentSheet } from '../components/CommentSheet';
import { getReels, likeReel, unlikeReel, getLikedReelIds } from '../services/reels';
import { followUser, unfollowUser, isFollowing } from '../services/profiles';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');
const ITEM_HEIGHT = height;

function fmtCount(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

const ReelItem: React.FC<{
  reel: any;
  currentUserId: string;
  isLiked: boolean;
  isActive: boolean;
}> = ({ reel, currentUserId, isLiked: initLiked, isActive }) => {
  const [liked, setLiked] = useState(initLiked);
  const [likes, setLikes] = useState(reel.likes_count ?? 0);
  const [commentCount, setCommentCount] = useState(reel.comments_count ?? 0);
  const [following, setFollowing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const lastTapRef = useRef(0);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  const profile = reel.profiles;

  const player = useVideoPlayer(reel.video_url, (player) => {
    player.loop = true;
    if (isActive) player.play();
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (isActive) {
      player.play();
      setIsPaused(false);
    } else {
      player.pause();
      setIsPaused(true);
    }
  }, [isActive, player]);

  useEffect(() => {
    const sub = player.addListener('timeUpdate', (event) => {
      if (player.duration > 0) {
        setProgress(event.currentTime / player.duration);
      }
    });
    return () => sub.remove();
  }, [player]);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n: number) => next ? n + 1 : n - 1);
    try {
      if (next) await likeReel(reel.id, currentUserId);
      else await unlikeReel(reel.id, currentUserId);
    } catch { setLiked(!next); setLikes((n: number) => next ? n - 1 : n + 1); }
  };

  const toggleFollow = async () => {
    if (!currentUserId || !profile?.id) return;
    const next = !following;
    setFollowing(next);
    try {
      if (next) await followUser(currentUserId, profile.id);
      else await unfollowUser(currentUserId, profile.id);
    } catch { setFollowing(!next); }
  };

  const showHeartAnim = () => {
    heartScale.value = withSequence(
      withSpring(1.2, { damping: 10, stiffness: 100 }),
      withTiming(0.8, { duration: 200 }),
      withTiming(0, { duration: 500 })
    );
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(400, withTiming(0, { duration: 400 }))
    );
  };

  const handleTap = (e: any) => {
    const now = Date.now();
    const { x, y } = e.nativeEvent;
    
    // Check for double tap (within 300ms)
    if (now - lastTapRef.current < 300) {
      handleDoubleTap(x);
      lastTapRef.current = 0; // reset
      return;
    }
    lastTapRef.current = now;

    // Single tap delay to confirm it's not a double tap
    setTimeout(() => {
      if (lastTapRef.current === now) {
        handleSingleTap();
      }
    }, 300);
  };

  const handleSingleTap = () => {
    const nextPaused = !player.playing;
    setIsPaused(nextPaused);
    if (nextPaused) player.pause();
    else player.play();

    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  const handleDoubleTap = (x: number) => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    
    if (x < width * 0.35) {
      // Seek back 10s
      player.seekBy(-10);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (x > width * 0.65) {
      // Seek forward 10s
      player.seekBy(10);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      // Middle - Like
      if (!liked) toggleLike();
      showHeartAnim();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  };

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  return (
    <View style={[styles.reelContainer, { height: ITEM_HEIGHT }]}>
      <Pressable onPress={handleTap} style={StyleSheet.absoluteFill}>
        {reel.video_url ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        ) : reel.thumbnail_url ? (
          <Image source={{ uri: reel.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="film-outline" size={64} color="#333" />
          </View>
        )}
      </Pressable>
      <View style={styles.gradient} pointerEvents="none" />

      {/* Center Heart Anim */}
      <View style={styles.centerOverlay} pointerEvents="none">
        <Animated.View style={heartStyle}>
          <Ionicons name="heart" size={100} color="#fff" />
        </Animated.View>
        {isPaused && showControls && (
          <View style={styles.pauseOverlay}>
            <Ionicons name="play" size={60} color="rgba(255,255,255,0.6)" />
          </View>
        )}
      </View>

      {/* Right actions */}
      <View style={styles.rightActions}>
        <TouchableOpacity onPress={toggleLike} style={styles.actionItem}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? '#ef4444' : '#fff'} />
          <Text style={styles.actionCount}>{fmtCount(likes)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={28} color="#fff" />
          <Text style={styles.actionCount}>{fmtCount(commentCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="paper-plane-outline" size={26} color="#fff" />
          <Text style={styles.actionCount}>{fmtCount(reel.shares_count ?? 0)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setMuted(m => !m)}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={styles.bottomInfo}>
        <View style={styles.userRow}>
          {profile?.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={styles.reelAvatar} />
            : <View style={[styles.reelAvatar, { backgroundColor: '#222' }]} />
          }
          <Text style={styles.reelUsername}>{profile?.username ?? 'user'}</Text>
          {profile?.is_verified && <VerifiedBadge type={profile.verification_type} />}
          {profile?.id !== currentUserId && (
            <TouchableOpacity
              onPress={toggleFollow}
              style={[styles.followBtn, following && styles.followingBtn]}
            >
              <Text style={[styles.followBtnText, following && { color: 'rgba(255,255,255,0.5)' }]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.reelCaption} numberOfLines={2}>{reel.caption}</Text>
        {reel.song && (
          <View style={styles.songRow}>
            <Ionicons name="musical-notes" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.songText}>{reel.song}</Text>
          </View>
        )}
        <Text style={styles.viewCount}>
          {fmtCount(reel.views_count ?? 0)} views · {timeAgo(reel.created_at)}
        </Text>
      </View>

      {/* Bottom Seek Bar */}
      <View style={[styles.seekBarWrap, showControls && { opacity: 1 }]}>
        <View style={[styles.seekBarProgress, { width: `${progress * 100}%` }]} />
      </View>

      <CommentSheet
        visible={showComments}
        targetId={reel.id}
        targetType="reel"
        currentUserId={currentUserId}
        onClose={() => setShowComments(false)}
        onCountChange={delta => setCommentCount((n: number) => Math.max(0, n + delta))}
      />
    </View>
  );
};

export const ReelsScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [reels, setReels] = useState<any[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const [reelsData, likedData] = await Promise.all([getReels(), getLikedReelIds(user.id)]);
        setReels(reelsData);
        setLikedIds(new Set(likedData));
      }
    } catch (e) {
      console.error('Reels load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar hidden />
        {onBack && (
          <TouchableOpacity style={reelNavStyles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <Ionicons name="film-outline" size={48} color="#333" />
        <Text style={{ color: '#555', marginTop: 12 }}>Loading reels...</Text>
      </View>
    );
  }

  if (reels.length === 0) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar hidden />
        {onBack && (
          <TouchableOpacity style={reelNavStyles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <Ionicons name="film-outline" size={64} color="#333" />
        <Text style={{ color: '#555', marginTop: 16, fontSize: 16 }}>No reels yet</Text>
        <Text style={{ color: '#444', marginTop: 6, fontSize: 13 }}>Post a reel using the + button!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <FlatList
        data={reels}
        keyExtractor={r => r.id}
        renderItem={({ item, index }) => (
          <ReelItem
            reel={item}
            currentUserId={currentUserId}
            isLiked={likedIds.has(item.id)}
            isActive={index === activeIndex}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        removeClippedSubviews={true}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
      />
      {onBack && (
        <TouchableOpacity style={reelNavStyles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const reelNavStyles = StyleSheet.create({
  backBtn: {
    position: 'absolute', top: 52, left: 16, zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  reelContainer: { width, position: 'relative', overflow: 'hidden' },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 350 },
  centerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pauseOverlay: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.1)', padding: 20, borderRadius: 50 },
  seekBarWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.2)', opacity: 0.4 },
  seekBarProgress: { height: '100%', backgroundColor: '#fff' },
  rightActions: { position: 'absolute', right: 12, bottom: 100, alignItems: 'center', gap: 18 },
  actionItem: { alignItems: 'center', gap: 3 },
  actionCount: { color: '#fff', fontSize: 12, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  bottomInfo: { position: 'absolute', bottom: 30, left: 14, right: 70 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  reelAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff' },
  reelUsername: { color: '#fff', fontWeight: 'bold', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  followBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  followingBtn: { borderColor: 'rgba(255,255,255,0.2)' },
  followBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  reelCaption: { color: '#fff', fontSize: 13, lineHeight: 18, marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  songText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  viewCount: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
});
