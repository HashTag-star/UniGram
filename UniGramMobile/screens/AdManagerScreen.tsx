import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, KeyboardAvoidingView, Platform, Image,
  Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { usePopup } from '../context/PopupContext';
import { useToast } from '../context/ToastContext';
import {
  getCampaigns, createCampaignDraft, setPaymentRef,
  uploadAdMedia, initAdPayment, openAdCheckout,
  pauseCampaign, resumeCampaign, deleteCampaign,
  type CampusAd,
} from '../services/campusAds';

// ─── Types ────────────────────────────────────────────────────────────────────

type AdStatus    = 'active' | 'paused' | 'ended' | 'pending';
type Placement   = 'feed' | 'stories' | 'reels' | 'explore' | 'market';
type Objective   = 'awareness' | 'traffic' | 'engagement' | 'sales';
type AdFormat    = 'image' | 'video' | 'carousel' | 'text';

interface CarouselCard {
  id: string;
  imageUri?: string;
  title: string;
  price: string;
  link: string;
}

interface Campaign {
  id: string;
  name: string;
  objective: Objective;
  format: AdFormat;
  placements: Placement[];
  headline: string;
  body: string | null;
  cta: string;
  link: string | null;
  media_url?: string | null;
  cards?: CarouselCard[] | null;
  status: AdStatus;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  start_date: string | null;
  end_date: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OBJECTIVES: { key: Objective; label: string; icon: string; desc: string; color: string }[] = [
  { key: 'awareness',  label: 'Brand Awareness',  icon: 'megaphone-outline',    desc: 'Reach as many students as possible',     color: '#6366f1' },
  { key: 'traffic',    label: 'Website Traffic',   icon: 'globe-outline',        desc: 'Drive clicks to your link or app',        color: '#06b6d4' },
  { key: 'engagement', label: 'Engagement',        icon: 'heart-outline',        desc: 'Get likes, comments & shares',            color: '#ec4899' },
  { key: 'sales',      label: 'Product Sales',     icon: 'bag-handle-outline',   desc: 'Promote products and drive purchases',    color: '#f59e0b' },
];

const FORMATS: { key: AdFormat; label: string; icon: string; desc: string }[] = [
  { key: 'image',    label: 'Image Ad',           icon: 'image-outline',     desc: 'Single photo with caption & CTA' },
  { key: 'video',    label: 'Video Ad',            icon: 'videocam-outline',  desc: 'Short video up to 60 seconds'   },
  { key: 'carousel', label: 'Carousel / Products', icon: 'albums-outline',    desc: 'Multiple images or product cards'},
  { key: 'text',     label: 'Text Ad',             icon: 'text-outline',      desc: 'Text-only with call to action'  },
];

const ALL_PLACEMENTS: { key: Placement; label: string; icon: string }[] = [
  { key: 'feed',    label: 'Feed',    icon: 'home-outline'       },
  { key: 'stories', label: 'Stories', icon: 'ellipse-outline'    },
  { key: 'reels',   label: 'Reels',   icon: 'play-circle-outline'},
  { key: 'explore', label: 'Explore', icon: 'compass-outline'    },
  { key: 'market',  label: 'Market',  icon: 'storefront-outline' },
];

const CTA_OPTIONS = ['Learn More', 'Shop Now', 'Order Now', 'Sign Up', 'Download', 'Contact Us', 'Get Offer', 'Watch More'];

const BUDGET_TIERS: { amount: number; reach: [number, number]; label: string; tag: string; popular?: boolean }[] = [
  { amount: 30,  reach: [500,  1200],  label: 'Starter',   tag: 'Test the waters'  },
  { amount: 60,  reach: [1200, 2800],  label: 'Standard',  tag: 'Most popular', popular: true },
  { amount: 120, reach: [2800, 6000],  label: 'Boosted',   tag: 'High impact'      },
  { amount: 250, reach: [6000, 15000], label: 'Max Reach', tag: 'Campus-wide'       },
];

const DURATION_TIERS: { days: number; label: string }[] = [
  { days: 3,  label: '3 days'  },
  { days: 7,  label: '1 week'  },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
];

const STATUS_CONFIG: Record<AdStatus, { color: string; label: string }> = {
  active:  { color: '#22c55e', label: 'Active'     },
  paused:  { color: '#f59e0b', label: 'Paused'     },
  ended:   { color: '#6b7280', label: 'Ended'      },
  pending: { color: '#6366f1', label: 'In Review'  },
};

const FORMAT_ICONS: Record<AdFormat, string> = {
  image:    'image-outline',
  video:    'videocam-outline',
  carousel: 'albums-outline',
  text:     'text-outline',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function uid(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

function fmtReach([lo, hi]: [number, number]): string {
  const f = (n: number) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K' : String(n);
  return `~${f(lo)}–${f(hi)}`;
}

function dailySpend(budget: number, days: number): string {
  const d = budget / days;
  return d % 1 === 0 ? `GHS ${d}` : `GHS ${d.toFixed(2)}`;
}

function dailyReach([lo, hi]: [number, number], days: number): string {
  const f = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
  return `${f(Math.round(lo / days))}–${f(Math.round(hi / days))}`;
}

// ─── Step Progress Bar ────────────────────────────────────────────────────────

const StepBar: React.FC<{ step: number; total: number }> = ({ step, total }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.stepBarWrap}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stepSegment,
            { backgroundColor: i <= step ? '#6366f1' : colors.bg2, marginRight: i < total - 1 ? 4 : 0 },
          ]}
        />
      ))}
    </View>
  );
};

