import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type AIContextType = 'none' | 'info' | 'warning' | 'misleading';

export interface AIContextResult {
  type: AIContextType;
  context: string;
  detail: string;
  confidence: number;
}

const CONFIG = {
  info: {
    icon: 'sparkles' as const,
    label: 'AI context',
    accent: '#6366f1',
    accent2: '#8b5cf6',
    tint: 'rgba(99,102,241,0.10)',
  },
  warning: {
    icon: 'alert-circle' as const,
    label: 'Unverified claim',
    accent: '#f59e0b',
    accent2: '#f97316',
    tint: 'rgba(245,158,11,0.10)',
  },
  misleading: {
    icon: 'warning' as const,
    label: 'Possibly misleading',
    accent: '#ef4444',
    accent2: '#ec4899',
    tint: 'rgba(239,68,68,0.10)',
  },
};

interface Props {
  result: AIContextResult;
  isDark: boolean;
}

export const AIContextCard: React.FC<Props> = React.memo(({ result, isDark }) => {
  const [expanded, setExpanded] = useState(false);
  if (result.type === 'none') return null;

  const cfg = CONFIG[result.type];
  const text = isDark ? '#f4f4f6' : '#111114';
  const sub = isDark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.58)';
  const surface = isDark ? '#101014' : '#ffffff';
  const pct = Math.round(Math.max(0, Math.min(1, result.confidence > 1 ? result.confidence / 100 : result.confidence)) * 100);
  const canExpand = (result.context?.length ?? 0) > 110 || !!result.detail;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    setExpanded(e => !e);
  };

  return (
    // Gradient hairline "border" around a translucent inner surface
    <LinearGradient
      colors={[cfg.accent, cfg.accent2, cfg.accent + '33']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.frame}
    >
      <TouchableOpacity
        activeOpacity={canExpand ? 0.88 : 1}
        onPress={canExpand ? toggle : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${cfg.label}. ${result.context}`}
        accessibilityHint={canExpand ? (expanded ? 'Collapse' : 'Expand for details') : undefined}
        style={[styles.card, { backgroundColor: surface }]}
      >
        <LinearGradient colors={[cfg.tint, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />

        <View style={styles.header}>
          <LinearGradient colors={[cfg.accent, cfg.accent2]} style={styles.badge}>
            <Ionicons name={cfg.icon} size={13} color="#fff" />
          </LinearGradient>
          <Text style={[styles.label, { color: text }]}>{cfg.label}</Text>
          <View style={[styles.aiPill, { backgroundColor: cfg.tint }]}>
            <Text style={[styles.aiPillText, { color: cfg.accent }]}>AI</Text>
          </View>
          <View style={{ flex: 1 }} />
          {pct > 0 ? (
            <View style={styles.conf}>
              <View style={[styles.confTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }]}>
                <View style={[styles.confFill, { width: `${pct}%`, backgroundColor: cfg.accent }]} />
              </View>
              <Text style={[styles.confText, { color: sub }]}>{pct}%</Text>
            </View>
          ) : null}
          {canExpand ? <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={sub} style={{ marginLeft: 8 }} /> : null}
        </View>

        <Text style={[styles.context, { color: text }]} numberOfLines={expanded ? undefined : 2}>
          {result.context}
        </Text>

        {expanded && !!result.detail ? (
          <View style={[styles.detailBox, { borderLeftColor: cfg.accent }]}>
            <Text style={[styles.detail, { color: sub }]}>{result.detail}</Text>
          </View>
        ) : null}

        {expanded ? (
          <View style={styles.footerRow}>
            <Ionicons name="shield-checkmark-outline" size={12} color={sub} />
            <Text style={[styles.footer, { color: sub }]}>AI-generated · not a definitive fact-check. Use your own judgement.</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  frame: { marginHorizontal: 12, marginTop: 6, marginBottom: 4, borderRadius: 16, padding: 1 },
  card: { borderRadius: 15, paddingHorizontal: 13, paddingVertical: 11, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  badge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  aiPill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1.5 },
  aiPillText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
  conf: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confTrack: { width: 34, height: 4, borderRadius: 2, overflow: 'hidden' },
  confFill: { height: '100%', borderRadius: 2 },
  confText: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  context: { fontSize: 14, lineHeight: 20, letterSpacing: -0.1 },
  detailBox: { borderLeftWidth: 2, paddingLeft: 10, marginTop: 9 },
  detail: { fontSize: 13, lineHeight: 19 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  footer: { fontSize: 11, flex: 1, lineHeight: 15 },
});
