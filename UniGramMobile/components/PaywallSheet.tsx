import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Modal, ScrollView,
  Dimensions, ActivityIndicator, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { fx } from '../lib/feedback';
import {
  getBillingProvider, PRO_PLANS, FREE_TRIAL_DAYS, type PlanId,
} from '../services/billing';
import { PRO_FEATURE_LIST, PAYWALL_COPY, type PaywallFeature } from '../services/paywallFeatures';

import { friendlyError } from '../lib/friendlyError';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BRAND = ['#6366f1', '#8b5cf6', '#d946ef'] as const;

interface PaywallSheetProps {
  visible: boolean;
  feature: PaywallFeature;
  userId: string | null;
  onClose: () => void;
  onPurchased: () => void;
}

type Phase = 'choose' | 'processing' | 'success';

/** A ring of sparkles that bursts outward behind the success check. */
const SparkleBurst: React.FC<{ trigger: number }> = ({ trigger }) => {
  const COUNT = 14;
  const vals = useRef(Array.from({ length: COUNT }, () => new Animated.Value(0))).current;
  useEffect(() => {
    if (!trigger) return;
    vals.forEach(v => v.setValue(0));
    Animated.stagger(14, vals.map(v => Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }))).start();
  }, [trigger]);
  const colors = ['#facc15', '#a78bfa', '#f472b6', '#38bdf8', '#34d399'];
  return (
    <View pointerEvents="none" style={{ position: 'absolute', alignSelf: 'center', top: 34, width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
      {vals.map((v, i) => {
        const ang = (i / COUNT) * Math.PI * 2;
        const dist = 62 + (i % 3) * 16;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', width: i % 2 ? 7 : 5, height: i % 2 ? 7 : 5, borderRadius: 4,
              backgroundColor: colors[i % colors.length],
              opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(ang) * dist] }) },
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(ang) * dist] }) },
                { scale: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.2, 1.2, 0.4] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
};

