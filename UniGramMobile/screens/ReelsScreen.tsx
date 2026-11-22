import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, StatusBar, Pressable, Animated,
  ActivityIndicator, Alert, PanResponder, AppState, Linking,
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
import { likePost, unlikePost, getLikedPostIds } from '../services/posts';
import { getPersonalizedReels, recordContentFeedback } from '../services/algorithm';
import { getActiveAdsForPlacement, adFrequencyInterval, recordCampusAdImpression, isReelAdUnskippable } from '../services/campusAds';
import { fx } from '../lib/feedback';
import { Tap } from '../components/ui/Tap';
import { ReelMidRollAd } from '../components/ReelMidRollAd';
import { filterEligibleAds, noteAdShown, scaleIntervalForCampaign } from '../services/adDelivery';
import { useAdPolicy } from '../hooks/useAdPolicy';
import { ReelAdCard } from '../components/ReelAdCard';
import { followUser, unfollowUser, getFollowing } from '../services/profiles';
import { useSocialFollow, useSocialLike } from '../hooks/useSocialSync';
import { SocialSync } from '../services/social_sync';
import { supabase } from '../lib/supabase';
import { createReport } from '../services/reports';
import { useHaptics } from '../hooks/useHaptics';
import { usePopup } from '../context/PopupContext';
import { useTheme } from '../context/ThemeContext';
import { FadeIn } from '../components/FadeIn';

const { width, height } = Dimensions.get('window');
const COMMENT_BAR_HEIGHT = 50;

import { fmtCount, timeAgo } from '../lib/formatUtils';

// ─── Video sub-component ──────────────────────────────────────────────────────

const ReelVideo: React.FC<{
  videoUrl: string;
  isActive: boolean;
  isPaused: boolean;
  muted: boolean;
  playbackRate?: number;
  onProgress: (p: number) => void;
  onPlayerReady: (player: any) => void;
}> = React.memo(({ videoUrl, isActive, isPaused, muted, playbackRate = 1.0, onProgress, onPlayerReady }) => {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = muted;
    p.playbackRate = playbackRate;
    p.audioMixingMode = muted ? 'mixWithOthers' : 'duckOthers';
    if (isActive && !isPaused) p.play();
  });

  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);

  useEffect(() => {
    onPlayerReady(player);
    return () => {
      // Silence immediately on unmount — prevents audio bleeding into the next reel
      // while expo-video's own cleanup is still in flight.
      try { player.pause(); } catch {}
    };
  }, [player]);

  // Keep playback state in sync with props
  useEffect(() => {
    if (isActive && !isPaused) {
      try { player.play(); } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [isActive, isPaused, player]);

  useEffect(() => {
    player.muted = muted;
    player.audioMixingMode = muted ? 'mixWithOthers' : 'duckOthers';
  }, [muted, player]);

  useEffect(() => {
    player.playbackRate = playbackRate;
  }, [playbackRate, player]);

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

  // We mount the VideoView even if not active so it can pre-buffer the video
  // for immediate playback when the user swipes to it.
  // Playback state (play/pause) is managed by effects above.

  return (
    <VideoView
      player={player}
      style={[StyleSheet.absoluteFill, { opacity: isActive ? 1 : 0 }]}
      contentFit="cover"
      nativeControls={false}
    />
  );
});

// ─── Live Preview Card (YouTube Shorts-style) ─────────────────────────────────

