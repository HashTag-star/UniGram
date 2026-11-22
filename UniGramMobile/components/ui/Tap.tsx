import React, { useRef } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { fx } from '../../lib/feedback';

type FeedbackKind = 'tap' | 'select' | 'pop' | 'like' | 'press' | 'tick' | 'none';

interface TapProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Which haptic/sound fires on press. Default: a soft tap. */
  feedback?: FeedbackKind;
  /** Scale while pressed (1 = no squish). */
  pressedScale?: number;
  /** Fade slightly while pressed. */
  pressedOpacity?: number;
  /** Drop-in compatibility with TouchableOpacity call sites. */
  activeOpacity?: number;
}

/**
 * The app's standard pressable: springs down on touch, springs back with a little
 * life, and gives matching haptic + sound feedback. Use it instead of a bare
 * TouchableOpacity for primary controls.
 */
export const Tap: React.FC<TapProps> = ({
  children, style, feedback = 'tap', pressedScale = 0.94, pressedOpacity, activeOpacity, onPress, onPressIn, onPressOut, ...rest
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const to = (s: number, o: number, bouncy: boolean) => {
    Animated.parallel([
      Animated.spring(scale, { toValue: s, speed: bouncy ? 22 : 40, bounciness: bouncy ? 9 : 0, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: o, duration: 90, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => { to(pressedScale, pressedOpacity ?? (activeOpacity != null ? Math.max(activeOpacity, 0.7) : 1), false); onPressIn?.(e); }}
      onPressOut={(e) => { to(1, 1, true); onPressOut?.(e); }}
      onPress={(e) => {
        if (feedback !== 'none') fx[feedback]();
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }], opacity }]}>{children}</Animated.View>
    </Pressable>
  );
};
