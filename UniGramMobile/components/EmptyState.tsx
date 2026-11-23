import React from 'react';
import { View, Text, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { fx } from '../lib/feedback';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Force light-on-dark text (e.g. over a black video background). */
  onDarkSurface?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<Props> = ({ icon = 'sparkles-outline', title, subtitle, actionLabel, onAction, onDarkSurface, style }) => {
  const { colors } = useTheme();
  const text = onDarkSurface ? '#fff' : colors.text;
  const sub = onDarkSurface ? 'rgba(255,255,255,0.65)' : colors.textSub;
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40 }, style]}>
      <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: onDarkSurface ? 'rgba(255,255,255,0.08)' : colors.card, marginBottom: 14 }}>
        <Ionicons name={icon} size={28} color={onDarkSurface ? 'rgba(255,255,255,0.6)' : colors.textMuted} />
      </View>
      <Text style={{ color: text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {!!subtitle && <Text style={{ color: sub, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>{subtitle}</Text>}
      {!!actionLabel && !!onAction && (
        <TouchableOpacity
          onPress={() => { fx.tap(); onAction(); }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginTop: 18, minHeight: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default EmptyState;
