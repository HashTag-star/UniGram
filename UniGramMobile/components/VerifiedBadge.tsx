import React from 'react';
import { View, Text } from 'react-native';
import { VerificationType } from '../data/types';

interface Props {
  type?: VerificationType;
  size?: 'sm' | 'md';
}

const colors: Record<VerificationType, string> = {
  student: '#3b82f6',
  professor: '#eab308',
  club: '#a855f7',
  influencer: '#3b82f6',
  staff: '#22c55e',
};

export const VerifiedBadge: React.FC<Props> = ({ type = 'student', size = 'sm' }) => {
  const dim = size === 'sm' ? 14 : 18;
  const fontSize = size === 'sm' ? 8 : 10;
  return (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        backgroundColor: colors[type],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize, fontWeight: 'bold', lineHeight: fontSize + 2 }}>✓</Text>
    </View>
  );
};
