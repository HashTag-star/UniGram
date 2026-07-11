import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Linking, Dimensions, Alert, DeviceEventEmitter, Share
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { CachedImage } from './CachedImage';
import { useTheme } from '../context/ThemeContext';
import { recordCampusAdClick, buildWhatsAppCtaUrl, likeAd, unlikeAd } from '../services/campusAds';
import { CommentSheet } from './CommentSheet';
import { VerifiedBadge } from './VerifiedBadge';

const { width } = Dimensions.get('window');

interface SponsoredAdCardProps {
  ad: any;
  isActive?: boolean;
  onImpression?: (adId: string) => void;
  isLiked?: boolean;
  currentUserId: string;
}

// ── Video Sub-component ──────────────────────────────────────────────────────
const SponsoredAdVideo: React.FC<{
  url: string;
  isActive: boolean;
  isMuted?: boolean;
}> = React.memo(({ url, isActive, isMuted = true }) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = isMuted;
    p.audioMixingMode = isMuted ? 'mixWithOthers' : 'duckOthers';
  });

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  useEffect(() => {
    player.muted = isMuted;
    player.audioMixingMode = isMuted ? 'mixWithOthers' : 'duckOthers';
  }, [isMuted, player]);

  return (
    <VideoView
      player={player}
      style={styles.creativeImage}
      contentFit="cover"
      nativeControls={false}
    />
  );
});

// Stable callback pattern — prevents impression re-firing when parent re-renders
function useStableCallback<T extends (...args: any[]) => any>(fn: T | undefined): T {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  return useRef((...args: any[]) => ref.current?.(...args)).current as T;
}

