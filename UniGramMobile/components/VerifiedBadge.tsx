import React from 'react';
import { View, Text } from 'react-native';
import { VerificationType } from '../data/types';
import { useTheme } from '../context/ThemeContext';

interface Props {
  type?: VerificationType;
  size?: 'sm' | 'md';
  /** Override ring color — useful on media overlays that are always dark */
  ringColor?: string;
}

const BADGE_COLORS: Record<VerificationType, string> = {
  student: '#6366f1',    // Indigo
  professor: '#eab308',  // Amber
  club: '#a855f7',       // Purple
  influencer: '#1d4ed8', // Royal Blue (Notable)
  staff: '#22c55e',      // Green
  alumni: '#14b8a6',     // Teal
};

export const VerifiedBadge: React.FC<Props> = ({ type = 'student', size = 'sm', ringColor }) => {
  const { colors } = useTheme();
  const dim = size === 'sm' ? 14 : 18;
  const fontSize = size === 'sm' ? 8 : 10;
  const ring = ringColor ?? colors.bg;   // adapts to light/dark theme
  return (
    <View
      style={{
        width: dim + 4,
        height: dim + 4,
        borderRadius: (dim + 4) / 2,
        backgroundColor: ring,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: BADGE_COLORS[type],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize, fontWeight: 'bold', lineHeight: fontSize + 2 }}>✓</Text>
      </View>
    </View>
  );
};
