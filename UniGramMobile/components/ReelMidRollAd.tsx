import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Linking, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from './CachedImage';
import { Tap } from './ui/Tap';
import { recordCampusAdClick, buildWhatsAppCtaUrl, type ReelAdKind } from '../services/campusAds';
import { hideAd, AD_WHY_TEXT } from '../services/adDelivery';
import { usePopup } from '../context/PopupContext';
import { fx } from '../lib/feedback';

/** Max time an ad holds the screen, and how long before a skippable ad can be skipped. */
export const MIDROLL_MAX_SECONDS = 15;
/** 'full' ads play to their natural end, capped so a long clip can't hold the reel hostage. */
export const MIDROLL_FULL_CAP_SECONDS = 30;
export const MIDROLL_SKIP_AFTER = 5;

const AdVideo: React.FC<{ url: string; muted: boolean; onEnded: () => void; onError: () => void }> = React.memo(({ url, muted, onEnded, onError }) => {
  const player = useVideoPlayer(url, p => { p.loop = false; p.muted = muted; p.audioMixingMode = 'duckOthers'; });
  useEffect(() => { player.muted = muted; }, [muted, player]);
  useEffect(() => { try { player.play(); } catch { onError(); } }, [player]);
  useEffect(() => {
    const a = player.addListener('playToEnd', () => onEnded());
    const b = player.addListener('statusChange', (e: any) => { if (e?.status === 'error' || e?.error) onError(); });
    return () => { a.remove(); b.remove(); };
  }, [player, onEnded, onError]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
});

interface Props {
  ad: any;
  kind: ReelAdKind;
  muted: boolean;
  dwellMs?: number;
  onImpression: (adId: string) => void;
  /** Ad finished or was skipped — the reel resumes. */
  onDone: (reason: 'finished' | 'skipped') => void;
  /** Viewer hid/reported the ad. */
  onHide: (adId: string) => void;
}

/**
 * A mid-roll ad that takes over the reel the viewer is watching (YouTube-style):
 *  - forced: plays the full 15s, no skip, shows "Reel continues in Ns"
 *  - skippable: "Skip in 5…" then "Skip Ad"; auto-continues at 15s
 * The reel underneath is paused by the parent and resumes when onDone fires.
 */
export const ReelMidRollAd: React.FC<Props> = ({ ad, kind, muted, dwellMs = 2000, onImpression, onDone, onHide }) => {
  const insets = useSafeAreaInsets();
  const { showPopup } = usePopup();
  const [elapsed, setElapsed] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const forced = kind !== 'skippable';
  const doneRef = useRef(false);
  const countedRef = useRef(false);
  const enter = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  const isVideo = ad.format === 'video' && !!ad.media_url && !videoError;
  const imageUri = ad.media_url || ad.cards?.[0]?.image_url;
  const isImage = !isVideo && !!imageUri && ad.format !== 'text';
  const advertiser = ad.profiles?.full_name || (ad.profiles?.username ? `@${ad.profiles.username}` : ad.name);

  const maxSeconds = kind === 'full' && isVideo ? MIDROLL_FULL_CAP_SECONDS : MIDROLL_MAX_SECONDS;

  const finish = useCallback((reason: 'finished' | 'skipped') => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(enter, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onDone(reason));
  }, [onDone]);

  // Entrance + 15s clock
  useEffect(() => {
    fx.press();
    Animated.timing(enter, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.timing(progress, { toValue: 1, duration: maxSeconds * 1000, easing: Easing.linear, useNativeDriver: false }).start();
    const start = Date.now();
    const t = setInterval(() => {
      const sec = (Date.now() - start) / 1000;
      setElapsed(sec);
      if (sec >= maxSeconds) { clearInterval(t); finish('finished'); }
    }, 200);
    return () => clearInterval(t);
  }, []);

  // Count the impression only after the ad has really been on screen
  useEffect(() => {
    const t = setTimeout(() => { countedRef.current = true; onImpression(ad.id); }, dwellMs);
    return () => clearTimeout(t);
  }, [ad.id, dwellMs]);

  const openCta = async () => {
    recordCampusAdClick(ad.id, 'reels').catch(() => {});
    const url = buildWhatsAppCtaUrl(ad) || ad.link;
    if (!url) return;
    try { if (await Linking.canOpenURL(url)) await Linking.openURL(url); } catch {}
  };

  const openMenu = () => {
    showPopup({
      title: 'Sponsored',
      message: advertiser ? `Ad from ${advertiser}` : undefined,
      icon: 'megaphone-outline',
      buttons: [
        { text: 'Hide this ad', onPress: () => { hideAd(ad.id, 'hide'); onHide(ad.id); finish('skipped'); } },
        { text: 'Report ad', style: 'destructive', onPress: () => { hideAd(ad.id, 'report'); onHide(ad.id); finish('skipped'); } },
        {
          text: 'Why am I seeing this?',
          onPress: () => setTimeout(() => showPopup({
            title: 'Why you’re seeing this ad', message: AD_WHY_TEXT, icon: 'information-circle-outline',
            buttons: [{ text: 'Got it', onPress: () => {} }],
          }), 250),
        },
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
      ],
    });
  };

  const remaining = Math.max(0, Math.ceil(maxSeconds - elapsed));
  const skipIn = Math.max(0, Math.ceil(MIDROLL_SKIP_AFTER - elapsed));
  const canSkip = !forced && skipIn === 0;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }] }]}>
      {/* Creative */}
      {isVideo ? (
        <AdVideo url={ad.media_url} muted={muted} onEnded={() => finish('finished')} onError={() => setVideoError(true)} />
      ) : isImage ? (
        <CachedImage uri={imageUri} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#1e1b4b', '#4c1d95', '#701a75']} style={[StyleSheet.absoluteFill, styles.textBg]}>
          {ad.headline ? <Text style={styles.textHeadline}>{ad.headline}</Text> : null}
          {ad.body ? <Text style={styles.textBody}>{ad.body}</Text> : null}
        </LinearGradient>
      )}

      <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent']} style={styles.topGrad} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={styles.bottomGrad} pointerEvents="none" />

      {/* Top-left: Ad badge + status */}
      <View style={[styles.topLeft, { top: insets.top + 12 }]}>
        <View style={styles.adBadge}><Text style={styles.adBadgeText}>AD</Text></View>
        {kind === 'timed' ? (
          <View style={styles.pill}><Text style={styles.pillText}>Reel continues in {remaining}s</Text></View>
        ) : kind === 'full' ? (
          <View style={styles.pill}><Text style={styles.pillText}>Reel continues after ad</Text></View>
        ) : canSkip ? (
          <Tap feedback="press" onPress={() => finish('skipped')} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="Skip ad">
            <Text style={styles.skipText}>Skip Ad</Text>
            <Ionicons name="play-skip-forward" size={13} color="#fff" />
          </Tap>
        ) : (
          <View style={styles.pill}><Text style={styles.pillText}>Skip in {skipIn}s</Text></View>
        )}
      </View>

      <Pressable onPress={openMenu} style={[styles.menuBtn, { top: insets.top + 10 }]} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ad options">
        <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
      </Pressable>

      {/* Bottom: advertiser + CTA */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 22 }]}>
        <View style={styles.advRow}>
          {ad.profiles?.avatar_url ? (
            <CachedImage uri={ad.profiles.avatar_url} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="megaphone" size={17} color="#fff" /></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.advName} numberOfLines={1}>{advertiser}</Text>
            <Text style={styles.sponsored}>{kind === 'full' ? 'Sponsored · your reel will continue after this ad' : 'Sponsored'}</Text>
          </View>
        </View>
        {ad.headline && ad.format !== 'text' ? <Text style={styles.headline} numberOfLines={2}>{ad.headline}</Text> : null}
        <Tap feedback="press" onPress={openCta} style={styles.cta} accessibilityRole="button" accessibilityLabel={ad.cta || 'Learn more'}>
          <Text style={styles.ctaText}>{ad.cta || 'Learn more'}</Text>
          <Ionicons name="chevron-forward" size={16} color="#111" />
        </Tap>
      </View>

      <View style={styles.progressTrack} pointerEvents="none">
        <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: { backgroundColor: '#000', zIndex: 60 },
  textBg: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  textHeadline: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 34, letterSpacing: -0.5 },
  textBody: { color: 'rgba(255,255,255,0.8)', fontSize: 16, textAlign: 'center', lineHeight: 23, marginTop: 10 },
  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 130 },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 320 },
  topLeft: { position: 'absolute', left: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  adBadge: { backgroundColor: '#facc15', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  adBadgeText: { color: '#111', fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  pill: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  pillText: { color: '#fff', fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  skipBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  skipText: { color: '#111', fontSize: 13, fontWeight: '800' },
  menuBtn: { position: 'absolute', right: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, gap: 10 },
  advRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' },
  avatarFallback: { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  advName: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  sponsored: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 1 },
  headline: { color: '#fff', fontSize: 15, fontWeight: '600', lineHeight: 20 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 13, alignSelf: 'stretch', marginTop: 2 },
  ctaText: { color: '#111', fontSize: 15, fontWeight: '700' },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  progressFill: { height: '100%', backgroundColor: '#facc15' },
});
