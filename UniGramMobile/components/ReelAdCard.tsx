import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Linking, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from './CachedImage';
import { recordCampusAdClick, isReelAdUnskippable, FORCED_REEL_AD_SECONDS, buildWhatsAppCtaUrl } from '../services/campusAds';

const SKIP_DELAY = 5;

// ── Video background ──────────────────────────────────────────────────────────
// `loop` is now controlled by the parent — forced-view ads should play through
// once and then auto-advance rather than loop forever.
const ReelAdVideo: React.FC<{
  url: string;
  isActive: boolean;
  loop: boolean;
  onEnded?: () => void;
}> = React.memo(({ url, isActive, loop, onEnded }) => {
  const player = useVideoPlayer(url, p => {
    p.loop = loop;
    p.muted = false;
    p.audioMixingMode = 'duckOthers';
  });
  useEffect(() => { player.loop = loop; }, [loop, player]);
  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);
  useEffect(() => {
    if (!onEnded) return;
    const sub = player.addListener('playToEnd', () => onEnded());
    return () => sub.remove();
  }, [player, onEnded]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
});

// ── Main card ─────────────────────────────────────────────────────────────────
export const ReelAdCard: React.FC<{
  ad: any;
  isActive: boolean;
  itemHeight: number;
  onSkip: () => void;
  onImpression: (adId: string) => void;
}> = React.memo(({ ad, isActive, itemHeight, onSkip, onImpression }) => {
  const insets = useSafeAreaInsets();

  // ~1/3 of ads are forced-view (no skip) per Instagram-style monetization.
  // Decision is stable per ad id so the same ad behaves the same every view.
  const forced = isReelAdUnskippable(ad);

  // Duration the user must endure on a forced ad. For static creatives we use
  // FORCED_REEL_AD_SECONDS; for videos we let the clip's `playToEnd` event
  // trigger auto-advance and use this as a safety cap (clamped 6-15s).
  const forcedDuration = Math.min(15, Math.max(6, FORCED_REEL_AD_SECONDS));

  const [canSkip, setCanSkip] = useState(false);
  const [countdown, setCountdown] = useState(forced ? forcedDuration : SKIP_DELAY);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Re-entrancy guard so we don't trigger onSkip multiple times when both the
  // timer reaches zero AND the video playToEnd event fires.
  const advancedRef = useRef(false);

  const isVideo = ad.format === 'video' && !!ad.media_url;
  const advertiserName = ad.profiles?.full_name || (ad.profiles?.username ? `@${ad.profiles.username}` : ad.name);
  const avatarUri = ad.profiles?.avatar_url ?? null;

  const autoAdvance = () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    onSkip();
  };

  useEffect(() => {
    if (isActive) {
      onImpression(ad.id);
      advancedRef.current = false;
      setCanSkip(false);
      const startCount = forced ? forcedDuration : SKIP_DELAY;
      setCountdown(startCount);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            if (forced) {
              // Forced ad finished — auto-advance to next reel.
              autoAdvance();
            } else {
              setCanSkip(true);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      advancedRef.current = false;
      setCanSkip(false);
      setCountdown(forced ? forcedDuration : SKIP_DELAY);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, ad.id, forced]);

  const handleCTA = async () => {
    recordCampusAdClick(ad.id).catch(() => {});
    // Prefer the WhatsApp deep-link when the campaign opted into
    // click-to-WhatsApp; fall back to the generic link otherwise.
    const targetUrl = buildWhatsAppCtaUrl(ad) || ad.link;
    if (!targetUrl) return;
    try {
      const ok = await Linking.canOpenURL(targetUrl);
      if (ok) await Linking.openURL(targetUrl);
      else Alert.alert('Cannot open link', targetUrl);
    } catch {}
  };

  return (
    <View style={[styles.container, { height: itemHeight }]}>

      {/* ── Background creative ────────────────────────────────────────── */}
      {isVideo ? (
        <ReelAdVideo
          url={ad.media_url}
          isActive={isActive}
          // Forced ads play through once and auto-advance; skippable ads loop
          // until the user swipes.
          loop={!forced}
          onEnded={forced ? autoAdvance : undefined}
        />
      ) : ad.media_url ? (
        <CachedImage uri={ad.media_url} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        // Text / no-media fallback — indigo branded card
        <View style={[StyleSheet.absoluteFill, styles.solidBg]}>
          <Ionicons name="megaphone" size={52} color="rgba(255,255,255,0.15)" style={{ marginBottom: 20 }} />
          {ad.headline ? <Text style={styles.textAdHeadline}>{ad.headline}</Text> : null}
          {ad.body    ? <Text style={styles.textAdBody}>{ad.body}</Text> : null}
        </View>
      )}

      {/* ── Gradient overlays ──────────────────────────────────────────── */}
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'transparent']}
        style={styles.topGrad}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.82)']}
        style={styles.bottomGrad}
        pointerEvents="none"
      />

      {/* ── Top-right: skip / countdown ──────────────────────────────────
          - Skippable ad: shows a numeric countdown for 5s, then "Skip Ad".
          - Forced-view ad: shows "Ad · 12s" (no skip), counts to 0, then
            auto-advances. The pill stays visible the whole time so the user
            knows the ad will end. */}
      <View style={[styles.skipWrap, { top: insets.top + 12 }]}>
        {forced ? (
          <View style={[styles.countdownPill, styles.forcedPill]}>
            <Text style={styles.forcedPillLabel}>Ad</Text>
            <View style={styles.forcedDot} />
            <Text style={styles.countdownText}>{countdown}s</Text>
          </View>
        ) : canSkip ? (
          <TouchableOpacity style={styles.skipBtn} onPress={onSkip} activeOpacity={0.85}>
            <Text style={styles.skipBtnText}>Skip Ad</Text>
            <Ionicons name="play-skip-forward" size={12} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.countdownPill}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        )}
      </View>

      {/* ── Bottom overlay ─────────────────────────────────────────────── */}
      <View style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 20 }]}>

        {/* Left column: advertiser info + CTA */}
        <View style={styles.leftCol}>
          {/* Advertiser row */}
          <View style={styles.advertiserRow}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="megaphone" size={17} color="#fff" />
              </View>
            )}
            <View style={styles.nameBlock}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.advertiserName} numberOfLines={1}>{advertiserName}</Text>
                <View style={styles.adPill}>
                  <Text style={styles.adPillText}>Ad</Text>
                </View>
              </View>
              {ad.headline ? (
                <Text style={styles.caption} numberOfLines={2}>{ad.headline}</Text>
              ) : null}
            </View>
          </View>

          {/* CTA button */}
          <TouchableOpacity style={styles.ctaBtn} onPress={handleCTA} activeOpacity={0.85}>
            <Text style={styles.ctaBtnText}>{ad.cta || 'Learn More'}</Text>
            <Ionicons name="arrow-forward" size={14} color="#111" />
          </TouchableOpacity>
        </View>

        {/* Right column: action icons (decorative — matches regular reel layout) */}
        <View style={styles.rightCol}>
          <View style={styles.actionItem}>
            <Ionicons name="heart-outline" size={28} color="#fff" />
          </View>
          <View style={styles.actionItem}>
            <Ionicons name="chatbubble-ellipses-outline" size={26} color="#fff" />
          </View>
          <View style={styles.actionItem}>
            <Ionicons name="paper-plane-outline" size={26} color="#fff" />
          </View>
          <View style={styles.actionItem}>
            <Ionicons name="bookmark-outline" size={26} color="#fff" />
          </View>
        </View>

      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  solidBg: {
    backgroundColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 4,
  },
  textAdHeadline: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 32,
  },
  textAdBody: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },

  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 260 },

  // Skip / countdown
  skipWrap: { position: 'absolute', right: 14 },
  skipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  skipBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  countdownPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    minWidth: 32, alignItems: 'center',
  },
  countdownText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  forcedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minWidth: 0,
  },
  forcedPillLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  forcedDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },

  // Bottom overlay
  bottomOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 14, paddingTop: 20, gap: 10,
  },
  leftCol: { flex: 1, gap: 12 },
  rightCol: {
    alignItems: 'center', gap: 18,
    paddingBottom: 4,
  },
  actionItem: { alignItems: 'center' },

  // Advertiser info
  advertiserRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  avatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
  },
  nameBlock: { flex: 1, gap: 3 },
  advertiserName: { color: '#fff', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  adPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  adPillText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  caption: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 18,
  },

  // CTA button
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#fff',
    borderRadius: 10, paddingVertical: 11,
    alignSelf: 'stretch',
  },
  ctaBtnText: { color: '#111', fontSize: 14, fontWeight: '700' },
});