// ─── Campaign Card ────────────────────────────────────────────────────────────

const CampaignCard: React.FC<{
  campaign: Campaign;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ campaign: c, onPause, onResume, onDelete }) => {
  const { colors } = useTheme();
  const ctr      = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(1) : '0.0';
  const progress = Math.min(c.spent / c.budget, 1);
  const { color, label } = STATUS_CONFIG[c.status];
  const obj = OBJECTIVES.find(o => o.key === c.objective);

  const showActions = () => {
    const actions: Array<{ text: string; style?: 'destructive' | 'cancel'; onPress: () => void }> = [];
    if (c.status === 'active') {
      actions.push({ text: 'Pause Campaign', onPress: () => onPause(c.id) });
    }
    if (c.status === 'paused') {
      actions.push({ text: 'Resume Campaign', onPress: () => onResume(c.id) });
    }
    if (c.status === 'pending' && c.payment_ref) {
      // Payment was completed but activation didn't fire (e.g. old campaigns before this fix)
      actions.push({ text: 'Activate Now', onPress: () => onResume(c.id) });
    }
    if (c.status === 'pending' || c.status === 'ended') {
      actions.push({ text: 'Delete Campaign', style: 'destructive', onPress: () => onDelete(c.id) });
    }
    actions.push({ text: 'Cancel', style: 'cancel', onPress: () => {} });
    Alert.alert(c.name, 'Choose an action for this campaign', actions);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardMeta}>
          <Ionicons name={FORMAT_ICONS[c.format] as any} size={12} color={colors.textMuted} />
          <Text style={[styles.cardMetaText, { color: colors.textMuted }]}>
            {FORMATS.find(f => f.key === c.format)?.label}
          </Text>
          <Text style={[styles.cardMetaText, { color: colors.textMuted }]}>·</Text>
          <View style={[styles.objDot, { backgroundColor: (obj?.color ?? '#6366f1') + '30' }]}>
            <Text style={[styles.cardMetaText, { color: obj?.color ?? '#6366f1' }]}>{obj?.label}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: color }]} />
            <Text style={[styles.statusText, { color }]}>{label}</Text>
          </View>
          {(c.status === 'active' || c.status === 'paused' || c.status === 'pending' || c.status === 'ended') && (
            <TouchableOpacity onPress={showActions} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={[styles.cardName, { color: colors.text }]}>{c.name}</Text>
      <Text style={[styles.cardHeadline, { color: colors.textSub }]} numberOfLines={1}>{c.headline}</Text>

      <View style={{ flexDirection: 'row', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
        {c.placements.map(p => (
          <View key={p} style={[styles.placementPill, { backgroundColor: colors.bg2 }]}>
            <Ionicons name={ALL_PLACEMENTS.find(pl => pl.key === p)?.icon as any} size={10} color={colors.textMuted} />
            <Text style={[styles.placementPillText, { color: colors.textMuted }]}>
              {ALL_PLACEMENTS.find(pl => pl.key === p)?.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.bg2 }]}>
        <View style={[
          styles.progressFill,
          { width: `${progress * 100}%` as any, backgroundColor: c.status === 'active' ? '#6366f1' : '#6b7280' },
        ]} />
      </View>
      <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
        GHS {c.spent} spent of GHS {c.budget}
      </Text>

      <View style={styles.cardStats}>
        {[
          { val: fmtNum(c.impressions), lbl: 'Impressions' },
          { val: fmtNum(c.clicks),      lbl: 'Clicks'      },
          { val: `${ctr}%`,             lbl: 'CTR'         },
          { val: `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`, lbl: 'Period' },
        ].map((s, i) => (
          <React.Fragment key={s.lbl}>
            {i > 0 && <View style={styles.statDivider} />}
            <View style={styles.cardStat}>
              <Text style={[styles.cardStatVal, { color: colors.text }]} numberOfLines={1}>{s.val}</Text>
              <Text style={[styles.cardStatLbl, { color: colors.textMuted }]}>{s.lbl}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
};

// ─── Media Picker Button ──────────────────────────────────────────────────────

const MediaPickerBtn: React.FC<{
  uri?: string;
  type: 'image' | 'video';
  onPick: (uri: string) => void;
}> = ({ uri, type, onPick }) => {
  const { colors } = useTheme();

  const pick = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access to upload media.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'video' ? 'videos' : 'images',
      quality: 0.85,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) onPick(result.assets[0].uri);
  }, [type, onPick]);

  return (
    <TouchableOpacity
      style={[
        styles.mediaPicker,
        { backgroundColor: colors.card, borderColor: uri ? '#6366f1' : colors.border },
        uri && { borderStyle: 'solid' },
      ]}
      onPress={pick}
      activeOpacity={0.8}
    >
      {uri ? (
        <>
          <Image source={{ uri }} style={styles.mediaPreview} resizeMode="cover" />
          <View style={styles.mediaOverlay}>
            <Ionicons name="pencil" size={16} color="#fff" />
            <Text style={styles.mediaOverlayText}>Change</Text>
          </View>
        </>
      ) : (
        <>
          <Ionicons name={type === 'video' ? 'videocam-outline' : 'image-outline'} size={32} color={colors.textMuted} />
          <Text style={[styles.mediaPickerLabel, { color: colors.textMuted }]}>
            Tap to add {type === 'video' ? 'video' : 'photo'}
          </Text>
          <Text style={[styles.mediaPickerSub, { color: colors.textMuted }]}>
            {type === 'video' ? 'MP4 · up to 60 seconds' : 'JPG or PNG · Flexible ratio'}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

// ─── Create Campaign Sheet (Multi-step) ───────────────────────────────────────

const TOTAL_STEPS = 3;

const CreateCampaignSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  profile?: any;
  onCreated?: () => void;
}> = ({ visible, onClose, profile, onCreated }) => {
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  // Navigation
  const [step, setStep]       = useState(0);

  // Step 1 — Objective & Format
  const [objective, setObjective] = useState<Objective | null>(null);
  const [format, setFormat]       = useState<AdFormat | null>(null);

  // Step 2 — Creative
  const [name, setName]           = useState('');
  const [mediaUri, setMediaUri]   = useState('');
  const [headline, setHeadline]   = useState('');
  const [body, setBody]           = useState('');
  const [cta, setCta]             = useState('Learn More');
  const [link, setLink]           = useState('');
  const [cards, setCards]         = useState<CarouselCard[]>([
    { id: uid(), imageUri: undefined, title: '', price: '', link: '' },
  ]);

  // Step 3 — Audience & Budget
  const [placements, setPlacements] = useState<Placement[]>(['feed']);
  const [budget, setBudget]         = useState<number | null>(null);
  const [duration, setDuration]     = useState<number | null>(null);

  const canGoNext = useMemo(() => {
    if (step === 0) return objective !== null && format !== null;
    if (step === 1) {
      if (!name.trim() || !headline.trim()) return false;
      if (format === 'carousel') return cards.every(c => c.title.trim());
      if (format === 'image' || format === 'video') return !!mediaUri;
      return true;
    }
    return placements.length > 0 && budget !== null && duration !== null;
  }, [step, objective, format, name, headline, mediaUri, cards, placements, budget, duration]);

  const reset = () => {
    setStep(0); setObjective(null); setFormat(null);
    setName(''); setMediaUri(''); setHeadline(''); setBody(''); setCta('Learn More'); setLink('');
    setCards([{ id: uid(), imageUri: undefined, title: '', price: '', link: '' }]);
    setPlacements(['feed']); setBudget(null); setDuration(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handlePay = async () => {
    if (!canGoNext || !budget || !duration || !format || !objective) return;
    setSubmitting(true);
    try {
      // Upload main media (image/video)
      let mediaUrl: string | null = null;
      if ((format === 'image' || format === 'video') && mediaUri) {
        mediaUrl = await uploadAdMedia(mediaUri);
      }

      // Upload per-card images for carousel
      let resolvedCards = cards;
      if (format === 'carousel') {
        resolvedCards = await Promise.all(cards.map(async card => {
          if (card.imageUri && (card.imageUri.startsWith('file://') || card.imageUri.startsWith('content://') || card.imageUri.startsWith('ph://'))) {
            const url = await uploadAdMedia(card.imageUri);
            return { ...card, imageUri: url };
          }
          return card;
        }));
      }

      // Create the campaign draft in Supabase
      const draft = await createCampaignDraft({
        name,
        objective,
        format,
        placements,
        headline,
        body,
        cta,
        link: link || null,
        media_url: mediaUrl,
        cards: format === 'carousel'
          ? resolvedCards.map(c => ({ title: c.title, price: c.price, link: c.link, image_url: c.imageUri }))
          : null,
        status: 'pending',
        budget,
        university: profile?.university ?? null,
        start_date: null,
        end_date: null,
      });

      // Initialise Paystack transaction
      const { authorization_url, reference } = await initAdPayment(draft.id, budget, duration);
      await setPaymentRef(draft.id, reference);

      // Open in-app browser checkout
      const success = await openAdCheckout(authorization_url, reference);

      if (success) {
        // Payment verified — activate the campaign immediately
        const now = new Date().toISOString().split('T')[0];
        const endDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        await supabase
          .from('campus_ads')
          .update({ status: 'active', start_date: now, end_date: endDate })
          .eq('id', draft.id);
        showToast('Your campaign is live!', 'success');
      } else {
        showToast('Campaign saved. Complete payment to go live.', 'info');
      }
      handleClose();
      onCreated?.();
    } catch (err: any) {
      Alert.alert('Something went wrong', err?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePlacement = (p: Placement) => {
    setPlacements(prev =>
      prev.includes(p) ? (prev.length > 1 ? prev.filter(x => x !== p) : prev) : [...prev, p]
    );
  };

  const addCard    = () => setCards(c => [...c, { id: uid(), imageUri: undefined, title: '', price: '', link: '' }]);
  const removeCard = (id: string) => setCards(c => c.filter(x => x.id !== id));
  const updateCard = (id: string, field: keyof CarouselCard, val: string) =>
    setCards(c => c.map(x => x.id === id ? { ...x, [field]: val } : x));

  const stepTitle = ['Objective & Format', 'Ad Creative', 'Audience & Budget'][step];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.sheetContainer, { backgroundColor: colors.bg }]}>

          {/* Header */}
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={step === 0 ? handleClose : () => setStep(s => s - 1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={step === 0 ? 'close' : 'arrow-back'} size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{stepTitle}</Text>
              <Text style={[styles.sheetStep, { color: colors.textMuted }]}>Step {step + 1} of {TOTAL_STEPS}</Text>
            </View>
            <View style={{ width: 24 }} />
          </View>

          <StepBar step={step} total={TOTAL_STEPS} />

          {/* ── STEP 0: Objective & Format ─────────────────────────────────── */}
          {step === 0 && (
            <ScrollView contentContainerStyle={styles.stepBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>CAMPAIGN OBJECTIVE</Text>
              <View style={styles.objectiveGrid}>
                {OBJECTIVES.map(o => {
                  const active = objective === o.key;
                  return (
                    <TouchableOpacity
                      key={o.key}
                      style={[
                        styles.objectiveCard,
                        { backgroundColor: colors.card, borderColor: active ? o.color : colors.border },
                        active && { backgroundColor: o.color + '12' },
                      ]}
                      onPress={() => setObjective(o.key)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.objIconWrap, { backgroundColor: o.color + '20' }]}>
                        <Ionicons name={o.icon as any} size={22} color={o.color} />
                      </View>
                      <Text style={[styles.objLabel, { color: colors.text }]}>{o.label}</Text>
                      <Text style={[styles.objDesc, { color: colors.textMuted }]}>{o.desc}</Text>
                      {active && <Ionicons name="checkmark-circle" size={18} color={o.color} style={styles.objCheck} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 24 }]}>AD FORMAT</Text>
              {FORMATS.map(f => {
                const active = format === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[
                      styles.formatRow,
                      { backgroundColor: colors.card, borderColor: active ? '#6366f1' : colors.border },
                      active && { backgroundColor: '#6366f110' },
                    ]}
                    onPress={() => setFormat(f.key)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.formatIconWrap, { backgroundColor: active ? '#6366f120' : colors.bg2 }]}>
                      <Ionicons name={f.icon as any} size={20} color={active ? '#6366f1' : colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.formatLabel, { color: colors.text }]}>{f.label}</Text>
                      <Text style={[styles.formatDesc, { color: colors.textMuted }]}>{f.desc}</Text>
                    </View>
                    {active
                      ? <Ionicons name="checkmark-circle" size={20} color="#6366f1" />
                      : <View style={[styles.formatRadio, { borderColor: colors.border }]} />
                    }
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* ── STEP 1: Creative ───────────────────────────────────────────── */}
          {step === 1 && (
            <ScrollView contentContainerStyle={styles.stepBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Campaign name (always) */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>CAMPAIGN NAME</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                placeholder="e.g. Campus Eats – May Sale"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
              />

              {/* Media upload — Image Ad */}
              {format === 'image' && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>PHOTO</Text>
                  <MediaPickerBtn uri={mediaUri} type="image" onPick={setMediaUri} />
                </>
              )}

              {/* Media upload — Video Ad */}
              {format === 'video' && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>VIDEO</Text>
                  <MediaPickerBtn uri={mediaUri} type="video" onPick={setMediaUri} />
                </>
              )}

              {/* Carousel Cards */}
              {format === 'carousel' && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>
                    PRODUCT CARDS <Text style={{ fontWeight: '400' }}>({cards.length}/5)</Text>
                  </Text>
                  {cards.map((card, idx) => (
                    <View key={card.id} style={[styles.carouselCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.carouselCardHeader}>
                        <Text style={[styles.carouselCardNum, { color: colors.textMuted }]}>Card {idx + 1}</Text>
                        {cards.length > 1 && (
                          <TouchableOpacity onPress={() => removeCard(card.id)}>
                            <Ionicons name="trash-outline" size={16} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <TouchableOpacity
                        style={[styles.carouselImageBtn, { backgroundColor: colors.bg2, borderColor: colors.border }]}
                        onPress={async () => {
                          const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
                          if (!p.granted) return;
                          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.85 });
                          if (!r.canceled && r.assets[0]) updateCard(card.id, 'imageUri', r.assets[0].uri);
                        }}
                      >
                        {card.imageUri
                          ? <Image source={{ uri: card.imageUri }} style={styles.carouselImagePreview} />
                          : <Ionicons name="image-outline" size={24} color={colors.textMuted} />
                        }
                      </TouchableOpacity>
                      <TextInput style={[styles.textInput, { backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text, marginTop: 8 }]} placeholder="Product title" placeholderTextColor={colors.textMuted} value={card.title} onChangeText={v => updateCard(card.id, 'title', v)} />
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TextInput style={[styles.textInput, { flex: 1, backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]} placeholder="Price (GHS)" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={card.price} onChangeText={v => updateCard(card.id, 'price', v)} />
                        <TextInput style={[styles.textInput, { flex: 2, backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]} placeholder="Link (optional)" placeholderTextColor={colors.textMuted} keyboardType="url" autoCapitalize="none" value={card.link} onChangeText={v => updateCard(card.id, 'link', v)} />
                      </View>
                    </View>
                  ))}
                  {cards.length < 5 && (
                    <TouchableOpacity style={[styles.addCardBtn, { borderColor: colors.border }]} onPress={addCard}>
                      <Ionicons name="add" size={18} color="#6366f1" />
                      <Text style={styles.addCardText}>Add Card</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* Headline (all formats) */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>
                HEADLINE <Text style={{ fontWeight: '400' }}>({headline.length}/80)</Text>
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                placeholder="Hook students in one line"
                placeholderTextColor={colors.textMuted}
                value={headline}
                onChangeText={t => setHeadline(t.slice(0, 80))}
                maxLength={80}
              />

              {/* Body copy */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>BODY TEXT</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text, height: 90, textAlignVertical: 'top' }]}
                placeholder="More details about your offer…"
                placeholderTextColor={colors.textMuted}
                multiline
                value={body}
                onChangeText={setBody}
              />

              {/* CTA */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>CALL TO ACTION</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                {CTA_OPTIONS.map(c => {
                  const active = cta === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[styles.pill, { borderColor: active ? '#6366f1' : colors.border, backgroundColor: active ? '#6366f1' : colors.card }]}
                      onPress={() => setCta(c)}
                    >
                      <Text style={[styles.pillText, { color: active ? '#fff' : colors.text }]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Link */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>
                DESTINATION LINK <Text style={{ fontWeight: '400' }}>(optional)</Text>
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                placeholder="https://"
                placeholderTextColor={colors.textMuted}
                value={link}
                onChangeText={setLink}
                keyboardType="url"
                autoCapitalize="none"
              />
            </ScrollView>
          )}

          {/* ── STEP 2: Audience & Budget ──────────────────────────────────── */}
          {step === 2 && (
            <ScrollView contentContainerStyle={styles.stepBody} showsVerticalScrollIndicator={false}>
              {/* Placements */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>PLACEMENTS</Text>
              <View style={styles.placementsGrid}>
                {ALL_PLACEMENTS.map(p => {
                  const active = placements.includes(p.key);
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[
                        styles.placementToggle,
                        { backgroundColor: colors.card, borderColor: active ? '#6366f1' : colors.border },
                        active && { backgroundColor: '#6366f110' },
                      ]}
                      onPress={() => togglePlacement(p.key)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={p.icon as any} size={18} color={active ? '#6366f1' : colors.textMuted} />
                      <Text style={[styles.placementToggleLabel, { color: active ? '#6366f1' : colors.text }]}>{p.label}</Text>
                      {active && <Ionicons name="checkmark-circle" size={14} color="#6366f1" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
                Select where your ad appears. All placements target students at your university only.
              </Text>

              {/* Budget */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 24 }]}>BUDGET (GHS)</Text>
              <View style={styles.budgetGrid}>
                {BUDGET_TIERS.map(tier => {
                  const active = budget === tier.amount;
                  return (
                    <TouchableOpacity
                      key={tier.amount}
                      style={[
                        styles.budgetCard,
                        { backgroundColor: colors.card, borderColor: active ? '#6366f1' : colors.border },
                        active && { backgroundColor: '#6366f110', borderWidth: 2 },
                      ]}
                      onPress={() => setBudget(tier.amount)}
                      activeOpacity={0.8}
                    >
                      {tier.popular && (
                        <View style={styles.budgetPopularBadge}>
                          <Text style={styles.budgetPopularText}>Popular</Text>
                        </View>
                      )}
                      <Text style={[styles.budgetLabel, { color: active ? '#6366f1' : colors.textMuted }]}>{tier.label}</Text>
                      <Text style={[styles.budgetAmount, { color: colors.text }]}>GHS {tier.amount}</Text>
                      <Text style={[styles.budgetReach, { color: active ? '#6366f1' : colors.textSub }]}>
                        {fmtReach(tier.reach)} impressions
                      </Text>
                      <Text style={[styles.budgetTag, { color: colors.textMuted }]}>{tier.tag}</Text>
                      {active && (
                        <Ionicons name="checkmark-circle" size={16} color="#6366f1" style={styles.budgetCheck} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Pacing strip — shows when budget is selected */}
              {budget !== null && (
                <View style={[styles.pacingStrip, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
                  <Ionicons name="bar-chart-outline" size={15} color="#6366f1" />
                  <Text style={[styles.pacingText, { color: colors.textSub }]}>
                    {duration
                      ? (() => {
                          const tier = BUDGET_TIERS.find(t => t.amount === budget);
                          return tier
                            ? `${dailySpend(budget, duration)}/day · ~${dailyReach(tier.reach, duration)} impressions/day`
                            : `${dailySpend(budget, duration)}/day`;
                        })()
                      : `Total budget: GHS ${budget} · Select a duration to see daily spend`
                    }
                  </Text>
                </View>
              )}

              {/* Duration */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>DURATION</Text>
              <View style={styles.durationRow}>
                {DURATION_TIERS.map(t => {
                  const active = duration === t.days;
                  const spend = budget !== null ? dailySpend(budget, t.days) : null;
                  return (
                    <TouchableOpacity
                      key={t.days}
                      style={[
                        styles.durationCard,
                        { backgroundColor: colors.card, borderColor: active ? '#6366f1' : colors.border },
                        active && { backgroundColor: '#6366f110', borderWidth: 2 },
                      ]}
                      onPress={() => setDuration(t.days)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.durationLabel, { color: active ? '#6366f1' : colors.text }]}>{t.label}</Text>
                      {spend && (
                        <Text style={[styles.durationSpend, { color: active ? '#6366f1' : colors.textMuted }]}>{spend}/day</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Summary */}
              {canGoNext && (() => {
                const tier = BUDGET_TIERS.find(t => t.amount === budget);
                if (!tier) return null;
                return (
                  <View style={[styles.summaryBox, { backgroundColor: '#6366f110', borderColor: '#6366f130' }]}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#6366f1" style={{ marginTop: 1 }} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.summaryTitle, { color: colors.text }]}>{name}</Text>
                      <Text style={[styles.summaryLine, { color: colors.textSub }]}>
                        {FORMATS.find(f => f.key === format)?.label} · {OBJECTIVES.find(o => o.key === objective)?.label}
                      </Text>
                      <Text style={[styles.summaryLine, { color: colors.textSub }]}>
                        {placements.map(p => ALL_PLACEMENTS.find(pl => pl.key === p)?.label).join(', ')} · {duration} days
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        <View>
                          <Text style={{ color: '#6366f1', fontWeight: '800', fontSize: 17 }}>GHS {budget}</Text>
                          <Text style={[styles.summaryLine, { color: colors.textMuted }]}>
                            {dailySpend(budget!, duration!)} per day
                          </Text>
                        </View>
                        <View style={[styles.reachBadge, { backgroundColor: '#6366f120' }]}>
                          <Ionicons name="eye-outline" size={13} color="#6366f1" />
                          <Text style={styles.reachBadgeText}>{fmtReach(tier.reach)}</Text>
                          <Text style={[styles.reachBadgeText, { fontWeight: '400' }]}> impr.</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })()}

              <TouchableOpacity
                style={[styles.payBtn, (!canGoNext || submitting) && { opacity: 0.38 }]}
                onPress={handlePay}
                disabled={!canGoNext || submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="card-outline" size={18} color="#fff" />
                )}
                <Text style={styles.payBtnText}>
                  {submitting ? 'Processing…' : canGoNext ? `Pay GHS ${budget} via Paystack` : 'Complete all fields'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ── Bottom Nav ─────────────────────────────────────────────────── */}
          {step < 2 && (
            <View style={[styles.sheetFooter, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
              <TouchableOpacity
                style={[styles.nextBtn, !canGoNext && { opacity: 0.38 }]}
                onPress={() => setStep(s => s + 1)}
                disabled={!canGoNext}
                activeOpacity={0.8}
              >
                <Text style={styles.nextBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Ad Manager Screen ────────────────────────────────────────────────────────

interface AdManagerProps {
  visible: boolean;
  onClose: () => void;
  profile: any;
}

export const AdManagerScreen: React.FC<AdManagerProps> = ({ visible, onClose, profile }) => {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [showCreate, setShowCreate] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCampaigns();
      setCampaigns(data as unknown as Campaign[]);
    } catch {
      // silently fail — empty state handles it
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePause = useCallback((id: string) => {
    Alert.alert('Pause Campaign', 'Your ad will stop showing until you resume it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Pause',
        onPress: async () => {
          try {
            await pauseCampaign(id);
            setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'paused' } : c));
            showToast('Campaign paused.', 'info');
          } catch {
            showToast('Failed to pause campaign.', 'error');
          }
        },
      },
    ]);
  }, [showToast]);

  const handleResume = useCallback((id: string) => {
    Alert.alert('Resume Campaign', 'Your ad will start showing again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resume',
        onPress: async () => {
          try {
            await resumeCampaign(id);
            setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'active' } : c));
            showToast('Campaign resumed.', 'success');
          } catch {
            showToast('Failed to resume campaign.', 'error');
          }
        },
      },
    ]);
  }, [showToast]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete Campaign', 'This cannot be undone. The campaign and its data will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCampaign(id);
            setCampaigns(prev => prev.filter(c => c.id !== id));
            showToast('Campaign deleted.', 'info');
          } catch {
            showToast('Failed to delete campaign.', 'error');
          }
        },
      },
    ]);
  }, [showToast]);

  useEffect(() => {
    if (visible) loadCampaigns();
  }, [visible, loadCampaigns]);

  const stats = useMemo(() => {
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalClicks      = campaigns.reduce((s, c) => s + c.clicks, 0);
    return {
      active:      campaigns.filter(c => c.status === 'active').length,
      impressions: totalImpressions,
      spent:       campaigns.reduce((s, c) => s + c.spent, 0),
      ctr:         totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0.0',
    };
  }, [campaigns]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Ad Manager</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.createBtnText}>Create</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          <View style={styles.statsGrid}>
            {([
              { label: 'Active Ads',  value: String(stats.active),      icon: 'flash-outline',       color: '#22c55e' },
              { label: 'Impressions', value: fmtNum(stats.impressions), icon: 'eye-outline',         color: '#6366f1' },
              { label: 'Total Spend', value: `GHS ${stats.spent}`,      icon: 'card-outline',        color: '#f59e0b' },
              { label: 'Avg CTR',     value: `${stats.ctr}%`,           icon: 'trending-up-outline', color: '#06b6d4' },
            ] as const).map(s => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIconWrap, { backgroundColor: s.color + '20' }]}>
                  <Ionicons name={s.icon as any} size={16} color={s.color} />
                </View>
                <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>YOUR CAMPAIGNS</Text>

          {loading ? (
            <ActivityIndicator size="small" color="#6366f1" style={{ marginVertical: 32 }} />
          ) : campaigns.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="megaphone-outline" size={52} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No campaigns yet</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Reach verified students at {profile?.university ?? 'your campus'}
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
                <Text style={styles.emptyBtnText}>Create Your First Ad</Text>
              </TouchableOpacity>
            </View>
          ) : (
            campaigns.map(c => (
              <CampaignCard
                key={c.id}
                campaign={c}
                onPause={handlePause}
                onResume={handleResume}
                onDelete={handleDelete}
              />
            ))
          ) }

          <View style={[styles.infoBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={18} color="#6366f1" style={{ marginTop: 1 }} />
            <Text style={[styles.infoText, { color: colors.textSub }]}>
              Campus Ads reach verified students at your university only. Campaigns go live within 24 hours of payment approval.
            </Text>
          </View>
        </ScrollView>
      </View>

      <CreateCampaignSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        profile={profile}
        onCreated={loadCampaigns}
      />
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#6366f1', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  statCard: { width: '47.5%', borderRadius: 14, padding: 14, borderWidth: 1, gap: 3 },
  statIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '500' },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },

  // Campaign cards
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  cardMetaText: { fontSize: 11, fontWeight: '600' },
  objDot: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardHeadline: { fontSize: 12, marginBottom: 8 },
  placementPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  placementPillText: { fontSize: 10, fontWeight: '600' },
  progressTrack: { height: 4, borderRadius: 2, marginBottom: 4, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  progressLabel: { fontSize: 11, marginBottom: 10 },
  cardStats: { flexDirection: 'row', alignItems: 'center' },
  cardStat: { flex: 1, alignItems: 'center' },
  cardStatVal: { fontSize: 12, fontWeight: '700' },
  cardStatLbl: { fontSize: 10, marginTop: 1 },
  statDivider: { width: 1, height: 24, backgroundColor: 'rgba(128,128,128,0.15)' },

  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 14 },
  emptySub: { fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { marginTop: 20, backgroundColor: '#6366f1', paddingHorizontal: 22, paddingVertical: 11, borderRadius: 22 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  infoBanner: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 4 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },

  // Create sheet
  sheetContainer: { flex: 1 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700' },
  sheetStep: { fontSize: 11 },
  stepBarWrap: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10 },
  stepSegment: { flex: 1, height: 3, borderRadius: 2 },
  stepBody: { padding: 20, paddingBottom: 32 },
  sheetFooter: { padding: 16, borderTopWidth: 1 },

  // Step 0 — Objective
  objectiveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  objectiveCard: {
    width: '47.5%', borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 4,
  },
  objIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  objLabel: { fontSize: 13, fontWeight: '700' },
  objDesc: { fontSize: 11, lineHeight: 15 },
  objCheck: { position: 'absolute', top: 10, right: 10 },

  // Step 0 — Format
  formatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  formatIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  formatLabel: { fontSize: 14, fontWeight: '700' },
  formatDesc: { fontSize: 12, marginTop: 1 },
  formatRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },

  // Step 1 — Creative
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginBottom: 8 },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  mediaPicker: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, height: 160,
    alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden',
  },
  mediaPreview: { width: '100%', height: '100%', position: 'absolute' },
  mediaOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 8,
  },
  mediaOverlayText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  mediaPickerLabel: { fontSize: 14, fontWeight: '600' },
  mediaPickerSub: { fontSize: 11 },

  // Carousel
  carouselCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  carouselCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  carouselCardNum: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  carouselImageBtn: {
    height: 90, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  carouselImagePreview: { width: '100%', height: '100%' },
  addCardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12,
  },
  addCardText: { color: '#6366f1', fontWeight: '700', fontSize: 13 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22, borderWidth: 1.5 },
  pillText: { fontSize: 13, fontWeight: '600' },

  // Step 2 — Audience
  fieldHint: { fontSize: 11, marginTop: 8, lineHeight: 16 },
  placementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  placementToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
  },
  placementToggleLabel: { fontSize: 13, fontWeight: '600' },

  // Budget cards
  budgetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  budgetCard: {
    width: '47.5%', borderRadius: 14, borderWidth: 1.5,
    padding: 12, gap: 2, position: 'relative',
  },
  budgetLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  budgetAmount: { fontSize: 20, fontWeight: '800' },
  budgetReach: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  budgetTag: { fontSize: 11, marginTop: 2 },
  budgetCheck: { position: 'absolute', top: 10, right: 10 },
  budgetPopularBadge: {
    position: 'absolute', top: -1, right: -1,
    backgroundColor: '#6366f1', borderTopRightRadius: 13, borderBottomLeftRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  budgetPopularText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  // Pacing strip
  pacingStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10,
  },
  pacingText: { flex: 1, fontSize: 12, fontWeight: '500' },

  // Duration cards
  durationRow: { flexDirection: 'row', gap: 8 },
  durationCard: {
    flex: 1, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4,
  },
  durationLabel: { fontSize: 13, fontWeight: '700' },
  durationSpend: { fontSize: 10, fontWeight: '600', marginTop: 3 },

  summaryBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 22 },
  summaryTitle: { fontSize: 14, fontWeight: '700' },
  summaryLine: { fontSize: 12 },
  reachBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  reachBadgeText: { color: '#6366f1', fontSize: 12, fontWeight: '700' },

  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, marginTop: 20,
  },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 15,
  },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
