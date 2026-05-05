import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Modal, Dimensions, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import {
  BOOST_TIERS, initBoostPayment, openPaystackCheckout,
  type BoostType,
} from '../services/payments';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface BoostSheetProps {
  visible: boolean;
  onClose: () => void;
  itemId: string;
  currentBoostType?: string;
  onSuccess: (boostType: BoostType) => void;
}

export const BoostSheet: React.FC<BoostSheetProps> = ({
  visible, onClose, itemId, currentBoostType = 'none', onSuccess,
}) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const [selected, setSelected] = useState<BoostType>('spotlight');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sheetBg = isDark ? '#161618' : '#ffffff';
  const handleColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';

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

  const handlePay = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { authorization_url, reference } = await initBoostPayment(itemId, selected);
      const { success, boostType } = await openPaystackCheckout(authorization_url, reference);
      if (success && boostType) {
        onSuccess(boostType);
        onClose();
      } else {
        setErrorMsg('Payment was not completed. Please try again.');
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedTier = BOOST_TIERS.find(t => t.type === selected)!;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={[bs.backdrop, { opacity: opacityAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          bs.sheet,
          {
            backgroundColor: sheetBg,
            paddingBottom: insets.bottom + 12,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Handle */}
        <View style={[bs.handle, { backgroundColor: handleColor }]} />

        {/* Header */}
        <View style={bs.header}>
          <View>
            <Text style={[bs.title, { color: colors.text }]}>Boost Your Listing</Text>
            <Text style={[bs.subtitle, { color: colors.textMuted }]}>
              Get more eyes on your item
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={[bs.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Active boost banner */}
        {currentBoostType !== 'none' && (
          <View style={bs.activeBanner}>
            <Ionicons name="checkmark-circle" size={15} color="#22c55e" />
            <Text style={bs.activeBannerText}>
              Active: <Text style={{ fontWeight: '700', textTransform: 'capitalize' }}>{currentBoostType}</Text>
              {' '}— you can upgrade anytime
            </Text>
          </View>
        )}

        {/* Tiers */}
        {BOOST_TIERS.map(tier => {
          const isSelected = selected === tier.type;
          return (
            <TouchableOpacity
              key={tier.type}
              style={[
                bs.tierCard,
                {
                  borderColor: isSelected ? tier.color : (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'),
                  backgroundColor: isSelected
                    ? `${tier.color}16`
                    : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                },
              ]}
              onPress={() => setSelected(tier.type)}
              activeOpacity={0.75}
            >
              <View style={[bs.tierIcon, { backgroundColor: `${tier.color}1e` }]}>
                <Ionicons name={tier.icon as any} size={20} color={tier.color} />
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[bs.tierLabel, { color: colors.text }]}>{tier.label}</Text>
                  <View style={[bs.durationBadge, { backgroundColor: `${tier.color}18` }]}>
                    <Text style={[bs.durationText, { color: tier.color }]}>{tier.duration}</Text>
                  </View>
                </View>
                <Text style={[bs.tierDesc, { color: colors.textMuted }]}>{tier.description}</Text>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[bs.tierPrice, { color: tier.color }]}>GHS {tier.price_ghs}</Text>
                {isSelected && (
                  <View style={[bs.selectedDot, { backgroundColor: tier.color }]} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Error */}
        {errorMsg && (
          <View style={bs.errorRow}>
            <Ionicons name="alert-circle-outline" size={14} color="#ef4444" />
            <Text style={bs.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* Pay button */}
        <TouchableOpacity
          style={[bs.payBtn, { backgroundColor: selectedTier.color }, loading && { opacity: 0.6 }]}
          onPress={handlePay}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="card-outline" size={18} color="#fff" />
              <Text style={bs.payBtnText}>
                Pay GHS {selectedTier.price_ghs} · {selectedTier.label}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[bs.footNote, { color: colors.textMuted }]}>
          Secured by Paystack · MoMo, Visa, Mastercard &amp; more
        </Text>
      </Animated.View>
    </Modal>
  );
};

const bs = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  activeBannerText: { color: '#22c55e', fontSize: 13, flex: 1 },
  tierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  tierIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierLabel: { fontSize: 15, fontWeight: '700' },
  durationBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { fontSize: 10, fontWeight: '700' },
  tierDesc: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  tierPrice: { fontSize: 16, fontWeight: '800' },
  selectedDot: { width: 6, height: 6, borderRadius: 3 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  errorText: { color: '#ef4444', fontSize: 13, flex: 1 },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 4,
  },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footNote: { fontSize: 11, textAlign: 'center', marginTop: 10 },
});
