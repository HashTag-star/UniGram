import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Linking, Alert, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { CachedImage } from './CachedImage';
import { recordCampusAdClick } from '../services/campusAds';

const SKIP_DELAY = 5; // seconds before Skip Ad appears

// ── Video background sub-component (hooks must not be conditional) ────────────
const ReelAdVideo: React.FC<{ url: string; isActive: boolean }> = React.memo(({ url, isActive }) => {
  const player = useVideoPlayer(url, p => {
    p.loop = true;
    p.muted = false;
    p.audioMixingMode = 'duckOthers';
  });

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive]);

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
  const [countdown, setCountdown] = useState(SKIP_DELAY);
  const [canSkip, setCanSkip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isVideo = ad.format === 'video' && !!ad.media_url;

  useEffect(() => {
    if (isActive) {
      onImpression(ad.id);
      setCountdown(SKIP_DELAY);
      setCanSkip(false);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setCanSkip(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCountdown(SKIP_DELAY);
      setCanSkip(false);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive, ad.id]);

  const handleCTA = async () => {
    recordCampusAdClick(ad.id).catch(() => {});
    if (!ad.link) return;
    try {
      const ok = await Linking.canOpenURL(ad.link);
      if (ok) await Linking.openURL(ad.link);
      else Alert.alert('Cannot open link', ad.link);
    } catch {}
  };

  const advertiserName = ad.profiles?.full_name || (ad.profiles?.username ? `@${ad.profiles.username}` : ad.name);

  return (
    <View style={[styles.container, { height: itemHeight }]}>

      {/* Background creative */}
      {isVideo ? (
        <ReelAdVideo url={ad.media_url} isActive={isActive} />
      ) : ad.media_url ? (
        <CachedImage uri={ad.media_url} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.solidBg]}>
          {ad.headline ? <Text style={styles.textAdHeadline}>{ad.headline}</Text> : null}
          {ad.body ? <Text style={styles.textAdBody}>{ad.body}</Text> : null}
        </View>
      )}

      {/* Gradient overlays */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'transparent']}
        style={styles.topGrad}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={styles.bottomGrad}
        pointerEvents="none"
      />

      {/* Top-left: Ad badge */}
      <View style={styles.adBadge}>
        <Text style={styles.adBadgeText}>Ad</Text>
      </View>

      {/* Top-right: countdown → skip */}
      <View style={styles.skipWrap}>
        {canSkip ? (
          <TouchableOpacity style={styles.skipBtn} onPress={onSkip} activeOpacity={0.85}>
            <Text style={styles.skipBtnText}>Skip Ad</Text>
            <Ionicons name="arrow-forward" size={13} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>{countdown}s</Text>
          </View>
        )}
      </View>

      {/* Bottom info */}
      <View style={styles.bottomBar}>
        <View style={styles.advertiserRow}>
          <View style={styles.megaphoneCircle}>
            <Ionicons name="megaphone" size={16} color="#fff" />
          </View>
          <View>
            <Text style={styles.advertiserName} numberOfLines={1}>{advertiserName}</Text>
            <Text style={styles.sponsoredLabel}>Sponsored</Text>
          </View>
        </View>

        {/* CTA button */}
        <TouchableOpacity style={styles.ctaBtn} onPress={handleCTA} activeOpacity={0.85}>
          <Text style={styles.ctaBtnText}>{ad.cta || 'Learn More'}</Text>
          <Ionicons name="arrow-forward" size={13} color="#6366f1" />
        </TouchableOpacity>
      </View>

    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  solidBg: {
    backgroundColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  textAdHeadline: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  textAdBody: { color: 'rgba(255,255,255,0.75)', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 200 },

  adBadge: {
    position: 'absolute', top: 52, left: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3,
  },
  adBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  skipWrap: { position: 'absolute', top: 48, right: 14 },
  countdownBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  countdownText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  skipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
  },
  skipBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingBottom: 30, paddingTop: 12,
    gap: 14,
  },
  advertiserRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  megaphoneCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center',
  },
  advertiserName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sponsoredLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#fff',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20,
    alignSelf: 'stretch',
  },
  ctaBtnText: { color: '#111', fontSize: 14, fontWeight: '700' },
});
