import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, StatusBar, Pressable, Animated,
  Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CachedImage } from '../components/CachedImage';
import { CommentSheet } from '../components/CommentSheet';
import { ShareSheet } from '../components/ShareSheet';
import { getReels, likeReel, unlikeReel, getLikedReelIds, deleteReel } from '../services/reels';
import { followUser, unfollowUser, getFollowing } from '../services/profiles';
import { useSocialFollow, useSocialLike } from '../hooks/useSocialSync';
import { SocialSync } from '../services/social_sync';
import { supabase } from '../lib/supabase';
import { createReport } from '../services/reports';
import { useHaptics } from '../hooks/useHaptics';
import { usePopup } from '../context/PopupContext';

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

// ─── Video sub-component ──────────────────────────────────────────────────────

const ReelVideo: React.FC<{
  videoUrl: string;
  isActive: boolean;
  isPaused: boolean;
  muted: boolean;
  onProgress: (p: number) => void;
  onPlayerReady: (player: any) => void;
}> = ({ videoUrl, isActive, isPaused, muted, onProgress, onPlayerReady }) => {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = muted;
    if (isActive && !isPaused) p.play();
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (isActive && !isPaused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, isPaused, player]);

  useEffect(() => {
    const sub = player.addListener('timeUpdate', (event) => {
      if (player.duration > 0) {
        onProgress(event.currentTime / player.duration);
      }
    });
    onPlayerReady(player);
    return () => sub.remove();
  }, [player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

// ─── Reel item ────────────────────────────────────────────────────────────────

const ReelItem: React.FC<{
  reel: any;
  currentUserId: string;
  isLiked: boolean;
  isFollowingUser: boolean;
  isActive: boolean;
  isAdjacent?: boolean;
  muted: boolean;
  onMuteToggle: () => void;
  itemHeight: number;
}> = ({ reel, currentUserId, isLiked: initLiked, isFollowingUser: initFollowing, isActive, isAdjacent, muted, onMuteToggle, itemHeight }) => {
  const { liked, setLiked, count: likes, setCount: setLikes } = useSocialLike(reel.id, 'REEL', initLiked, reel.likes_count ?? 0);
  const [commentCount, setCommentCount] = useState(reel.comments_count ?? 0);
  const [following, setFollowing] = useSocialFollow(reel.profiles?.id ?? '', initFollowing);
  const { success: hapticSuccess, warning: hapticWarning, medium: hapticMedium } = useHaptics();
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [seekFeedback, setSeekFeedback] = useState<'back' | 'forward' | null>(null);
  const playerRef = useRef<any>(null);
  const lastTapRef = useRef(0);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const { showPopup } = usePopup();
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const seekBarRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const profile = reel.profiles;

  // Reset pause state when reel becomes inactive
  useEffect(() => {
    if (!isActive) setIsPaused(false);
  }, [isActive]);

  const toggleLike = async () => {
    const next = !liked;
    const newCount = likes + (next ? 1 : -1);
    setLiked(next);
    setLikes(newCount);
    SocialSync.emit('REEL_LIKE_CHANGE', { targetId: reel.id, isActive: next, newCount });
    try {
      if (next) await likeReel(reel.id, currentUserId);
      else await unlikeReel(reel.id, currentUserId);
    } catch (e: any) {
      const isSchemaError = e.message?.includes('relation') || 
                          e.message?.includes('not found') || 
                          e.message?.includes('schema cache') ||
                          e.code === 'PGRST205';
      if (isSchemaError) return;

      setLiked(!next);
      setLikes(likes);
      SocialSync.emit('REEL_LIKE_CHANGE', { targetId: reel.id, isActive: !next, newCount: likes });
    }
  };

  const toggleFollow = async () => {
    if (!currentUserId || !profile?.id) return;
    const next = !following;
    setFollowing(next);
    SocialSync.emit('FOLLOW_CHANGE', { targetId: profile.id, isActive: next });
    try {
      if (next) await followUser(currentUserId, profile.id);
      else await unfollowUser(currentUserId, profile.id);
    } catch (e: any) {
      const isSchemaError = e.message?.includes('relation') || 
                          e.message?.includes('not found') || 
                          e.message?.includes('schema cache') ||
                          e.code === 'PGRST205';
      if (isSchemaError) return;

      setFollowing(!next);
      SocialSync.emit('FOLLOW_CHANGE', { targetId: profile.id, isActive: !next });
    }
  };

  const handleDelete = () => {
    showPopup({
      title: 'Delete reel?',
      message: 'This action cannot be undone and will remove the reel from your profile.',
      icon: 'trash-outline',
      iconColor: '#ef4444',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        { 
          text: 'Delete Permanently', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await deleteReel(reel.id, currentUserId);
              hapticSuccess();
            } catch (e: any) {
              showPopup({
                title: 'Error',
                message: e.message ?? 'Could not delete reel',
                icon: 'alert-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
            }
          }
        },
      ]
    });
  };

  const handleReport = () => {
    showPopup({
      title: 'Report Reel',
      message: 'Why are you reporting this reel? Your feedback helps keep the campus safe.',
      icon: 'flag-outline',
      buttons: [
        { text: 'Inappropriate Content', onPress: () => submitReport('Inappropriate Content') },
        { text: 'Spam', onPress: () => submitReport('Spam') },
        { text: 'Harassment', onPress: () => submitReport('Harassment') },
        { text: 'Academic Fraud', onPress: () => submitReport('Academic Fraud') },
        { text: 'Cancel', style: 'cancel', onPress: () => {} }
      ]
    });
  };

  const submitReport = async (reason: string) => {
    try {
      await createReport(reel.id, 'reel', reason);
      showPopup({
        title: 'Report Received',
        message: 'Thank you. Our moderators will review this shortly.',
        icon: 'checkmark-circle-outline',
        iconColor: '#10b981',
        buttons: [{ text: 'Done', onPress: () => {} }]
      });
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message,
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    }
  };

  const showOptions = () => {
    const isMe = reel.user_id === currentUserId;
    showPopup({
      title: 'Options',
      buttons: [
        { text: 'Report', onPress: handleReport },
        ...(isMe ? [{ text: 'Delete', style: 'destructive', onPress: handleDelete } as const] : []),
        { text: 'Cancel', style: 'cancel', onPress: () => {} }
      ]
    });
  };

  const showHeartAnim = () => {
    heartScale.setValue(0);
    heartOpacity.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.spring(heartScale, { toValue: 1.2, friction: 3, tension: 40, useNativeDriver: true }),
        Animated.timing(heartScale, { toValue: 0.8, duration: 200, useNativeDriver: true }),
        Animated.timing(heartScale, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(heartOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(heartOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ])
    ]).start();
  };

  const scheduleHideControls = () => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  const handleTap = (e: any) => {
    const now = Date.now();
    const { locationX: x } = e.nativeEvent;
    if (now - lastTapRef.current < 300) {
      handleDoubleTap(x);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    setTimeout(() => {
      if (lastTapRef.current === now) handleSingleTap();
    }, 300);
  };

  const handleSingleTap = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    setShowControls(true);
    if (!nextPaused) scheduleHideControls();
    else if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
  };

  const handleDoubleTap = (x: number) => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    const player = playerRef.current;
    if (!player) return;
    if (x < width * 0.35) {
      player.seekBy(-10);
      setSeekFeedback('back');
      setTimeout(() => setSeekFeedback(null), 600);
      hapticWarning();
    } else if (x > width * 0.65) {
      player.seekBy(10);
      setSeekFeedback('forward');
      setTimeout(() => setSeekFeedback(null), 600);
      hapticWarning();
    } else {
      if (!liked) toggleLike();
      showHeartAnim();
      hapticMedium();
    }
  };

  // Seek bar touch — only active when paused
  const handleSeekBarPress = (e: any) => {
    const player = playerRef.current;
    if (!player || !isPaused) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / width));
    const targetTime = ratio * (player.duration ?? 0);
    player.seekBy(targetTime - (player.currentTime ?? 0));
    setProgress(ratio);
  };

  const handleSeekBarMove = (e: any) => {
    const player = playerRef.current;
    if (!player || !isPaused) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / width));
    const targetTime = ratio * (player.duration ?? 0);
    player.seekBy(targetTime - (player.currentTime ?? 0));
    setProgress(ratio);
  };

  return (
    <View style={[styles.reelContainer, { height: itemHeight }]}>
      <Pressable onPress={handleTap} style={StyleSheet.absoluteFill}>
        {(isActive || isAdjacent) && reel.video_url ? (
          <ReelVideo
            videoUrl={reel.video_url}
            isActive={isActive}
            isPaused={isPaused}
            muted={muted}
            onProgress={setProgress}
            onPlayerReady={(p) => { playerRef.current = p; }}
          />
        ) : reel.thumbnail_url ? (
          <CachedImage uri={reel.thumbnail_url} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="film-outline" size={64} color="#333" />
          </View>
        )}
      </Pressable>

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.55, 1]}
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* Center overlays */}
      <View style={styles.centerOverlay} pointerEvents="none">
        <Animated.View style={{ transform: [{ scale: heartScale }], opacity: heartOpacity }}>
          <Ionicons name="heart" size={100} color="#fff" />
        </Animated.View>
        {isPaused && showControls && (
          <View style={styles.pauseOverlay}>
            <Ionicons name="play" size={60} color="rgba(255,255,255,0.6)" />
          </View>
        )}
        {seekFeedback === 'back' && (
          <View style={[styles.seekFeedback, { left: width * 0.1 }]}>
            <Ionicons name="play-back" size={40} color="#fff" />
            <Text style={styles.seekFeedbackText}>10s</Text>
          </View>
        )}
        {seekFeedback === 'forward' && (
          <View style={[styles.seekFeedback, { right: width * 0.1 }]}>
            <Ionicons name="play-forward" size={40} color="#fff" />
            <Text style={styles.seekFeedbackText}>10s</Text>
          </View>
        )}
      </View>

      {/* Right actions */}
      <View style={[styles.rightActions, { bottom: 100 + insets.bottom }]}>
        <TouchableOpacity onPress={toggleLike} style={styles.actionItem}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? '#ef4444' : '#fff'} />
          {likes > 0 && <Text style={styles.actionCount}>{fmtCount(likes)}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={28} color="#fff" />
          {commentCount > 0 && <Text style={styles.actionCount}>{fmtCount(commentCount)}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setShowShare(true)}>
          <Ionicons name="paper-plane-outline" size={26} color="#fff" />
          {(reel.shares_count ?? 0) > 0 && <Text style={styles.actionCount}>{fmtCount(reel.shares_count)}</Text>}
        </TouchableOpacity>

        {/* Global mute toggle */}
        <TouchableOpacity style={styles.actionItem} onPress={onMuteToggle}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={showOptions}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={[styles.bottomInfo, { bottom: 30 + insets.bottom }]}>
        <View style={styles.userRow}>
          {profile?.avatar_url
            ? <CachedImage uri={profile.avatar_url} style={styles.reelAvatar} />
            : <View style={[styles.reelAvatar, { backgroundColor: '#222' }]} />
          }
          <Text style={styles.reelUsername}>{profile?.username ?? 'user'}</Text>
          {profile?.is_verified && <VerifiedBadge type={profile.verification_type} ringColor="#000" />}
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

      {/* Seek bar — interactive when paused, always visible */}
      <View
        ref={seekBarRef}
        style={[styles.seekBarWrap, showControls && styles.seekBarVisible]}
        onStartShouldSetResponder={() => isPaused}
        onMoveShouldSetResponder={() => isPaused}
        onResponderGrant={handleSeekBarPress}
        onResponderMove={handleSeekBarMove}
      >
        <View style={[styles.seekBarProgress, { width: `${progress * 100}%` }]} />
        {/* Scrubber thumb — visible when paused */}
        {isPaused && showControls && (
          <View style={[styles.seekThumb, { left: `${progress * 100}%` as any }]} />
        )}
      </View>

      <CommentSheet
        visible={showComments}
        targetId={reel.id}
        targetType="reel"
        currentUserId={currentUserId}
        authorId={reel.user_id}
        onClose={() => setShowComments(false)}
        onCountChange={delta => setCommentCount((n: number) => Math.max(0, n + delta))}
        onCountSync={count => setCommentCount(count)}
      />

      <ShareSheet
        visible={showShare}
        onClose={() => setShowShare(false)}
        content={{
          type: 'reel',
          id: reel.id,
          thumbnail: reel.thumbnail_url,
          username: profile?.username,
        }}
      />
    </View>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export const ReelsScreen: React.FC<{ 
  onBack?: () => void;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
}> = ({ onBack, isMuted, setIsMuted }) => {
  const [reels, setReels] = useState<any[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  // Using global muting props instead of local state
  const [containerHeight, setContainerHeight] = useState(height); // measured on layout

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
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
        const [reelsData, likedData, followingData] = await Promise.all([
          getReels(),
          getLikedReelIds(user.id),
          getFollowing(user.id),
        ]);
        setReels(reelsData);
        setLikedIds(new Set(likedData));
        setFollowingIds(new Set(followingData.map((p: any) => p.id)));
      }
    } catch (e) {
      console.error('Reels load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sub = SocialSync.on('REEL_DELETE', ({ targetId }) => {
      setReels(prev => prev.filter(r => r.id !== targetId));
    });
    return () => sub.remove();
  }, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: containerHeight,
    offset: containerHeight * index,
    index,
  }), [containerHeight]);

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar hidden={false} translucent backgroundColor="transparent" />
        {onBack && (
          <TouchableOpacity style={reelNavStyles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <ActivityIndicator size="large" color="#818cf8" />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 14, fontSize: 14 }}>Loading reels...</Text>
      </View>
    );
  }

  if (reels.length === 0) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar hidden={false} translucent backgroundColor="transparent" />
        {onBack && (
          <TouchableOpacity style={reelNavStyles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <Ionicons name="film-outline" size={64} color="#333" />
        <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 16, fontSize: 16, fontWeight: '600' }}>No reels yet</Text>
        <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 6, fontSize: 13 }}>Post a reel using the + button!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden={false} translucent backgroundColor="transparent" />
      <View
        style={{ flex: 1 }}
        onLayout={e => setContainerHeight(e.nativeEvent.layout.height)}
      >
        <FlatList
          data={reels}
          keyExtractor={r => r.id}
          renderItem={({ item, index }) => (
            <ReelItem
              reel={item}
              currentUserId={currentUserId}
              isLiked={likedIds.has(item.id)}
              isFollowingUser={followingIds.has(item.profiles?.id)}
              isActive={index === activeIndex}
              isAdjacent={Math.abs(index - activeIndex) === 1}
              muted={isMuted}
              onMuteToggle={() => setIsMuted(!isMuted)}
              itemHeight={containerHeight}
            />
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          removeClippedSubviews={true}
          getItemLayout={getItemLayout}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
        />
      </View>
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
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 350, backgroundColor: 'transparent' },
  centerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pauseOverlay: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.1)', padding: 20, borderRadius: 50 },
  seekFeedback: {
    position: 'absolute',
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekFeedbackText: {
    color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  seekBarWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)', opacity: 0.5,
  },
  seekBarVisible: { opacity: 1, height: 4 },
  seekBarProgress: { height: '100%', backgroundColor: '#fff' },
  seekThumb: {
    position: 'absolute', top: -5, width: 14, height: 14,
    borderRadius: 7, backgroundColor: '#fff', marginLeft: -7,
  },
  rightActions: { position: 'absolute', right: 12, bottom: 100, alignItems: 'center', gap: 18 },
  actionItem: { alignItems: 'center', gap: 3 },
  actionCount: {
    color: '#fff', fontSize: 12, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  bottomInfo: { position: 'absolute', bottom: 30, left: 14, right: 70 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  reelAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff' },
  reelUsername: {
    color: '#fff', fontWeight: 'bold', fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  followBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  followingBtn: { borderColor: 'rgba(255,255,255,0.2)' },
  followBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  reelCaption: {
    color: '#fff', fontSize: 13, lineHeight: 18, marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  songText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  viewCount: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
});

