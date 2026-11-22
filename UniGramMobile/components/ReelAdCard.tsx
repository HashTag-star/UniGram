import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Share, Animated, Easing, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from './CachedImage';
import {
  recordCampusAdClick, buildWhatsAppCtaUrl, likeAd, unlikeAd, getLikedAdIds,
} from '../services/campusAds';
import { hideAd, AD_WHY_TEXT } from '../services/adDelivery';
import { usePopup } from '../context/PopupContext';
import { CommentSheet } from './CommentSheet';
import { Tap } from './ui/Tap';
import { fx } from '../lib/feedback';

function fmtCount(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ── Video creative ────────────────────────────────────────────────────────────
// Plays like a normal reel: loops, user can swipe away any time. Progress is
// reported to the parent so the bottom bar reflects real playback.
const ReelAdVideo: React.FC<{
  url: string;
  isActive: boolean;
  muted: boolean;
  onProgress: (ratio: number) => void;
  onSourceError?: () => void;
}> = React.memo(({ url, isActive, muted, onProgress, onSourceError }) => {
  const player = useVideoPlayer(url, p => {
    p.loop = true;
    p.muted = muted;
    p.audioMixingMode = 'duckOthers';
  });

  useEffect(() => { player.muted = muted; }, [muted, player]);

  useEffect(() => {
    if (isActive) {
      try { player.play(); } catch { onSourceError?.(); }
    } else {
      try { player.pause(); player.currentTime = 0; } catch {}
    }
  }, [isActive, player]);

  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(() => {
      const d = player.duration;
      if (d > 0) onProgress(Math.min(1, (player.currentTime ?? 0) / d));
    }, 150);
    return () => clearInterval(t);
  }, [isActive, player, onProgress]);

  useEffect(() => {
    const sub = player.addListener('statusChange', (evt: any) => {
      if (evt?.status === 'error' || evt?.error) onSourceError?.();
    });
    return () => sub.remove();
  }, [player, onSourceError]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
});