const LivePreviewCard: React.FC<{
  session: any;
  itemHeight: number;
  onJoin: (sessionId: string) => void;
}> = React.memo(({ session, itemHeight, onJoin }) => {
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const joinScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.22, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.2, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.9, duration: 900, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const handleJoinPress = () => {
    Animated.sequence([
      Animated.timing(joinScale, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.spring(joinScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start(() => onJoin(session.id));
  };

  const profile = session.profiles;
  const viewers = session.viewer_count ?? 0;

  const fmtViewers = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <View style={{ width, height: itemHeight, backgroundColor: '#000' }}>
      {/* Background: blurred avatar */}
      {profile?.avatar_url ? (
        <Image
          source={{ uri: profile.avatar_url }}
          style={[StyleSheet.absoluteFill, { opacity: 0.18 }]}
          blurRadius={28}
        />
      ) : null}
      <LinearGradient
        colors={['#12001e', '#080010', '#000']}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle red glow at center */}
      <View style={{
        position: 'absolute', width: 340, height: 340, borderRadius: 170,
        backgroundColor: '#ff3b30', opacity: 0.06, alignSelf: 'center', top: itemHeight * 0.18,
      }} />

      {/* Top LIVE badge */}
      <View style={[liveCardStyles.topBadge, { top: insets.top + 12 }]}>
        <View style={liveCardStyles.liveDot} />
        <Text style={liveCardStyles.liveBadgeText}>LIVE</Text>
      </View>

      {/* Center content */}
      <View style={liveCardStyles.center}>
        {/* Pulsing avatar ring */}
        <View style={liveCardStyles.avatarWrap}>
          <Animated.View style={[liveCardStyles.pulseRing, { transform: [{ scale: pulseAnim }], opacity: pulseOpacity }]} />
          <View style={liveCardStyles.pulseRing2} />
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={liveCardStyles.avatar} />
          ) : (
            <View style={[liveCardStyles.avatar, { backgroundColor: '#1a0a2e', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={52} color="#555" />
            </View>
          )}
        </View>

        {/* Name + uni */}
        <Text style={liveCardStyles.username}>@{profile?.username ?? 'someone'}</Text>
        {profile?.university ? (
          <Text style={liveCardStyles.university}>{profile.university}</Text>
        ) : null}
        <Text style={liveCardStyles.subtitle}>is live now</Text>

        {/* Viewer count */}
        <View style={liveCardStyles.viewerRow}>
          <Ionicons name="eye" size={14} color="rgba(255,255,255,0.6)" />
          <Text style={liveCardStyles.viewerText}>{fmtViewers(viewers)} watching</Text>
        </View>

        {/* Join button */}
        <Animated.View style={{ transform: [{ scale: joinScale }], marginTop: 28 }}>
          <TouchableOpacity onPress={handleJoinPress} activeOpacity={0.9} accessibilityLabel="Join Live" accessibilityRole="button">
            <LinearGradient
              colors={['#ff3b30', '#c0392b']}
              style={liveCardStyles.joinBtn}
            >
              <Ionicons name="radio" size={18} color="#fff" />
              <Text style={liveCardStyles.joinBtnText}>Join Live</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Bottom: swipe hint */}
      <View style={[liveCardStyles.swipeHint, { bottom: insets.bottom + 24 }]}>
        <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.3)" />
        <Text style={liveCardStyles.swipeHintText}>Swipe to continue</Text>
        <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.3)" />
      </View>
    </View>
  );
});

const liveCardStyles = StyleSheet.create({
  topBadge: {
    position: 'absolute', left: 16, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#ff3b30', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7,
    shadowColor: '#ff3b30', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  liveBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  avatarWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  pulseRing: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    borderWidth: 3, borderColor: '#ff3b30',
  },
  pulseRing2: {
    position: 'absolute', width: 118, height: 118, borderRadius: 59,
    borderWidth: 2, borderColor: 'rgba(255,59,48,0.35)',
  },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  username: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 4 },
  university: { color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 4 },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 15, marginBottom: 14 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  viewerText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600' },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 40, paddingVertical: 16, borderRadius: 30,
    shadowColor: '#ff3b30', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 10,
  },
  joinBtnText: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  swipeHint: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  swipeHintText: { color: 'rgba(255,255,255,0.25)', fontSize: 12 },
});

// ─── Reel item ────────────────────────────────────────────────────────────────

