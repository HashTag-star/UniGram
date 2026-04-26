import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, StatusBar, Pressable, Animated,
  ActivityIndicator, Alert, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CachedImage } from '../components/CachedImage';
import { CommentSheet } from '../components/CommentSheet';
import { ShareSheet } from '../components/ShareSheet';
import { getReels, likeReel, unlikeReel, getLikedReelIds, deleteReel, incrementReelView } from '../services/reels';
import { getPersonalizedReels, recordContentFeedback } from '../services/algorithm';
import { followUser, unfollowUser, getFollowing } from '../services/profiles';
import { useSocialFollow, useSocialLike } from '../hooks/useSocialSync';
import { SocialSync } from '../services/social_sync';
import { supabase } from '../lib/supabase';
import { createReport } from '../services/reports';
import { useHaptics } from '../hooks/useHaptics';
import { usePopup } from '../context/PopupContext';

const { width, height } = Dimensions.get('window');
const ITEM_HEIGHT = height;
const TAB_BAR_HEIGHT = 58;

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
    p.audioMixingMode = muted ? 'mixWithOthers' : 'duckOthers';
    if (isActive && !isPaused) p.play();
  });

  // Stable ref so progress never causes listener teardown/rebuild
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    player.muted = muted;
    player.audioMixingMode = muted ? 'mixWithOthers' : 'duckOthers';
  }, [muted, player]);

  useEffect(() => {
    if (isActive && !isPaused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, isPaused, player]);

  useEffect(() => {
    onPlayerReady(player);
  }, [player]);

  // timeUpdate listener — only re-subscribes when the player instance changes
  useEffect(() => {
    const sub = player.addListener('timeUpdate', (event: any) => {
      const dur = player.duration > 0 ? player.duration : (event.duration ?? 0);
      if (dur > 0) onProgressRef.current(event.currentTime / dur);
    });
    return () => sub.remove();
  }, [player]);

  // Interval polling at 10 fps — reliable fallback when timeUpdate doesn't fire
  useEffect(() => {
    if (!isActive || isPaused) return;
    const id = setInterval(() => {
      const dur = player.duration;
      if (dur > 0) onProgressRef.current(player.currentTime / dur);
    }, 100);
    return () => clearInterval(id);
  }, [isActive, isPaused, player]);

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
  onBack?: () => void;
}> = ({ reel, currentUserId, isLiked: initLiked, isFollowingUser: initFollowing, isActive, isAdjacent, muted, onMuteToggle, itemHeight, onBack }) => {
  const { liked, setLiked, count: likes, setCount: setLikes } = useSocialLike(reel.id, 'REEL', initLiked, reel.likes_count ?? 0);
  const [commentCount, setCommentCount] = useState(reel.comments_count ?? 0);
  const [viewsCount, setViewsCount] = useState(reel.views_count ?? 0);
  const viewedRef = useRef(false);
  const [following, setFollowing] = useSocialFollow(reel.profiles?.id ?? '', initFollowing);
  const { success: hapticSuccess, warning: hapticWarning, medium: hapticMedium } = useHaptics();
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const playerRef = useRef<any>(null);
  const lastTapRef = useRef(0);
  const isSeekingRef = useRef(false);
  const pendingPauseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const seekContainerWidth = useRef(width);
  const { showPopup } = usePopup();
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  // Native-driver animated opacities — no re-render needed for feedback/overlay
  const seekFeedbackBackOpacity = useRef(new Animated.Value(0)).current;
  const seekFeedbackFwdOpacity = useRef(new Animated.Value(0)).current;
  const pauseOverlayOpacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const profile = reel.profiles;

  // Buffering / network error state
  const [isBuffering, setIsBuffering] = useState(false);
  const [netError, setNetError] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const stuckCountRef = useRef(0);
  const lastTimeRef = useRef(-1);

  // Pulsing shimmer loop for seek bar during buffer
  useEffect(() => {
    if (isBuffering) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(shimmerAnim, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      shimmerAnim.stopAnimation();
      shimmerAnim.setValue(0);
    }
  }, [isBuffering]);

  // Poll every 500 ms — if currentTime doesn't advance for 3 s → buffering
  // If stuck for 15 s → network error. Resets immediately when time advances.
  useEffect(() => {
    if (!isActive || isPaused) {
      stuckCountRef.current = 0;
      lastTimeRef.current = -1;
      return;
    }
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const now = player.currentTime ?? 0;
      if (now === lastTimeRef.current && now > 0) {
        stuckCountRef.current += 1;
        if (stuckCountRef.current >= 6) setIsBuffering(true);   // 3 s
        if (stuckCountRef.current >= 30) setNetError(true);     // 15 s
      } else {
        stuckCountRef.current = 0;
        setIsBuffering(false);
        setNetError(false);
      }
      lastTimeRef.current = now;
    }, 500);
    return () => clearInterval(interval);
  }, [isActive, isPaused]);

  const handleRetry = useCallback(() => {
    setNetError(false);
    setIsBuffering(false);
    stuckCountRef.current = 0;
    lastTimeRef.current = -1;
    try { playerRef.current?.play(); } catch {}
  }, []);

  // Reset error state when reel becomes inactive
  useEffect(() => {
    if (!isActive) {
      stuckCountRef.current = 0;
      lastTimeRef.current = -1;
      setNetError(false);
      setIsBuffering(false);
    }
  }, [isActive]);

  // Reset pause state and cancel any pending tap when reel becomes inactive
  useEffect(() => {
    if (!isActive) {
      setIsPaused(false);
      if (pendingPauseRef.current) {
        clearTimeout(pendingPauseRef.current);
        pendingPauseRef.current = null;
      }
    }
  }, [isActive]);

  // Count a view after 2 s of watching — once per reel per session
  useEffect(() => {
    if (!isActive || viewedRef.current) return;
    const timer = setTimeout(() => {
      viewedRef.current = true;
      setViewsCount((c: number) => c + 1);
      incrementReelView(reel.id).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [isActive, reel.id]);

  // Smoothly animate the pause overlay in/out — runs on the UI thread
  useEffect(() => {
    Animated.timing(pauseOverlayOpacity, {
      toValue: isPaused && showControls ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [isPaused, showControls]);

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
        ...(!isMe ? [{ text: 'Not interested', onPress: handleNotInterested }] : []),
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

  // Fade a seek-feedback icon in immediately, then fade it out — UI thread only
  const triggerSeekFeedback = (dir: 'back' | 'forward') => {
    const anim = dir === 'back' ? seekFeedbackBackOpacity : seekFeedbackFwdOpacity;
    anim.stopAnimation();
    anim.setValue(1);
    Animated.timing(anim, { toValue: 0, duration: 400, delay: 250, useNativeDriver: true }).start();
  };

  const handleTap = (e: any) => {
    const now = Date.now();
    const { locationX: x } = e.nativeEvent;

    if (now - lastTapRef.current < 200) {
      // Double tap — cancel the pending single-tap pause before it fires
      if (pendingPauseRef.current) {
        clearTimeout(pendingPauseRef.current);
        pendingPauseRef.current = null;
      }
      handleDoubleTap(x);
      lastTapRef.current = 0;
      return;
    }

    lastTapRef.current = now;
    // Immediate visual feedback: controls appear on the first touch
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);

    // Defer the actual pause/play toggle by 200 ms so double-taps can cancel it
    pendingPauseRef.current = setTimeout(() => {
      pendingPauseRef.current = null;
      handleSingleTap();
    }, 200);
  };

  const handleSingleTap = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    if (!nextPaused) scheduleHideControls();
    // When pausing: keep controls visible indefinitely until next tap
    else if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
  };

  const handleDoubleTap = (x: number) => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    const player = playerRef.current;
    if (!player || !player.duration) return;

    const cur = player.currentTime ?? 0;
    if (x < width * 0.35) {
      const newTime = Math.max(0, cur - 10);
      player.currentTime = newTime;
      setProgress(newTime / player.duration);
      triggerSeekFeedback('back');
      hapticWarning();
    } else if (x > width * 0.65) {
      const newTime = Math.min(player.duration, cur + 10);
      player.currentTime = newTime;
      setProgress(newTime / player.duration);
      triggerSeekFeedback('forward');
      hapticWarning();
    } else {
      if (!liked) toggleLike();
      showHeartAnim();
      hapticMedium();
    }
  };

  // Seek bar — PanResponder for reliable cross-component gesture handling
  const seekPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const player = playerRef.current;
      if (!player || !(player.duration > 0)) return;
      isSeekingRef.current = true;
      setIsSeeking(true);
      const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / seekContainerWidth.current));
      player.currentTime = ratio * player.duration;
      setProgress(ratio);
    },
    onPanResponderMove: (evt) => {
      const player = playerRef.current;
      if (!player || !(player.duration > 0)) return;
      const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / seekContainerWidth.current));
      player.currentTime = ratio * player.duration;
      setProgress(ratio);
    },
    onPanResponderRelease: () => {
      isSeekingRef.current = false;
      setIsSeeking(false);
    },
    onPanResponderTerminate: () => {
      isSeekingRef.current = false;
      setIsSeeking(false);
    },
  }), []);

  const handleNotInterested = async () => {
    try {
      await recordContentFeedback(currentUserId, reel.id, 'reel', 'not_interested', reel.user_id);
      showPopup({
        title: 'Got it',
        message: "We'll show you fewer reels like this.",
        icon: 'thumbs-down-outline',
        iconColor: '#6366f1',
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
    } catch {}
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
            onProgress={(p) => { if (!isSeekingRef.current) setProgress(p); }}
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
        colors={['rgba(0,0,0,0.45)', 'transparent']}
        locations={[0, 1]}
        style={styles.topGradient}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.55, 1]}
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* Top bar — back, search, options */}
      <View style={[styles.topBar, { top: insets.top + 4 }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.topBarBtn, !onBack && { opacity: 0 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={!onBack}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.topBarBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="search-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBarBtn} onPress={showOptions} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Center overlays — all driven by Animated values, no re-renders */}
      <View style={styles.centerOverlay} pointerEvents="none">
        <Animated.View style={{ transform: [{ scale: heartScale }], opacity: heartOpacity }}>
          <Ionicons name="heart" size={100} color="#fff" />
        </Animated.View>

        {/* Pause/play indicator — fades in/out smoothly */}
        <Animated.View style={[styles.pauseOverlay, { opacity: pauseOverlayOpacity }]}>
          <Ionicons name="play" size={60} color="rgba(255,255,255,0.7)" />
        </Animated.View>

        {/* 10 s rewind feedback */}
        <Animated.View style={[styles.seekFeedback, { left: width * 0.05, opacity: seekFeedbackBackOpacity }]}>
          <Ionicons name="play-back" size={40} color="#fff" />
          <Text style={styles.seekFeedbackText}>10s</Text>
        </Animated.View>

        {/* 10 s forward feedback */}
        <Animated.View style={[styles.seekFeedback, { right: width * 0.05, opacity: seekFeedbackFwdOpacity }]}>
          <Ionicons name="play-forward" size={40} color="#fff" />
          <Text style={styles.seekFeedbackText}>10s</Text>
        </Animated.View>
      </View>

      {/* Right actions */}
      <View style={[styles.rightActions, { bottom: 80 }]}>
        <TouchableOpacity onPress={toggleLike} style={styles.actionItem}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={34} color={liked ? '#ef4444' : '#fff'} />
          <Text style={styles.actionLabel}>{likes > 0 ? fmtCount(likes) : 'Like'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={32} color="#fff" />
          <Text style={styles.actionLabel}>{commentCount > 0 ? fmtCount(commentCount) : 'Comment'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setShowShare(true)}>
          <Ionicons name="paper-plane-outline" size={30} color="#fff" />
          <Text style={styles.actionLabel}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={onMuteToggle}>
          <Ionicons name={muted ? 'volume-mute-outline' : 'volume-high-outline'} size={28} color="#fff" />
          <Text style={styles.actionLabel}>{muted ? 'Unmute' : 'Sound'}</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={[styles.bottomInfo, { bottom: 14 }]}>
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
              <Text style={[styles.followBtnText, following && styles.followingBtnText]}>
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
          {fmtCount(viewsCount)} views · {timeAgo(reel.created_at)}
        </Text>
      </View>

      {/* Buffering spinner — only when active and buffering, not on network error */}
      {isBuffering && !netError && (
        <View style={[styles.centerOverlay, { pointerEvents: 'none' }]}>
          <ActivityIndicator size="large" color="rgba(255,255,255,0.85)" />
        </View>
      )}

      {/* Network error overlay */}
      {netError && (
        <View style={styles.netErrorOverlay}>
          <Ionicons name="cloud-offline-outline" size={48} color="rgba(255,255,255,0.7)" />
          <Text style={styles.netErrorTitle}>No internet connection</Text>
          <Text style={styles.netErrorSub}>Check your connection and try again</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Seek bar — 44 px touch target, PanResponder for reliable cross-gesture handling */}
      <View
        style={[styles.seekBarContainer, { bottom: 0 }]}
        onLayout={(e) => { seekContainerWidth.current = e.nativeEvent.layout.width; }}
        {...seekPanResponder.panHandlers}
      >
        {isBuffering && !netError ? (
          /* Pulsating shimmer during buffering */
          <Animated.View style={[styles.seekBarTrack, styles.seekBarTrackActive, { opacity: shimmerAnim }]}>
            <View style={[styles.seekBarFill, { width: `${progress * 100}%`, opacity: 0.5 }]} />
          </Animated.View>
        ) : (
          <View style={[styles.seekBarTrack, (showControls || isSeeking) && styles.seekBarTrackActive]}>
            <View style={[styles.seekBarFill, { width: `${progress * 100}%` }]} />
            {(showControls || isSeeking) && (
              <View style={[styles.seekThumb, { left: `${progress * 100}%` as any }]} />
            )}
          </View>
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

// ─── Loading skeleton ─────────────────────────────────────────────────────────

const ReelSkeleton: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <View style={styles.container}>
      <StatusBar hidden={false} translucent backgroundColor="transparent" />

      {/* Simulated dark video area */}
      <View style={skeletonStyles.videoPlaceholder} />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.88)']}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* Right actions */}
      <Animated.View style={[skeletonStyles.rightActions, { bottom: 80, opacity }]}>
        {[{ sz: 30, w: 32 }, { sz: 28, w: 28 }, { sz: 26, w: 26 }, { sz: 24, w: 0 }, { sz: 24, w: 0 }].map((item, i) => (
          <View key={i} style={skeletonStyles.actionItem}>
            <View style={[skeletonStyles.circle, { width: item.sz, height: item.sz, borderRadius: item.sz / 2 }]} />
            {item.w > 0 && <View style={[skeletonStyles.actionLabel, { width: item.w }]} />}
          </View>
        ))}
      </Animated.View>

      {/* Bottom info */}
      <Animated.View style={[skeletonStyles.bottomInfo, { bottom: 14, opacity }]}>
        <View style={skeletonStyles.userRow}>
          <View style={skeletonStyles.avatar} />
          <View style={skeletonStyles.usernamePill} />
          <View style={skeletonStyles.followPill} />
        </View>
        <View style={skeletonStyles.captionLine} />
        <View style={[skeletonStyles.captionLine, { width: '55%', marginTop: 6 }]} />
        <View style={[skeletonStyles.captionLine, { width: '30%', marginTop: 8, height: 10 }]} />
      </Animated.View>

      {/* Seek bar */}
      <Animated.View style={[skeletonStyles.seekBar, { bottom: 0, opacity }]} />

    </View>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export const ReelsScreen: React.FC<{
  onBack?: () => void;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
  initialReelId?: string;
  initialReels?: any[];
}> = ({ onBack, isMuted, setIsMuted, initialReelId, initialReels }) => {
  // Pre-populate with the tapped reel at index 0 for instant display — full list
  // loads in the background and is merged in without disrupting playback.
  const [reels, setReels] = useState<any[]>(() => {
    if (initialReelId && initialReels?.length) {
      const idx = initialReels.findIndex(r => r.id === initialReelId);
      if (idx > 0) {
        const copy = [...initialReels];
        const [clicked] = copy.splice(idx, 1);
        return [clicked, ...copy];
      }
      return initialReels;
    }
    return [];
  });
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(!initialReels?.length);
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
      if (!user) return;
      setCurrentUserId(user.id);
      const [reelsData, likedData, followingData] = await Promise.all([
        getPersonalizedReels(user.id),
        getLikedReelIds(user.id),
        getFollowing(user.id),
      ]);
      setLikedIds(new Set(likedData));
      setFollowingIds(new Set(followingData.map((p: any) => p.id)));
      setReels(prev => {
        if (!prev.length) {
          // Fresh load — place initialReelId first if provided
          if (initialReelId) {
            const idx = reelsData.findIndex((r: any) => r.id === initialReelId);
            if (idx > 0) {
              const copy = [...reelsData];
              const [clicked] = copy.splice(idx, 1);
              return [clicked, ...copy];
            }
            if (idx === -1 && initialReels?.length) {
              const fallback = initialReels.find(r => r.id === initialReelId);
              if (fallback) return [fallback, ...reelsData];
            }
          }
          return reelsData;
        }
        // Already showing initial reels — append personalized ones that aren't displayed yet
        const existingIds = new Set(prev.map((r: any) => r.id));
        const newOnes = reelsData.filter((r: any) => !existingIds.has(r.id));
        return [...prev, ...newOnes];
      });
    } catch (e) {
      console.error('Reels load error', e);
    } finally {
      setLoading(false);
    }
  }, [initialReelId, initialReels]);

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
    return <ReelSkeleton onBack={onBack} />;
  }

  if (reels.length === 0) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar hidden={false} translucent backgroundColor="transparent" />
        {onBack && (
          <TouchableOpacity
            style={{ position: 'absolute', top: 52, left: 16, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 }}
            onPress={onBack}
          >
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
              onBack={onBack}
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
    </View>
  );
};


const skeletonStyles = StyleSheet.create({
  videoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0d0d0d',
  },
  rightActions: { position: 'absolute', right: 12, alignItems: 'center', gap: 18 },
  actionItem: { alignItems: 'center', gap: 4 },
  circle: { backgroundColor: 'rgba(255,255,255,0.28)' },
  actionLabel: { height: 10, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.28)' },
  bottomInfo: { position: 'absolute', left: 14, right: 70 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
  },
  usernamePill: { width: 90, height: 13, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.28)' },
  followPill: { width: 58, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)' },
  captionLine: { width: '80%', height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)' },
  seekBar: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  reelContainer: { width, position: 'relative', overflow: 'hidden' },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 350, backgroundColor: 'transparent' },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, backgroundColor: 'transparent', zIndex: 5 },
  topBar: {
    position: 'absolute', left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  topBarBtn: {
    padding: 8,
    borderRadius: 20,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  // 44 px invisible touch area; visual bar lives at the bottom of it
  seekBarContainer: {
    position: 'absolute', left: 0, right: 0,
    height: 44,
    justifyContent: 'flex-end',
  },
  seekBarTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  seekBarTrackActive: {
    height: 4,
  },
  seekBarFill: {
    height: '100%',
    backgroundColor: '#ff2b54',
  },
  seekThumb: {
    position: 'absolute',
    // center 14 px thumb vertically on the 4 px active track
    top: -5, width: 14, height: 14,
    borderRadius: 7, backgroundColor: '#fff', marginLeft: -7,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4, shadowRadius: 2, elevation: 3,
  },
  rightActions: { position: 'absolute', right: 10, bottom: 100, alignItems: 'center', gap: 22 },
  actionItem: { alignItems: 'center', gap: 4 },
  actionLabel: {
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
  followBtn: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  followBtnText: { color: '#000', fontSize: 12, fontWeight: '700' },
  followingBtnText: { color: 'rgba(255,255,255,0.7)' },
  reelCaption: {
    color: '#fff', fontSize: 13, lineHeight: 18, marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  songText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  viewCount: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  netErrorOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  netErrorTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 8 },
  netErrorSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 24,
    paddingHorizontal: 22, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

