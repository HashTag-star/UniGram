import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Modal, Dimensions, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { openProCheckout, PRO_PRICE_GHS } from '../services/pro';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PRO_FEATURES = [
  {
    icon: 'bulb-outline' as const,
    color: '#a855f7',
    title: 'AI Insights',
    desc: 'Get a personalised AI performance report on your content.',
  },
  {
    icon: 'bar-chart-outline' as const,
    color: '#6366f1',
    title: 'Post Analytics',
    desc: 'See views, reach, and engagement on every post.',
  },
  {
    icon: 'eye-outline' as const,
    color: '#0ea5e9',
    title: 'Profile Views',
    desc: 'See how many people visited your profile this week.',
  },
  {
    icon: 'link-outline' as const,
    color: '#22c55e',
    title: 'Story Links',
    desc: 'Add a clickable link to your stories.',
  },
  {
    icon: 'rocket-outline' as const,
    color: '#f59e0b',
    title: 'Explore Priority',
    desc: 'Your posts rank higher in campus explore feeds.',
  },
];

interface ProSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ProSheet: React.FC<ProSheetProps> = ({ visible, onClose, onSuccess }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sheetBg = isDark ? '#161618' : '#ffffff';

  useEffect(() => {
    if (visible) {
      setErrorMsg(null);
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 52, friction: 11, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 240, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleSubscribe = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const success = await openProCheckout();
      if (success) {
        onSuccess();
        onClose();
      } else {
        setErrorMsg('Payment was not completed. Try again.');
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[ps.backdrop, { opacity: opacityAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <Animated.View
        style={[ps.sheet, { backgroundColor: sheetBg, paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] }]}
      >
        <View style={[ps.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }]} />

        {/* Header */}
        <View style={ps.header}>
          <View style={ps.proBadge}>
            <Ionicons name="flash" size={14} color="#fff" />
            <Text style={ps.proBadgeText}>PRO</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[ps.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={[ps.title, { color: colors.text }]}>UniGram Pro</Text>
        <Text style={[ps.subtitle, { color: colors.textMuted }]}>
          Creator tools for students who mean business.
        </Text>

        {/* Feature list */}
        <View style={ps.features}>
          {PRO_FEATURES.map(feat => (
            <View key={feat.title} style={ps.featRow}>
              <View style={[ps.featIcon, { backgroundColor: feat.color + '1a' }]}>
                <Ionicons name={feat.icon} size={18} color={feat.color} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[ps.featTitle, { color: colors.text }]}>{feat.title}</Text>
                <Text style={[ps.featDesc, { color: colors.textMuted }]}>{feat.desc}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
            </View>
          ))}
        </View>

        {errorMsg && (
          <View style={ps.errorRow}>
            <Ionicons name="alert-circle-outline" size={14} color="#ef4444" />
            <Text style={ps.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={[ps.cta, loading && { opacity: 0.6 }]}
          onPress={handleSubscribe}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="flash" size={18} color="#fff" />
              <Text style={ps.ctaText}>Subscribe · GHS {PRO_PRICE_GHS}/month</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[ps.footnote, { color: colors.textMuted }]}>
          Cancel anytime · Secured by Paystack
        </Text>
      </Animated.View>
    </Modal>
  );
};

const ps = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 12,
  },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#6366f1',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  proBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 4 },
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 20 },
  features: { gap: 14, marginBottom: 20 },
  featRow: { flexDirection: 'row', alignItems: 'center' },
  featIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  featDesc: { fontSize: 12, lineHeight: 17 },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  errorText: { color: '#ef4444', fontSize: 13, flex: 1 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 16,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footnote: { fontSize: 11, textAlign: 'center', marginTop: 10 },
});
