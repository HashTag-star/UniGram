import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { getCommunityMoments } from '../services/algorithm';

interface Props {
  university: string;
}

/**
 * Non-intrusive banner that surfaces real connection moments happening
 * on campus. Reinforces the belonging feeling without being gamified.
 *
 * Shows at most once per app session. Animates in, holds for 5 seconds,
 * then fades out. Retries every 2 minutes if no moments exist yet.
 */
export function CommunityPulse({ university }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (!university) return;

    const show = async () => {
      if (hasShownRef.current) return;

      const moments = await getCommunityMoments(university, 1);
      if (!moments.length) return;

      hasShownRef.current = true;
      setMessage(moments[0]);

      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.delay(4_200),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => setMessage(null));
    };

    // First attempt after the feed has loaded
    const initialTimer = setTimeout(show, 3_000);

    // Retry every 2 minutes until we get a moment to show
    const retryInterval = setInterval(show, 2 * 60 * 1_000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(retryInterval);
    };
  }, [university, opacity]);

  if (!message) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(99, 102, 241, 0.10)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.15)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#818CF8',
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '500',
    letterSpacing: 0.1,
  },
});