export const PaywallSheet: React.FC<PaywallSheetProps> = ({ visible, feature, userId, onClose, onPurchased }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const provider = getBillingProvider();

  const plans = useMemo(() => PRO_PLANS.filter(p => provider.plans.includes(p.id)), [provider]);
  const [planId, setPlanId] = useState<PlanId>(plans[0]?.id ?? 'monthly');
  const [phase, setPhase] = useState<Phase>('choose');
  const [status, setStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const slide = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [burst, setBurst] = useState(0);

  const canTrial = !!userId && provider.canStartTrial(userId);
  const plan = plans.find(p => p.id === planId) ?? plans[0];
  const copy = PAYWALL_COPY[feature] ?? PAYWALL_COPY.general;

  useEffect(() => {
    if (visible) {
      setPhase('choose');
      setErrorMsg(null);
      setInfoMsg(null);
      setPlanId(plans[0]?.id ?? 'monthly');
      slide.setValue(SCREEN_HEIGHT);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, tension: 55, friction: 12, useNativeDriver: true }),
      ]).start();
    } else {
      fade.setValue(0);
    }
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [visible]);

  const dismiss = () => {
    if (phase === 'processing') return; // don't abandon a payment mid-flight
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(slide, { toValue: SCREEN_HEIGHT, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const handleSubscribe = async () => {
    fx.press();
    if (!userId || !plan) { setErrorMsg('Sign in to subscribe.'); return; }
    setErrorMsg(null);
    setInfoMsg(null);
    setPhase('processing');
    setStatus('Starting…');
    try {
      const res = await provider.purchase({
        userId, plan, withTrial: canTrial, onStatus: setStatus,
      });
      if (res.success) {
        setPhase('success');
        setBurst(b => b + 1);
        fx.success();
        successScale.setValue(0);
        Animated.spring(successScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }).start();
        onPurchased();
        closeTimer.current = setTimeout(dismiss, 1700);
      } else {
        setPhase('choose');
        if (!res.cancelled) setErrorMsg(res.message ?? 'Payment was not completed. Try again.');
      }
    } catch (e: any) {
      setPhase('choose');
      setErrorMsg(friendlyError(e, 'Something went wrong. Try again.'));
    }
  };

  const handleRestore = async () => {
    if (!userId) return;
    setRestoring(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const res = await provider.restore(userId);
      if (res.success) {
        onPurchased();
        setInfoMsg(res.message ?? 'Restored.');
        closeTimer.current = setTimeout(dismiss, 1200);
      } else {
        setInfoMsg(res.message ?? 'Nothing to restore.');
      }
    } catch (e: any) {
      setErrorMsg(friendlyError(e, 'Could not restore purchases.'));
    } finally {
      setRestoring(false);
    }
  };

  const sheetBg = isDark ? '#121214' : '#ffffff';
  const cardBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';

  const ctaLabel = canTrial
    ? `Try free for ${FREE_TRIAL_DAYS} days`
    : `Subscribe · GHS ${plan?.priceGHS}/${plan?.periodLabel}`;
  const ctaSub = canTrial && plan
    ? `Then GHS ${plan.priceGHS}/${plan.periodLabel}. Cancel anytime.`
    : 'Cancel anytime in Settings.';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { backgroundColor: sheetBg, transform: [{ translateY: slide }], maxHeight: SCREEN_HEIGHT - insets.top - 12 }]}
      >
        {/* Hero */}
        <LinearGradient colors={BRAND as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <TouchableOpacity
            onPress={dismiss}
            style={styles.closeBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.heroBadge}>
            <Ionicons name="flash" size={13} color="#fff" />
            <Text style={styles.heroBadgeText}>UNIGRAM PRO</Text>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name={copy.icon as any} size={30} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{copy.title}</Text>
          <Text style={styles.heroSub}>{copy.subtitle}</Text>
        </LinearGradient>

        {phase === 'success' ? (
          <View style={[styles.centerBlock, { paddingBottom: insets.bottom + 32 }]}>
            <SparkleBurst trigger={burst} />
            <Animated.View style={[styles.successRing, { transform: [{ scale: successScale }] }]}>
              <Ionicons name="checkmark" size={44} color="#fff" />
            </Animated.View>
            <Text style={[styles.successTitle, { color: colors.text }]}>You're Pro!</Text>
            <Text style={[styles.successSub, { color: colors.textMuted }]}>
              {canTrial ? `Your ${FREE_TRIAL_DAYS}-day free trial has started.` : 'Every Pro feature is now unlocked.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: insets.bottom + 18 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Features */}
            <View style={{ gap: 13 }}>
              {PRO_FEATURE_LIST.map(f => {
                const highlighted = f.key === feature;
                return (
                  <View key={f.key} style={[styles.featRow, highlighted && { backgroundColor: f.color + '14', borderColor: f.color + '55' }]}>
                    <View style={[styles.featIcon, { backgroundColor: f.color + '1f' }]}>
                      <Ionicons name={f.icon as any} size={18} color={f.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featTitle, { color: colors.text }]}>{f.title}</Text>
                      <Text style={[styles.featDesc, { color: colors.textMuted }]}>{f.desc}</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={19} color="#22c55e" />
                  </View>
                );
              })}
            </View>

            {/* Plans */}
            {plans.length > 1 && (
              <View style={styles.plans}>
                {plans.map(p => {
                  const selected = p.id === planId;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.85}
                      onPress={() => { fx.select(); setPlanId(p.id); }}
                      disabled={phase === 'processing'}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={[
                        styles.planCard,
                        { borderColor: selected ? '#8b5cf6' : cardBorder, backgroundColor: selected ? 'rgba(139,92,246,0.10)' : 'transparent' },
                      ]}
                    >
                      {p.badge ? (
                        <View style={styles.planBadge}><Text style={styles.planBadgeText}>{p.badge}</Text></View>
                      ) : null}
                      <View style={styles.radioOuter}>
                        {selected && <View style={styles.radioInner} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.planTitle, { color: colors.text }]}>{p.title}</Text>
                        <Text style={[styles.planSub, { color: colors.textMuted }]}>
                          {p.savingsPct ? `GHS ${p.perMonthGHS.toFixed(2)}/mo · save ${p.savingsPct}%` : 'Billed every month'}
                        </Text>
                      </View>
                      <Text style={[styles.planPrice, { color: colors.text }]}>GHS {p.priceGHS}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {errorMsg && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={15} color="#ef4444" />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}
            {infoMsg && (
              <View style={[styles.errorRow, { backgroundColor: 'rgba(99,102,241,0.10)', borderColor: 'rgba(99,102,241,0.3)' }]}>
                <Ionicons name="information-circle-outline" size={15} color="#818cf8" />
                <Text style={[styles.errorText, { color: '#818cf8' }]}>{infoMsg}</Text>
              </View>
            )}

            {/* CTA */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleSubscribe}
              disabled={phase === 'processing'}
              accessibilityRole="button"
              accessibilityLabel={ctaLabel}
              style={{ marginTop: 16 }}
            >
              <LinearGradient colors={BRAND as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.cta, phase === 'processing' && { opacity: 0.85 }]}>
                {phase === 'processing' ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.ctaText}>{status || 'Processing…'}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="flash" size={18} color="#fff" />
                    <Text style={styles.ctaText}>{ctaLabel}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <Text style={[styles.ctaSub, { color: colors.textMuted }]}>{ctaSub}</Text>

            {provider.isSimulated && (
              <View style={styles.testBanner}>
                <Ionicons name="flask-outline" size={13} color="#f59e0b" />
                <Text style={styles.testBannerText}>TEST MODE — no real payment is taken. Pro unlocks on this device only.</Text>
              </View>
            )}

            <View style={styles.footerRow}>
              <TouchableOpacity onPress={handleRestore} disabled={restoring || phase === 'processing'} hitSlop={8}>
                <Text style={[styles.footerLink, { color: colors.textSub }]}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
              </TouchableOpacity>
              <Text style={[styles.footerDot, { color: colors.textMuted }]}>·</Text>
              <Text style={[styles.footerLink, { color: colors.textMuted }]}>{provider.isSimulated ? 'Simulated checkout' : provider.label}</Text>
            </View>
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden',
  },
  hero: { paddingTop: 20, paddingBottom: 22, paddingHorizontal: 20, alignItems: 'center' },
  closeBtn: {
    position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5,
  },
  heroBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroIcon: {
    width: 62, height: 62, borderRadius: 31, marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { color: '#fff', fontSize: 23, fontWeight: '800', letterSpacing: -0.5, marginTop: 12, textAlign: 'center' },
  heroSub: { color: 'rgba(255,255,255,0.86)', fontSize: 13.5, lineHeight: 19, marginTop: 5, textAlign: 'center' },

  featRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 8, borderRadius: 14, borderWidth: 1, borderColor: 'transparent',
  },
  featIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featTitle: { fontSize: 14, fontWeight: '700' },
  featDesc: { fontSize: 12, lineHeight: 16.5, marginTop: 1 },

  plans: { gap: 10, marginTop: 20 },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 14 },
  planBadge: {
    position: 'absolute', top: -10, right: 14, backgroundColor: '#8b5cf6',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2.5,
  },
  planBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#8b5cf6', alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 11, height: 11, borderRadius: 5.5, backgroundColor: '#8b5cf6' },
  planTitle: { fontSize: 15, fontWeight: '700' },
  planSub: { fontSize: 12, marginTop: 1 },
  planPrice: { fontSize: 16, fontWeight: '800' },

  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14,
    backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)', paddingHorizontal: 12, paddingVertical: 9,
  },
  errorText: { color: '#ef4444', fontSize: 13, flex: 1 },

  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 16, paddingVertical: 16 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  ctaSub: { fontSize: 12, textAlign: 'center', marginTop: 9 },

  testBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14,
    backgroundColor: 'rgba(245,158,11,0.10)', borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)', paddingHorizontal: 11, paddingVertical: 8,
  },
  testBannerText: { color: '#f59e0b', fontSize: 11.5, fontWeight: '600', flex: 1, lineHeight: 15.5 },

  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  footerLink: { fontSize: 12, fontWeight: '600' },
  footerDot: { fontSize: 12 },

  centerBlock: { alignItems: 'center', paddingTop: 34, paddingHorizontal: 24 },
  successRing: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#22c55e',
    alignItems: 'center', justifyContent: 'center',
  },
  successTitle: { fontSize: 22, fontWeight: '800', marginTop: 18 },
  successSub: { fontSize: 14, marginTop: 6, textAlign: 'center' },
});