// ── Main card ─────────────────────────────────────────────────────────────────
export const ReelAdCard: React.FC<{
  ad: any;
  isActive: boolean;
  itemHeight: number;
  /** Called once the ad has been on screen long enough to count as an impression. */
  onImpression: (adId: string) => void;
  /** Viewer hid/reported this ad — parent removes it from the list. */
  onHide: (adId: string) => void;
  currentUserId: string;
  muted?: boolean;
  onMuteToggle?: () => void;
  /** Dwell required before an impression counts (ms). */
  dwellMs?: number;
}> = React.memo(({ ad, isActive, itemHeight, onImpression, onHide, currentUserId, muted = false, onMuteToggle, dwellMs = 2000 }) => {
  const insets = useSafeAreaInsets();
  const { showPopup } = usePopup();

  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(ad.likes_count ?? 0);
  const [commentCount, setCommentCount] = useState(ad.comments_count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const imagePulse = useRef(new Animated.Value(0)).current;

  const isVideo = ad.format === 'video' && !!ad.media_url && !videoError;
  const isImage = (ad.format === 'image' || (ad.format === 'video' && videoError) || ad.format === 'carousel') && !!(ad.media_url || ad.cards?.[0]?.image_url);
  const imageUri = ad.media_url || ad.cards?.[0]?.image_url;
  const advertiserName = ad.profiles?.full_name || (ad.profiles?.username ? `@${ad.profiles.username}` : ad.name);
  const avatarUri = ad.profiles?.avatar_url ?? null;

  // ── Impression: only after the ad has really been watched for `dwellMs` ───
  const countedRef = useRef(false);
  useEffect(() => {
    if (!isActive) return;
    if (countedRef.current) return;
    const t = setTimeout(() => {
      countedRef.current = true;
      onImpression(ad.id);
    }, dwellMs);
    return () => clearTimeout(t);
  }, [isActive, ad.id, dwellMs]);

  // Static creatives get a slow ambient "progress" so the bar still communicates time.
  useEffect(() => {
    if (!isActive || isVideo) { progress.setValue(0); return; }
    progress.setValue(0);
    const a = Animated.timing(progress, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [isActive, isVideo]);

  useEffect(() => {
    if (currentUserId && ad.id) {
      getLikedAdIds(currentUserId).then(ids => setLiked(ids.includes(ad.id))).catch(() => {});
    }
  }, [ad.id, currentUserId]);

  const toggleLike = async () => {
    if (!currentUserId || !ad.id) return;
    const next = !liked;
    if (next) fx.like(); else fx.tick();
    setLiked(next);
    setLikesCount((p: number) => Math.max(0, next ? p + 1 : p - 1));
    try {
      if (next) await likeAd(ad.id, currentUserId); else await unlikeAd(ad.id, currentUserId);
    } catch {
      setLiked(!next);
      setLikesCount((p: number) => Math.max(0, !next ? p + 1 : p - 1));
    }
  };

  const handleShare = async () => {
    try {
      const shareUrl = ad.link || `https://unigram.social/ad/${ad.id}`;
      await Share.share({ message: `Check this out on UniGram: ${ad.headline || ad.name || ''} ${shareUrl}`, url: shareUrl });
    } catch {}
  };

  const handleCTA = async () => {
    recordCampusAdClick(ad.id, 'reels').catch(() => {});
    const targetUrl = buildWhatsAppCtaUrl(ad) || ad.link;
    if (!targetUrl) return;
    try {
      if (await Linking.canOpenURL(targetUrl)) await Linking.openURL(targetUrl);
    } catch {}
  };

  const openMenu = () => {
    showPopup({
      title: 'Sponsored',
      message: advertiserName ? `Ad from ${advertiserName}` : undefined,
      icon: 'megaphone-outline',
      buttons: [
        { text: 'Hide this ad', onPress: () => { hideAd(ad.id, 'hide'); onHide(ad.id); } },
        { text: 'Report ad', style: 'destructive', onPress: () => { hideAd(ad.id, 'report'); onHide(ad.id); } },
        {
          text: 'Why am I seeing this?',
          onPress: () => setTimeout(() => showPopup({
            title: 'Why you’re seeing this ad',
            message: AD_WHY_TEXT,
            icon: 'information-circle-outline',
            buttons: [{ text: 'Got it', onPress: () => {} }],
          }), 250),
        },
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
      ],
    });
  };

  return (
    <View style={[styles.container, { height: itemHeight }]}>
      {/* Creative */}
      {isVideo ? (
        <ReelAdVideo
          url={ad.media_url}
          isActive={isActive}
          muted={muted}
          onProgress={(r) => progress.setValue(r)}
          onSourceError={() => setVideoError(true)}
        />
      ) : isImage ? (
        <CachedImage uri={imageUri} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#1e1b4b', '#4c1d95', '#701a75']} style={[StyleSheet.absoluteFill, styles.textBg]}>
          {ad.headline ? <Text style={styles.textHeadline}>{ad.headline}</Text> : null}
          {ad.body ? <Text style={styles.textBody}>{ad.body}</Text> : null}
        </LinearGradient>
      )}

      <LinearGradient colors={['rgba(0,0,0,0.38)', 'transparent']} style={styles.topGrad} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']} style={styles.bottomGrad} pointerEvents="none" />

      {/* Top-right: sound + menu */}
      <View style={[styles.topRight, { top: insets.top + 10 }]}>
        {isVideo && onMuteToggle ? (
          <TouchableOpacity onPress={onMuteToggle} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel={muted ? 'Unmute' : 'Mute'}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={openMenu} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel="Ad options">
          <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Bottom info + CTA */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.leftCol}>
          <View style={styles.advertiserRow}>
            {avatarUri ? (
              <CachedImage uri={avatarUri} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="megaphone" size={17} color="#fff" /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.advertiserName} numberOfLines={1}>{advertiserName}</Text>
              <Text style={styles.sponsored}>Sponsored</Text>
            </View>
          </View>

          {ad.headline && ad.format !== 'text' ? <Text style={styles.headline} numberOfLines={2}>{ad.headline}</Text> : null}
          {ad.body && ad.format !== 'text' ? <Text style={styles.body} numberOfLines={2}>{ad.body}</Text> : null}

          <Pressable onPress={handleCTA} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={ad.cta || 'Learn more'}>
            <Text style={styles.ctaText}>{ad.cta || 'Learn more'}</Text>
            <Ionicons name="chevron-forward" size={16} color="#111" />
          </Pressable>
        </View>

        <View style={styles.rightCol}>
          <Tap feedback="none" onPress={toggleLike} style={styles.actionItem} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={32} color={liked ? '#ff3040' : '#fff'} />
            <Text style={styles.actionLabel}>{likesCount > 0 ? fmtCount(likesCount) : 'Like'}</Text>
          </Tap>
          <Tap feedback="none" onPress={() => setShowComments(true)} style={styles.actionItem} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Comments">
            <Ionicons name="chatbubble-outline" size={29} color="#fff" />
            <Text style={styles.actionLabel}>{commentCount > 0 ? fmtCount(commentCount) : 'Comment'}</Text>
          </Tap>
          <Tap feedback="none" onPress={handleShare} style={styles.actionItem} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Share">
            <Ionicons name="paper-plane-outline" size={28} color="#fff" />
            <Text style={styles.actionLabel}>Share</Text>
          </Tap>
        </View>
      </View>

      {/* Progress hairline */}
      <View style={styles.progressTrack} pointerEvents="none">
        <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>

      <CommentSheet
        visible={showComments}
        targetId={ad.id}
        targetType="ad"
        currentUserId={currentUserId}
        authorId={ad.user_id || ''}
        onClose={() => setShowComments(false)}
        onCountChange={(n) => setCommentCount(n)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%', backgroundColor: '#000', overflow: 'hidden', position: 'relative' },
  textBg: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  textHeadline: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 34, letterSpacing: -0.5 },
  textBody: { color: 'rgba(255,255,255,0.78)', fontSize: 16, textAlign: 'center', lineHeight: 23, marginTop: 10 },

  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 110 },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 320 },

  topRight: { position: 'absolute', right: 12, flexDirection: 'row', gap: 10, zIndex: 5 },
  roundBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' },

  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 14, gap: 10 },
  leftCol: { flex: 1, gap: 9 },
  rightCol: { alignItems: 'center', gap: 20, paddingBottom: 64 },
  actionItem: { alignItems: 'center', gap: 3 },
  actionLabel: { color: '#fff', fontSize: 12, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

  advertiserRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' },
  avatarFallback: { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  advertiserName: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  sponsored: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 1 },
  headline: { color: '#fff', fontSize: 14.5, fontWeight: '600', lineHeight: 19 },
  body: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 13, marginTop: 4, alignSelf: 'stretch',
  },
  ctaText: { color: '#111', fontSize: 15, fontWeight: '700' },

  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, backgroundColor: 'rgba(255,255,255,0.22)' },
  progressFill: { height: '100%', backgroundColor: '#fff' },
});