export const SponsoredAdCard: React.FC<SponsoredAdCardProps> = React.memo(({ ad, isActive = false, onImpression }) => {
  const { colors } = useTheme();
  const stableOnImpression = useStableCallback(onImpression);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  // Self-managed active state for the video player — can be driven by 'feedActivePost'
  // events if not explicitly passed by parent (similar to FeedPost).
  const [isActiveInternal, setIsActiveInternal] = useState(false);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('feedActivePost', (id: string | null) => {
      // Ads have complex IDs like `__ad_ID_posN__`, so we check if it starts with the expected prefix
      const isMyAd = id?.includes(`ad_${ad.id}`);
      setIsActiveInternal(!!isMyAd);
    });
    return () => sub.remove();
  }, [ad.id]);

  const finalActive = isActive || isActiveInternal;

  const handleCTA = async () => {
    try {
      recordCampusAdClick(ad.id).catch(() => {});
      // Click-to-WhatsApp ads (migration 040): when an ad has a
      // `whatsapp_number`, the CTA opens a wa.me chat with a prefilled
      // intro message instead of an arbitrary web link.
      const waUrl = buildWhatsAppCtaUrl(ad);
      const targetUrl = waUrl || ad.link;
      if (targetUrl) {
        const supported = await Linking.canOpenURL(targetUrl);
        if (supported) {
          await Linking.openURL(targetUrl);
        } else {
          Alert.alert('Cannot open link', targetUrl);
        }
      }
    } catch {}
  };

  const advertiserName =
    ad.profiles?.full_name || (ad.profiles?.username ? `@${ad.profiles.username}` : ad.name);
  const avatarUri = ad.profiles?.avatar_url;
  const cards: any[] = ad.cards ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>

      {/* Preview banner — only visible to the ad creator while status is pending */}
      {ad._isPreview && (
        <View style={styles.previewBanner}>
          <Ionicons name="eye-outline" size={13} color="#fff" />
          <Text style={styles.previewText}>Ad preview — not yet live</Text>
        </View>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <CachedImage uri={avatarUri} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: '#6366f1' }]}>
              <Ionicons name="megaphone" size={18} color="#fff" />
            </View>
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.advertiserName, { color: colors.text }]} numberOfLines={1}>
            {advertiserName}
          </Text>
          <View style={styles.sponsoredRow}>
            <Text style={[styles.sponsoredLabel, { color: colors.textMuted }]}>Sponsored</Text>
            {ad.university && (
              <>
                <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
                <Text style={[styles.sponsoredLabel, { color: colors.textMuted }]}>{ad.university}</Text>
              </>
            )}
          </View>
        </View>
        <View style={[styles.adBadge, { borderColor: colors.border }]}>
          <Text style={[styles.adBadgeText, { color: colors.textMuted }]}>Ad</Text>
        </View>
      </View>

      {/* ── Creative ────────────────────────────────────────────────────── */}

      {/* Image Ad */}
      {ad.format === 'image' && ad.media_url && (
        <CachedImage uri={ad.media_url} style={styles.creativeImage} resizeMode="cover" />
      )}

      {/* Video Ad — auto-plays when in view; tap creative toggles mute */}
      {ad.format === 'video' && (
        <View style={{ position: 'relative' }}>
          <TouchableOpacity 
            onPress={() => setIsMuted(!isMuted)} 
            activeOpacity={0.95}
          >
            {ad.media_url ? (
              <SponsoredAdVideo 
                url={ad.media_url} 
                isActive={finalActive} 
                isMuted={isMuted} 
              />
            ) : (
              <View style={[styles.creativeImage, styles.videoPlaceholder, { backgroundColor: colors.bg2 }]} />
            )}
            
            {/* Play/Mute Overlay */}
            <View style={styles.playOverlay} pointerEvents="none">
              {!finalActive && ad.media_url && (
                <View style={styles.playBtn}>
                  <Ionicons name="play" size={32} color="#fff" />
                </View>
              )}
            </View>

            {/* Mute toggle indicator */}
            {finalActive && ad.media_url && (
              <TouchableOpacity 
                style={styles.muteBtn} 
                onPress={() => setIsMuted(!isMuted)}
              >
                <Ionicons 
                  name={isMuted ? "volume-mute" : "volume-high"} 
                  size={16} 
                  color="#fff" 
                />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* CTA overlay button (optional, usually ads have a separate bar but some have it on video) */}
          <TouchableOpacity 
            style={[styles.videoCta, { bottom: 12, right: 12 }]} 
            onPress={handleCTA}
          >
            <Text style={styles.videoCtaText}>{ad.cta || 'Learn More'}</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Premium CTA Bar ─────────────────────────────────────────────── */}
      {ad.format !== 'carousel' && ad.format !== 'text' && (
        <TouchableOpacity
          style={[styles.premiumCta, { backgroundColor: colors.bg === '#000000' || colors.bg === '#121212' ? '#1c1c1e' : '#f4f5f7' }]}
          onPress={handleCTA}
          activeOpacity={0.8}
        >
          <Text style={[styles.premiumCtaText, { color: colors.text }]}>{ad.cta || 'Learn more'}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      )}

      {/* Carousel / Products */}
      {ad.format === 'carousel' && cards.length > 0 && (
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / (width - 32));
              setCarouselIdx(idx);
            }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
          >
            {cards.map((card: any, i: number) => (
              <TouchableOpacity
                key={i}
                style={[styles.carouselCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  recordCampusAdClick(ad.id).catch(() => {});
                  if (card.link) Linking.openURL(card.link).catch(() => {});
                  else handleCTA();
                }}
                activeOpacity={0.88}
              >
                {card.image_url ? (
                  <CachedImage uri={card.image_url} style={styles.carouselImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.carouselImage, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.carouselInfo}>
                  {card.title ? (
                    <Text style={[styles.carouselTitle, { color: colors.text }]} numberOfLines={2}>{card.title}</Text>
                  ) : null}
                  {card.price ? (
                    <Text style={[styles.carouselPrice, { color: '#6366f1' }]}>GHS {card.price}</Text>
                  ) : null}
                  <View style={[styles.carouselCTAWrap, { borderColor: colors.border }]}>
                    <Text style={[styles.carouselCTAText, { color: colors.text }]}>{ad.cta}</Text>
                    <Ionicons name="arrow-forward" size={13} color={colors.text} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Pagination dots */}
          {cards.length > 1 && (
            <View style={styles.dots}>
              {cards.map((_: any, i: number) => (
                <View
                  key={i}
                  style={[
                    styles.dotItem,
                    { backgroundColor: i === carouselIdx ? '#6366f1' : colors.border },
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Text Ad */}
      {ad.format === 'text' && (
        <View style={[styles.textCreative, { backgroundColor: '#6366f1' + '12', borderColor: '#6366f1' + '30' }]}>
          <Ionicons name="megaphone-outline" size={22} color="#6366f1" style={{ marginBottom: 6 }} />
          {ad.headline ? (
            <Text style={[styles.textCreativeHeadline, { color: colors.text }]}>{ad.headline}</Text>
          ) : null}
          {ad.body ? (
            <Text style={[styles.textCreativeBody, { color: colors.textSub }]}>{ad.body}</Text>
          ) : null}
        </View>
      )}

      {/* ── Caption row ─────────────────────────────────────────────────── */}
      <View style={styles.caption}>
        {ad.format !== 'text' && (
          <>
            {ad.headline ? (
              <Text style={[styles.headline, { color: colors.text }]}>{ad.headline}</Text>
            ) : null}
            {ad.body ? (
              <Text style={[styles.body, { color: colors.textSub }]} numberOfLines={2}>{ad.body}</Text>
            ) : null}
          </>
        )}
      </View>

    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  previewText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  advertiserName: { fontSize: 14, fontWeight: '700' },
  sponsoredRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  sponsoredLabel: { fontSize: 11 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  adBadge: {
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  adBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // Creative
  creativeImage: { width: width, height: width * 1.25 }, // 4:5 aspect ratio for immersive feel
  videoPlaceholder: { width: width, height: width * 1.25 },
  playOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  playBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  muteBtn: {
    position: 'absolute', bottom: 12, left: 12,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  videoCta: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  videoCtaText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  
  // Premium CTA Bar
  premiumCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  premiumCtaText: { fontSize: 14, fontWeight: '600' },

  // Carousel
  carouselCard: {
    width: width * 0.75,
    borderRadius: 14, borderWidth: 1,
    overflow: 'hidden',
  },
  carouselImage: { width: '100%', aspectRatio: 1 },
  carouselInfo: { padding: 12, gap: 6 },
  carouselTitle: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  carouselPrice: { fontSize: 14, fontWeight: '800' },
  carouselCTAWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 8,
  },
  carouselCTAText: { fontSize: 12, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  dotItem: { width: 6, height: 6, borderRadius: 3 },

  // Text creative
  textCreative: {
    marginHorizontal: 14,
    borderRadius: 14, borderWidth: 1,
    padding: 16, marginBottom: 4,
    alignItems: 'center',
  },
  textCreativeHeadline: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  textCreativeBody: { fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 18 },

  // Caption / CTA
  caption: { paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  headline: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 18 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 6,
  },
  ctaBtnText: { fontSize: 14, fontWeight: '600' },
});