const ReelItem: React.FC<{
  reel: any;
  currentUserId: string;
  isLiked: boolean;
  isFollowingUser: boolean;
  isActive: boolean;
  muted: boolean;
  onMuteToggle: () => void;
  itemHeight: number;
  onBack?: () => void;
  /** Mid-roll ad scheduled for THIS reel (null = none). */
  midRollAd?: any | null;
  midRollDwellMs?: number;
  onMidRollStart?: (ad: any) => void;
  onMidRollEnd?: (ad: any) => void;
  onAdImpression?: (adId: string) => void;
  onAdHide?: (adId: string) => void;
}> = React.memo(({ reel, currentUserId, isLiked: initLiked, isFollowingUser: initFollowing, isActive, muted, onMuteToggle, itemHeight, onBack, midRollAd = null, midRollDwellMs = 2000, onMidRollStart, onMidRollEnd, onAdImpression, onAdHide }) => {
  const { liked, setLiked, count: likes, setCount: setLikes } = useSocialLike(reel.id, 'REEL', reel._isPost ? (reel._initiallyLiked ?? initLiked) : initLiked, reel.likes_count ?? 0);
  const { colors } = useTheme();
  const [captionOpen, setCaptionOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(reel.comments_count ?? 0);
  const [viewsCount, setViewsCount] = useState(reel.views_count ?? 0);
  const viewedRef = useRef(false);
  const [following, setFollowing] = useSocialFollow(reel.profiles?.id ?? '', initFollowing);
  const { success: hapticSuccess, warning: hapticWarning, medium: hapticMedium } = useHaptics();
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // ── Mid-roll: "Ad in 5s" notice → ad takes over → reel resumes ─────────────
  const [preCount, setPreCount] = useState<number | null>(null);
  const [takeover, setTakeover] = useState(false);
  const [resumeNotice, setResumeNotice] = useState(false);
  const midRollDoneRef = useRef<string | null>(null);
  const takeoverAdRef = useRef<any>(null);

  useEffect(() => {
    if (!isActive || !midRollAd || midRollDoneRef.current === midRollAd.id) { setPreCount(null); return; }
    let n = 5;
    setPreCount(n);
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(t);
        setPreCount(null);
        midRollDoneRef.current = midRollAd.id;
        takeoverAdRef.current = midRollAd;
        setTakeover(true);
        setIsPaused(true);
        onMidRollStart?.(midRollAd);
      } else {
        setPreCount(n);
      }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, midRollAd?.id]);

  const endTakeover = useCallback(() => {
    const ad = takeoverAdRef.current;
    setTakeover(false);
    setIsPaused(false);
    setResumeNotice(true);
    setTimeout(() => setResumeNotice(false), 1700);
    if (ad) onMidRollEnd?.(ad);
    takeoverAdRef.current = null;
  }, [onMidRollEnd]);

  // Swiped away mid-ad: stop it so it can't keep playing off-screen.
  useEffect(() => {
    if (!isActive && takeover) {
      setTakeover(false);
      const ad = takeoverAdRef.current;
      if (ad) onMidRollEnd?.(ad);
      takeoverAdRef.current = null;
    }
  }, [isActive, takeover]);

  const [isFastForwarding, setIsFastForwarding] = useState(false);
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
  const commentBarH = COMMENT_BAR_HEIGHT + insets.bottom;
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

  // Reset all transient state when reel leaves the viewport
  useEffect(() => {
    if (!isActive) {
      // Pause via ref immediately — this fires before ReelVideo unmounts,
      // cutting audio before expo-video's own async cleanup runs.
      try { playerRef.current?.pause(); } catch {}
      setIsPaused(false);
      setIsFastForwarding(false);
      setProgress(0);
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
      incrementReelView(reel.id).catch((e) => console.warn('[ReelsScreen] incrementView:', e?.message));
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
    if (next) fx.like(); else fx.tick();
    const newCount = likes + (next ? 1 : -1);
    setLiked(next);
    setLikes(newCount);
    SocialSync.emit('REEL_LIKE_CHANGE', { targetId: reel.id, isActive: next, newCount });
    try {
      if (reel._isPost) {
        if (next) await likePost(reel.id, currentUserId);
        else await unlikePost(reel.id, currentUserId);
      } else {
        if (next) await likeReel(reel.id, currentUserId);
        else await unlikeReel(reel.id, currentUserId);
      }
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
    } else if (x > width * 0.65) {
      const newTime = Math.min(player.duration, cur + 10);
      player.currentTime = newTime;
      setProgress(newTime / player.duration);
      triggerSeekFeedback('forward');
    } else {
      if (!liked) toggleLike();
      showHeartAnim();
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
        iconColor: colors.accent,
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
    } catch {}
  };

  return (
    <View style={[styles.reelContainer, { height: itemHeight }]}>
      <Pressable 
        onPress={handleTap} 
        onLongPress={() => {
          if (isActive && !isPaused && !isSeeking) {
            setIsFastForwarding(true);
            hapticMedium();
          }
        }}
        onPressOut={() => setIsFastForwarding(false)}
        delayLongPress={250}
        style={StyleSheet.absoluteFill}
      >
        {/* Thumbnail always visible — acts as poster frame while video loads */}
        {reel.thumbnail_url ? (
          <CachedImage uri={reel.thumbnail_url} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="film-outline" size={64} color="#333" />
          </View>
        )}
        {/* Always mount ReelVideo so it buffers in the background, but it returns null if inactive */}
        {reel.video_url && (
          <ReelVideo
            videoUrl={reel.video_url}
            isActive={isActive}
            isPaused={isPaused}
            muted={muted}
            playbackRate={isFastForwarding ? 2.0 : 1.0}
            onProgress={(p) => { if (!isSeekingRef.current) setProgress(p); }}
            onPlayerReady={(p) => { playerRef.current = p; }}
          />
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
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.topBarBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Search" accessibilityRole="button">
            <Ionicons name="search-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBarBtn} onPress={showOptions} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Options" accessibilityRole="button">
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

        {/* 2x Speed overlay */}
        {isFastForwarding && (
          <View style={styles.fastForwardBadge}>
            <Text style={styles.fastForwardText}>2x speed</Text>
            <Ionicons name="play-forward" size={12} color="#fff" />
          </View>
        )}
      </View>

      {/* Legibility scrim behind the info + actions */}
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.72)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%' }}
      />

      {/* Right actions */}
      <View style={[styles.rightActions, { bottom: commentBarH + 80 }]}>
        <Tap feedback="none" onPress={toggleLike} style={styles.actionItem} accessibilityLabel={liked ? 'Unlike' : 'Like'} accessibilityRole="button">
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={34} color={liked ? '#ff3040' : '#fff'} />
          <Text style={styles.actionLabel}>{likes > 0 ? fmtCount(likes) : 'Like'}</Text>
        </Tap>

        <Tap feedback="none" style={styles.actionItem} onPress={() => setShowComments(true)} accessibilityLabel="Comment" accessibilityRole="button">
          <Ionicons name="chatbubble-outline" size={32} color="#fff" />
          <Text style={styles.actionLabel}>{commentCount > 0 ? fmtCount(commentCount) : 'Comment'}</Text>
        </Tap>

        <Tap feedback="none" style={styles.actionItem} onPress={() => setShowShare(true)} accessibilityLabel="Share" accessibilityRole="button">
          <Ionicons name="paper-plane-outline" size={30} color="#fff" />
          <Text style={styles.actionLabel}>Share</Text>
        </Tap>

        <Tap feedback="none" style={styles.actionItem} onPress={onMuteToggle} accessibilityLabel={muted ? 'Unmute' : 'Mute'} accessibilityRole="button">
          <Ionicons name={muted ? 'volume-mute-outline' : 'volume-high-outline'} size={28} color="#fff" />
          <Text style={styles.actionLabel}>{muted ? 'Unmute' : 'Sound'}</Text>
        </Tap>
      </View>

      {/* Bottom info */}
      <View style={[styles.bottomInfo, { bottom: commentBarH + 14 }]}>
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
              accessibilityLabel={following ? 'Unfollow' : 'Follow'}
              accessibilityRole="button"
            >
              <Text style={[styles.followBtnText, following && styles.followingBtnText]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {reel.caption ? (
          <Pressable onPress={() => setCaptionOpen(v => !v)} accessibilityRole="button" accessibilityLabel={captionOpen ? 'Collapse caption' : 'Expand caption'}>
            <Text style={styles.reelCaption} numberOfLines={captionOpen ? 8 : 2}>{reel.caption}</Text>
          </Pressable>
        ) : null}
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
          <Text style={styles.netErrorTitle}>Couldn’t play this reel</Text>
          <Text style={styles.netErrorSub}>The video failed to load. Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} accessibilityLabel="Retry" accessibilityRole="button">
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Seek bar — 44 px touch target, PanResponder for reliable cross-gesture handling */}
      <View
        style={[styles.seekBarContainer, { bottom: commentBarH }]}
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

      {/* Inline comment bar — replaces navigation bar at bottom */}
      <TouchableOpacity
        style={[styles.commentBar, { paddingBottom: insets.bottom }]}
        onPress={() => setShowComments(true)}
        activeOpacity={0.85}
        accessibilityLabel="Add a comment"
        accessibilityRole="button"
      >
        <View style={styles.commentBarPill}>
          <Text style={styles.commentBarPlaceholder}>Add a comment…</Text>
          <View style={styles.commentBarRight}>
            <Text style={styles.commentBarAt}>@</Text>
            <Ionicons name="happy-outline" size={20} color="rgba(255,255,255,0.55)" />
            <View style={styles.gifPill}>
              <Text style={styles.gifText}>GIF</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <CommentSheet
        visible={showComments}
        targetId={reel.id}
        targetType={reel._isPost ? 'post' : 'reel'}
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

      {/* Pre-ad notice */}
      {preCount !== null && !takeover && (
        <View style={styles.adNotice} pointerEvents="none">
          <Ionicons name="megaphone" size={13} color="#111" />
          <Text style={styles.adNoticeText}>Ad in {preCount}s</Text>
        </View>
      )}

      {/* Resume notice */}
      {resumeNotice && (
        <View style={[styles.adNotice, { backgroundColor: 'rgba(0,0,0,0.65)' }]} pointerEvents="none">
          <Ionicons name="play" size={12} color="#fff" />
          <Text style={[styles.adNoticeText, { color: '#fff' }]}>Continuing your reel…</Text>
        </View>
      )}

      {/* The ad itself */}
      {takeover && takeoverAdRef.current && (
        <ReelMidRollAd
          ad={takeoverAdRef.current}
          forced={isReelAdUnskippable(takeoverAdRef.current)}
          muted={muted}
          dwellMs={midRollDwellMs}
          onImpression={(id) => onAdImpression?.(id)}
          onHide={(id) => onAdHide?.(id)}
          onDone={endTakeover}
        />
      )}
    </View>
  );
});

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
      <StatusBar hidden={false} />

      {/* Simulated dark video area */}
      <View style={skeletonStyles.videoPlaceholder} />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.88)']}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* Top bar - back button only */}
      <View style={[styles.topBar, { top: insets.top + 4, zIndex: 50 }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.topBarBtn, !onBack && { opacity: 0 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={!onBack}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Right actions */}
      <Animated.View style={[skeletonStyles.rightActions, { bottom: COMMENT_BAR_HEIGHT + insets.bottom + 80, opacity }]}>
        {[{ sz: 30, w: 32 }, { sz: 28, w: 28 }, { sz: 26, w: 26 }, { sz: 24, w: 0 }, { sz: 24, w: 0 }].map((item, i) => (
          <View key={i} style={skeletonStyles.actionItem}>
            <View style={[skeletonStyles.circle, { width: item.sz, height: item.sz, borderRadius: item.sz / 2 }]} />
            {item.w > 0 && <View style={[skeletonStyles.actionLabel, { width: item.w }]} />}
          </View>
        ))}
      </Animated.View>

      {/* Bottom info */}
      <Animated.View style={[skeletonStyles.bottomInfo, { bottom: COMMENT_BAR_HEIGHT + insets.bottom + 14, opacity }]}>
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
      <Animated.View style={[skeletonStyles.seekBar, { bottom: COMMENT_BAR_HEIGHT + insets.bottom, opacity }]} />

      {/* Comment bar placeholder */}
      <View style={[skeletonStyles.commentBar, { paddingBottom: insets.bottom }]} />

    </View>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export const ReelsScreen: React.FC<{
  onBack?: () => void;
  isMuted: boolean;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  initialReelId?: string;
  initialReels?: any[];
}> = ({ onBack, isMuted, setIsMuted, initialReelId, initialReels }) => {
  // Pre-populate with the tapped reel at index 0 for instant display — full list
  // loads in the background and is merged in without disrupting playback.
  const [isAppActive, setIsAppActive] = useState(true);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextAppState => {
      setIsAppActive(nextAppState === 'active');
    });
    return () => sub.remove();
  }, []);

  const [rawReels, setRawReels] = useState<any[]>(() => {
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
  const [liveSessions, setLiveSessions] = useState<any[]>([]);
  const [activeLiveSessionId, setActiveLiveSessionId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState('');
  const [containerHeight, setContainerHeight] = useState(height);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reelAds, setReelAds] = useState<any[]>([]);
  const adImpressionsRef = useRef(new Set<string>());
  const reelsListRef = useRef<any>(null);

  // ── Ads: inserted just-in-time, driven by the viewer's plan ─────────────────
  // Instead of baking ad slots into the list up-front, an ad is attached AFTER an
  // upcoming organic reel only when its moment arrives: the viewer has watched
  // enough reels, enough time has passed since the last ad, and their plan's
  // session cap isn't reached. Pro viewers get a lighter schedule (see adDelivery).
  const adPolicy = useAdPolicy();
  const adPolicyRef = useRef(adPolicy);
  adPolicyRef.current = adPolicy;
  const reelPolicy = adPolicy.reels;
  const [adAnchors, setAdAnchors] = useState<Record<string, any>>({}); // reel id -> ad shown after it
  const [midRoll, setMidRoll] = useState<{ reelId: string; ad: any } | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);
  // Alternate ad styles: a mid-roll over the playing reel, then a between-reels card.
  const nextKindRef = useRef<'midroll' | 'card'>('midroll');
  const adSeedRef = useRef(Math.floor(Math.random() * 1000));
  const adsShownRef = useRef(0);
  const lastAdAtRef = useRef(0);
  const lastAdOrganicRef = useRef(0);
  const organicViewedRef = useRef(0);
  const pendingAdRef = useRef(false);
  const adCursorRef = useRef(0);

  // Build the mixed list: organic reels, live cards and any anchored ad.
  const LIVE_INTERVAL = 5;
  const reels = React.useMemo(() => {
    const result: any[] = [];
    let liveIdx = 0;
    rawReels.forEach((reel, i) => {
      result.push(reel);
      if (liveSessions.length > 0 && (i + 1) % LIVE_INTERVAL === 0 && liveIdx < liveSessions.length) {
        result.push({ ...liveSessions[liveIdx++], _type: 'live' });
      }
      const ad = adAnchors[reel.id];
      if (ad) result.push({ id: `__reel_ad_${ad.id}_${reel.id}__`, _type: 'reel_ad', ad });
    });
    return result;
  }, [rawReels, liveSessions, adAnchors]);

  const handleMidRollStart = useCallback((ad: any) => {
    midRollStartedRef.current = true;
    pendingAdRef.current = false;
    adsShownRef.current += 1;
    lastAdAtRef.current = Date.now();
    lastAdOrganicRef.current = organicViewedRef.current;
    nextKindRef.current = 'card';
    if (isReelAdUnskippable(ad)) setScrollLocked(true); // forced ads hold the screen
  }, []);
  const handleMidRollEnd = useCallback(() => {
    midRollStartedRef.current = false;
    setScrollLocked(false);
    setMidRoll(null);
  }, []);

  const handleAdHide = useCallback((adId: string) => {
    setReelAds(prev => prev.filter(a => a.id !== adId));
    setAdAnchors(prev => {
      const next: Record<string, any> = {};
      Object.entries(prev).forEach(([k, v]) => { if (v.id !== adId) next[k] = v; });
      return next;
    });
  }, []);

  const { success: hapticSuccess, medium: hapticMedium, light: impactLight } = useHaptics();
  const { colors } = useTheme();
  // 51 %: the moment a new reel is more than halfway on screen, we switch
  // active state to trigger immediate playback. This provides the "snappy"
  // experience found on top-tier social platforms.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 51 }).current;
  const reelsRef = useRef<any[]>([]);
  reelsRef.current = reels;
  const rawReelsRef = useRef<any[]>([]);
  rawReelsRef.current = rawReels;
  const reelAdsRef = useRef<any[]>([]);
  reelAdsRef.current = reelAds;
  const adAnchorsRef = useRef<Record<string, any>>({});
  adAnchorsRef.current = adAnchors;

  /** Decide — right now — whether an ad should be attached a couple of reels ahead. */
  const maybeScheduleAd = useCallback((activeItemIndex: number) => {
    if (pendingAdRef.current) return;
    const pool = reelAdsRef.current;
    if (pool.length === 0) return;
    const pol = reelPolicy;
    if (adsShownRef.current >= pol.sessionCap) return;

    const organicSince = organicViewedRef.current - lastAdOrganicRef.current;
    const needed = adsShownRef.current === 0
      ? pol.firstAfter
      : scaleIntervalForCampaign(pol.interval, adFrequencyInterval(pool[0].budget ?? 60, pool[0].reach_multiplier ?? 1))
        + (((adSeedRef.current + adsShownRef.current * 7) % 3) - 1); // ±1 jitter per session
    if (organicSince < needed) return;
    if (lastAdAtRef.current !== 0 && Date.now() - lastAdAtRef.current < pol.minGapMs) return;

    // Mid-roll: attach the ad to the reel that's playing right now.
    if (nextKindRef.current === 'midroll') {
      const cur = reelsRef.current[activeItemIndex];
      if (!cur || cur._type) return;
      const ad = pool[adCursorRef.current % pool.length];
      adCursorRef.current++;
      pendingAdRef.current = true;
      setMidRoll({ reelId: cur.id, ad });
      return;
    }

    // Anchor on the organic reel two ahead so the swap never happens under the viewer.
    const list = reelsRef.current;
    let ahead = 0;
    let anchor: any = null;
    for (let i = activeItemIndex + 1; i < list.length; i++) {
      const it = list[i];
      if (it._type === 'live' || it._type === 'reel_ad') continue;
      ahead++;
      if (ahead === 2) { anchor = it; break; }
    }
    if (!anchor || adAnchorsRef.current[anchor.id]) return;

    const ad = pool[adCursorRef.current % pool.length];
    adCursorRef.current++;
    pendingAdRef.current = true;
    setAdAnchors(prev => ({ ...prev, [anchor.id]: ad }));
  }, [reelPolicy]);

  // FlatList forbids changing onViewableItemsChanged after mount, so keep this
  // callback identity-stable and reach the latest scheduler through a ref.
  const midRollStartedRef = useRef(false);
  const maybeScheduleRef = useRef(maybeScheduleAd);
  maybeScheduleRef.current = maybeScheduleAd;
  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length === 0) return;
    const top = viewableItems[0];
    const newIndex = top.index ?? 0;
    const item = top.item;

    if (item?._type === 'reel_ad') {
      // The ad has arrived on screen: this is the moment the pacing clock restarts.
      if (pendingAdRef.current) {
        pendingAdRef.current = false;
        adsShownRef.current += 1;
        lastAdAtRef.current = Date.now();
        lastAdOrganicRef.current = organicViewedRef.current;
        nextKindRef.current = 'midroll';
      }
    } else if (item && item._type !== 'live') {
      // Count organic reels by position among organic items only.
      let n = 0;
      const list = reelsRef.current;
      for (let i = 0; i <= newIndex && i < list.length; i++) {
        if (list[i]._type !== 'live' && list[i]._type !== 'reel_ad') n++;
      }
      organicViewedRef.current = Math.max(organicViewedRef.current, n);
      maybeScheduleRef.current(newIndex);
    }

    // A mid-roll that never started (viewer swiped first) is cancelled, not counted.
    setMidRoll(prev => {
      if (prev && item && item.id !== prev.reelId && !midRollStartedRef.current) {
        pendingAdRef.current = false;
        return null;
      }
      return prev;
    });

    setActiveIndex(prev => (prev !== newIndex ? newIndex : prev));
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    const safetyTimer = setTimeout(() => setLoading(false), 15000);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const [reelsData, likedData, likedPostData, followingData, liveData, profData] = await Promise.all([
        // Fall through to the global reel feed not only on throw but also when
        // the personalized query returns an empty array (new users / cold-start),
        // otherwise the screen flashes "No reels yet" while reels exist globally.
        getPersonalizedReels(user.id, 10, 0)
          .then(r => (Array.isArray(r) && r.length > 0 ? r : getReels(10, 0).catch(() => [])))
          .catch(() => getReels(10, 0).catch(() => [])),
        getLikedReelIds(user.id).catch(() => [] as string[]),
        getLikedPostIds(user.id).catch(() => [] as string[]),
        getFollowing(user.id).catch(() => [] as any[]),
        supabase
          .from('live_sessions')
          .select('*, profiles!creator_id(id, username, avatar_url, university)')
          .eq('status', 'live')
          .gt('started_at', twelveHoursAgo)
          .neq('creator_id', user.id),
        supabase.from('profiles').select('university').eq('id', user.id).single().then(r => r.data, () => null),
      ]);
      setLikedIds(new Set(likedData));
      setLikedPostIds(new Set(likedPostData));
      setFollowingIds(new Set((followingData ?? []).map((p: any) => p?.id).filter(Boolean)));
      setLiveSessions(liveData.data ?? []);
      getActiveAdsForPlacement('reels', profData?.university ?? null, user.id)
        .then(ads => filterEligibleAds(ads, adPolicyRef.current))
        .then(setReelAds)
        .catch((e) => console.warn('[ReelsScreen] loadAds:', e?.message));
      const newReels: any[] = reelsData ?? [];
      setRawReels(prev => {
        const combined = prev.length ? [...prev, ...newReels.filter((r: any) => !prev.some(p => p.id === r.id))] : newReels;
        return combined;
      });
      setOffset(newReels.length);
      setHasMore(newReels.length === 10);
    } catch (err) {
      console.error('Reels load error:', err);
      setLoadError(true);
    } finally {
      clearTimeout(safetyTimer);
      setLoading(false);
    }
  }, [initialReelId, initialReels]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !currentUserId) return;
    setLoadingMore(true);
    try {
      const more = await getPersonalizedReels(currentUserId, 10, offset);
      if (more.length === 0) {
        setHasMore(false);
        return;
      }
      setRawReels(prev => {
        const next = [...prev];
        more.forEach(m => {
          if (!next.some(r => r.id === m.id)) next.push(m);
        });
        return next;
      });
      setOffset(prev => prev + more.length);
      setHasMore(more.length === 10);
    } catch (err) {
      console.warn('Reels loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, currentUserId, offset]);

  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (!initialLoadRef.current) {
      load();
      initialLoadRef.current = true;
    }
  }, [load]);

  useEffect(() => {
    const reelSub = SocialSync.on('REEL_DELETE', ({ targetId }) => {
      setRawReels(prev => prev.filter(r => r.id !== targetId));
    });
    const liveEndedSub = SocialSync.on('LIVE_ENDED', ({ id }) => {
      setLiveSessions(prev => prev.filter(ls => ls.id !== id));
    });
    const liveStartedSub = SocialSync.on('LIVE_STARTED', async ({ id }) => {
      if (!id || !currentUserId) return;
      const { data } = await supabase
        .from('live_sessions')
        .select('*, profiles!creator_id(id, username, avatar_url, university)')
        .eq('id', id)
        .neq('creator_id', currentUserId)
        .single();
      if (data) setLiveSessions(prev => prev.some(s => s.id === id) ? prev : [data, ...prev]);
    });
    return () => { reelSub.remove(); liveEndedSub.remove(); liveStartedSub.remove(); };
  }, [currentUserId]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: containerHeight,
    offset: containerHeight * index,
    index,
  }), [containerHeight]);

  // Stable callbacks so memoized children (ReelItem, ReelAdCard) don't re-render
  // every time ReelsScreen's parent state changes.
  const handleToggleMute = useCallback(() => setIsMuted(m => !m), []);
  const handleLivePress = useCallback((sessionId: string) => setActiveLiveSessionId(sessionId), []);
  const handleAdImpression = useCallback((adId: string) => {
    // Called by ReelAdCard only after the ad stayed on screen for the dwell time.
    if (adImpressionsRef.current.has(adId)) return;
    adImpressionsRef.current.add(adId);
    noteAdShown(adId).catch(() => {});
    recordCampusAdImpression(adId, 'reels').catch((e) => console.warn('[ReelsScreen] adImpression:', e?.message));
  }, []);
  const keyExtractor = useCallback(
    (r: any) => `${r._type === 'live' ? 'live-' : r._type === 'reel_ad' ? 'ad-' : ''}${r.id}`,
    []
  );

  const renderItem = useCallback(({ item, index }: any) => {
    if (item._type === 'live') {
      return (
        <LivePreviewCard
          session={item}
          itemHeight={containerHeight}
          onJoin={handleLivePress}
        />
      );
    }
    if (item._type === 'reel_ad') {
      return (
        <ReelAdCard
          ad={item.ad}
          isActive={index === activeIndex && isAppActive}
          itemHeight={containerHeight}
          onImpression={handleAdImpression}
          onHide={handleAdHide}
          currentUserId={currentUserId}
          muted={isMuted}
          onMuteToggle={handleToggleMute}
          dwellMs={reelPolicy.dwellMs}
        />
      );
    }
    return (
      <ReelItem
        reel={item}
        currentUserId={currentUserId}
        isLiked={item._isPost ? likedPostIds.has(item.id) : likedIds.has(item.id)}
        isFollowingUser={followingIds.has(item.profiles?.id)}
        isActive={index === activeIndex && isAppActive}
        muted={isMuted}
        onMuteToggle={handleToggleMute}
        itemHeight={containerHeight}
        onBack={onBack}
        midRollAd={midRoll && midRoll.reelId === item.id ? midRoll.ad : null}
        midRollDwellMs={reelPolicy.dwellMs}
        onMidRollStart={handleMidRollStart}
        onMidRollEnd={handleMidRollEnd}
        onAdImpression={handleAdImpression}
        onAdHide={handleAdHide}
      />
    );
  }, [
    containerHeight, activeIndex, isAppActive, currentUserId,
    likedPostIds, likedIds, followingIds, isMuted,
    handleLivePress, handleAdImpression, handleAdHide, handleToggleMute, onBack, reelPolicy.dwellMs,
    midRoll, handleMidRollStart, handleMidRollEnd
  ]);

  if (loading) {
    return (
      <FadeIn visible={loading} duration={180} style={{ flex: 1 }}>
        <ReelSkeleton onBack={onBack} />
      </FadeIn>
    );
  }

  if (reels.length === 0) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar hidden={false} />
        {onBack && (
          <TouchableOpacity
            style={{ position: 'absolute', top: 52, left: 16, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 }}
            onPress={onBack}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <Ionicons name={loadError ? 'cloud-offline-outline' : 'film-outline'} size={64} color={colors.textMuted} />
        <Text style={{ color: colors.text, marginTop: 16, fontSize: 17, fontWeight: '700' }}>{loadError ? 'Couldn\'t load reels' : 'No reels yet'}</Text>
        <Text style={{ color: colors.textMuted, marginTop: 6, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }}>
          {loadError ? 'Check your connection and try again.' : 'Post a reel using the + button!'}
        </Text>
        {loadError && (
          <TouchableOpacity
            onPress={() => { setLoadError(false); setLoading(true); load(); }}
            style={{ backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12, marginTop: 20 }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Try again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden={false} />
      <View
        style={{ flex: 1 }}
        onLayout={e => setContainerHeight(e.nativeEvent.layout.height)}
      >
        <FlatList
          ref={reelsListRef}
          scrollEnabled={!scrollLocked}
          data={reels}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          windowSize={5}
          maxToRenderPerBatch={3}
          initialNumToRender={2}
          removeClippedSubviews={true}
          getItemLayout={getItemLayout}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color="#fff" style={{ marginVertical: 20 }} /> : undefined}
        />
      </View>

      {/* Live viewer overlay — opens when user taps "Join Live" on a live card */}
      {activeLiveSessionId && (() => {
        const { LiveScreen } = require('./LiveScreen');
        return (
          <View style={StyleSheet.absoluteFill}>
            <LiveScreen
              viewerSessionId={activeLiveSessionId}
              onClose={() => setActiveLiveSessionId(null)}
            />
          </View>
        );
      })()}
    </View>
  );
};


const skeletonStyles = StyleSheet.create({
  videoPlaceholder: {
    ...StyleSheet.absoluteFill,
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
  commentBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: COMMENT_BAR_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  reelContainer: { width, position: 'relative', overflow: 'hidden' },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 350, backgroundColor: 'transparent' },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, backgroundColor: 'transparent', zIndex: 5 },
  topBar: {
    position: 'absolute', left: 0, right: 0, zIndex: 999, elevation: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  topBarBtn: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
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
  reelAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' },
  reelUsername: {
    color: '#fff', fontWeight: 'bold', fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  adNotice: { position: 'absolute', top: 64, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#facc15', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 7, zIndex: 40 },
  adNoticeText: { color: '#111', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  followBtn: { backgroundColor: 'transparent', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.85)' },
  followingBtn: { borderColor: 'rgba(255,255,255,0.35)' },
  followBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  followingBtnText: { color: 'rgba(255,255,255,0.65)' },
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
    paddingHorizontal: 22, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)',
  },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  fastForwardBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 10,
  },
  fastForwardText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Inline comment bar (replaces nav bar) ─────────────────────────────────
  commentBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.82)',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  commentBarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 10,
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  commentBarPlaceholder: {
    flex: 1,
    color: 'rgba(255,255,255,0.38)',
    fontSize: 14,
  },
  commentBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  commentBarAt: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 17,
    fontWeight: '700',
  },
  gifPill: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  gifText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── In-Stream Ad Demo ─────────────────────────────────────────────────────
  inStreamContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inStreamBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  inStreamContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  inStreamBadge: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 16,
  },
  inStreamBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  inStreamTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  inStreamSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
  },
  inStreamBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  inStreamBrandAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#fff',
  },
  inStreamBrandName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  inStreamCountdownRow: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 16,
  },
  inStreamCountdownText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  inStreamCTABtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  inStreamCTAText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
  inStreamTimerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  inStreamTimerText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  inStreamFooter: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
  inStreamSkipBtn: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  inStreamSkipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
