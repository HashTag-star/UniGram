import React from 'react';
import { View } from 'react-native';
import { SafeModules } from '../lib/SafeModules';

export const SafeBlur = ({ intensity, tint, style, children }: any) => {
  if (SafeModules.hasBlur()) {
    const { BlurView } = require('expo-blur');
    return <BlurView intensity={intensity} tint={tint} style={style}>{children}</BlurView>;
  }
  return <View style={[style, { backgroundColor: tint === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)' }]}>{children}</View>;
};
