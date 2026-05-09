import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Linking, Dimensions, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from './CachedImage';
import { useTheme } from '../context/ThemeContext';
import { recordCampusAdClick } from '../services/campusAds';

const { width } = Dimensions.get('window');

interface SponsoredAdCardProps {
  ad: any;
  onImpression?: (adId: string) => void;
}

// Stable callback pattern — prevents impression re-firing when parent re-renders
function useStableCallback<T extends (...args: any[]) => any>(fn: T | undefined): T {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  return useRef((...args: any[]) => ref.current?.(...args)).current as T;
}

export const SponsoredAdCard: React.FC<SponsoredAdCardProps> = React.memo(({ ad, onImpression }) => {
  const { colors } = useTheme();
  const stableOnImpression = useStableCallback(onImpression);
  const [carouselIdx, setCarouselIdx] = useState(0);

  // Fire impression once per unique ad rendered in this cell
  useEffect(() => {
    stableOnImpression(ad.id);
  }, [ad.id]);

  const handleCTA = async () => {
    try {
      recordCampusAdClick(ad.id).catch(() => {});
      if (ad.link) {
        const supported = await Linking.canOpenURL(ad.link);
        if (supported) {
          await Linking.openURL(ad.link);
        } else {
          Alert.alert('Cannot open link', ad.link);
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

      {/* Video Ad — thumbnail with play overlay; tap opens link */}
      {ad.format === 'video' && (
        <TouchableOpacity onPress={handleCTA} activeOpacity={0.95}>
          {ad.media_url ? (
            <CachedImage uri={ad.media_url} style={styles.creativeImage} resizeMode="cover" />
          ) : (
            <View style={[styles.creativeImage, styles.videoPlaceholder, { backgroundColor: colors.bg2 }]} />
          )}
          <View style={styles.playOverlay}>
            <View style={styles.playBtn}>
              <Ionicons name="play" size={32} color="#fff" />
            </View>
          </View>
        </TouchableOpacity>
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
