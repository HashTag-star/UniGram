import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewStyle } from 'react-native';

interface Props {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton: React.FC<Props> = ({ width = '100%', height = 16, borderRadius = 8, style }) => {
  const opacity = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.65, duration: 850, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.25, duration: 850, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius, backgroundColor: '#252525', opacity }, style]}
    />
  );
};

export const FeedPostSkeleton: React.FC = () => (
  <View style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', marginBottom: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }}>
      <Skeleton width={42} height={42} borderRadius={21} />
      <View style={{ gap: 7, flex: 1 }}>
        <Skeleton width={'45%' as any} height={12} />
        <Skeleton width={'28%' as any} height={10} />
      </View>
    </View>
    <Skeleton height={320} borderRadius={0} />
    <View style={{ padding: 12, gap: 9 }}>
      <Skeleton width={'30%' as any} height={13} />
      <Skeleton width={'85%' as any} height={12} />
      <Skeleton width={'60%' as any} height={12} />
    </View>
  </View>
);

export const StorySkeleton: React.FC = () => (
  <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 12 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <View key={i} style={{ alignItems: 'center', gap: 5 }}>
        <Skeleton width={66} height={66} borderRadius={33} />
        <Skeleton width={48} height={9} />
      </View>
    ))}
  </View>
);

export const ConvSkeleton: React.FC = () => (
  <View>
    {[1, 2, 3, 4, 5].map(i => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12 }}>
        <Skeleton width={52} height={52} borderRadius={26} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width={'48%' as any} height={13} />
          <Skeleton width={'72%' as any} height={11} />
        </View>
      </View>
    ))}
  </View>
);

export const MarketSkeleton: React.FC<{ cardWidth: number }> = ({ cardWidth }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8, justifyContent: 'space-between' }}>
    {[1, 2, 3, 4].map(i => (
      <View key={i} style={{ width: cardWidth, borderRadius: 16, overflow: 'hidden', gap: 0 }}>
        <Skeleton height={cardWidth} borderRadius={0} />
        <View style={{ padding: 10, gap: 7 }}>
          <Skeleton width={'80%' as any} height={12} />
          <Skeleton width={'40%' as any} height={16} />
          <Skeleton width={'55%' as any} height={10} />
        </View>
      </View>
    ))}
  </View>
);

export const ProfilePostsSkeleton: React.FC<{ colSize: number }> = ({ colSize }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
    {[1, 2, 3, 4, 5, 6].map(i => (
      <Skeleton key={i} width={colSize} height={colSize} borderRadius={0} />
    ))}
  </View>
);

export const MessagesSkeleton: React.FC = () => (
  <View style={{ padding: 16, gap: 16 }}>
    {[1, 2, 3].map(i => (
      <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
        <Skeleton width={52} height={52} borderRadius={26} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width={'45%' as any} height={12} />
          <Skeleton width={'70%' as any} height={11} />
        </View>
      </View>
    ))}
  </View>
);

export const CommentsSkeleton: React.FC = () => (
  <View style={{ padding: 14, gap: 16 }}>
    {[1, 2, 3, 4].map(i => (
      <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
        <Skeleton width={32} height={32} borderRadius={16} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Skeleton width={60} height={10} />
            <Skeleton width={30} height={8} />
          </View>
          <Skeleton width={'90%' as any} height={12} />
          <Skeleton width={'40%' as any} height={12} />
        </View>
      </View>
    ))}
  </View>
);

export const ProfileHeaderSkeleton: React.FC = () => (
  <View>
    <Skeleton height={120} borderRadius={0} />
    <View style={{ paddingHorizontal: 14, marginTop: -44 }}>
      <Skeleton width={90} height={90} borderRadius={45} style={{ borderWidth: 4, borderColor: '#000' }} />
      <View style={{ marginTop: 12, gap: 8 }}>
        <Skeleton width={'40%' as any} height={18} />
        <Skeleton width={'25%' as any} height={12} />
        <View style={{ marginTop: 8, gap: 6 }}>
          <Skeleton width={'85%' as any} height={13} />
          <Skeleton width={'60%' as any} height={13} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 20, marginTop: 20 }}>
        <Skeleton width={60} height={30} borderRadius={15} />
        <Skeleton width={60} height={30} borderRadius={15} />
        <Skeleton width={60} height={30} borderRadius={15} />
      </View>
    </View>
  </View>
);
