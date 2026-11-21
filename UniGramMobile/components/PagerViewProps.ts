import React from 'react';
import { ViewStyle } from 'react-native';

export interface PagerViewProps {
  style?: ViewStyle | ViewStyle[];
  initialPage?: number;
  onPageSelected?: (event: { nativeEvent: { position: number } }) => void;
  scrollEnabled?: boolean;
  children: React.ReactNode;
}
