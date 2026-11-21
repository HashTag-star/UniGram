import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

/** Compact, dismissible upsell shown inside the feed for non-Pro users. */
export const ProPromoCard: React.FC<{
  onPress: () => void;
  onDismiss: () => void;
}> = React.memo(({ onPress, onDismiss }) => (
  <View style={s.wrap}>
    <LinearGradient
      colors={['#6366f1', '#8b5cf6', '#d946ef']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <TouchableOpacity
        onPress={onDismiss}
        style={s.close}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
      <View style={s.icon}>
        <Ionicons name="flash" size={22} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>See how your posts perform</Text>
        <Text style={s.sub}>Analytics, AI insights and Explore priority with UniGram Pro.</Text>
      </View>
      <TouchableOpacity onPress={onPress} style={s.cta} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Try UniGram Pro">
        <Text style={s.ctaText}>Try Pro</Text>
      </TouchableOpacity>
    </LinearGradient>
  </View>
));

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, paddingRight: 12 },
  close: { position: 'absolute', top: 6, right: 8, zIndex: 2, padding: 2 },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 14.5, fontWeight: '800', letterSpacing: -0.2, paddingRight: 14 },
  sub: { color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 16.5, marginTop: 2 },
  cta: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, marginTop: 14 },
  ctaText: { color: '#6d28d9', fontSize: 13, fontWeight: '800' },
});
