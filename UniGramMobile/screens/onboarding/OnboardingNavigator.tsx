import React, { useRef, useState } from 'react';
import {
  View, StyleSheet, Animated, Dimensions, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WelcomeStep } from './steps/WelcomeStep';
import { ProfileSetupStep } from './steps/ProfileSetupStep';
import { InterestsStep } from './steps/InterestsStep';
import { FollowStep } from './steps/FollowStep';
import { PermissionsStep } from './steps/PermissionsStep';

const { width } = Dimensions.get('window');

const STEPS = ['welcome', 'profile', 'interests', 'follow', 'permissions'] as const;
type Step = typeof STEPS[number];

interface Props {
  userId: string;
  onComplete: () => void;
}

export function OnboardingNavigator({ userId, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    if (stepIndex >= STEPS.length - 1) { onComplete(); return; }
    const next = stepIndex + 1;
    Animated.spring(translateX, {
      toValue: -next * width,
      useNativeDriver: true,
      tension: 60,
      friction: 12,
    }).start(() => setStepIndex(next));
  };

  const goBack = () => {
    if (stepIndex === 0) return;
    const prev = stepIndex - 1;
    Animated.spring(translateX, {
      toValue: -prev * width,
      useNativeDriver: true,
      tension: 60,
      friction: 12,
    }).start(() => setStepIndex(prev));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Segmented progress */}
      <View style={[styles.progressRow, { marginTop: insets.top + 10 }]} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: stepIndex + 1 }}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.progressSeg, i <= stepIndex && styles.progressSegOn]} />
        ))}
      </View>

      {/* Slides */}
      <Animated.View style={[styles.slidesWrap, { transform: [{ translateX }] }]}>
        <View style={[styles.slide, { width }]}>
          <WelcomeStep onNext={goNext} />
        </View>
        <View style={[styles.slide, { width }]}>
          <ProfileSetupStep userId={userId} onNext={goNext} onBack={goBack} />
        </View>
        <View style={[styles.slide, { width }]}>
          <InterestsStep userId={userId} onNext={goNext} onBack={goBack} />
        </View>
        <View style={[styles.slide, { width }]}>
          <FollowStep userId={userId} onNext={goNext} onBack={goBack} />
        </View>
        <View style={[styles.slide, { width }]}>
          <PermissionsStep userId={userId} onNext={onComplete} onBack={goBack} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  progressRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 20 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  progressSegOn: { backgroundColor: '#8b5cf6' },
  slidesWrap: { flex: 1, flexDirection: 'row', width: width * STEPS.length },
  slide: { height: '100%' },
});
