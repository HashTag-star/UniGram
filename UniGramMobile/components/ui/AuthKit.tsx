import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Easing,
  ActivityIndicator, Pressable, StatusBar, Image, type TextInputProps, type StyleProp, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { authPalette as P, brand, radius, shadow, status } from '../../constants/design';

// ─── Background ───────────────────────────────────────────────────────────────
/** Dark canvas with two slowly drifting colour orbs — gives auth screens depth. */
export const AuthBackground: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mk = (v: Animated.Value, ms: number) =>
      Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
    const la = mk(a, 9000); const lb = mk(b, 12000);
    la.start(); lb.start();
    return () => { la.stop(); lb.stop(); };
  }, []);

  return (
    <View style={styles.bg}>
      <StatusBar barStyle="light-content" />
      <Animated.View
        pointerEvents="none"
        style={[styles.orb, styles.orbA, { transform: [
          { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [-20, 30] }) },
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
        ] }]}
      >
        <LinearGradient colors={['rgba(99,102,241,0.55)', 'rgba(99,102,241,0)']} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.orb, styles.orbB, { transform: [
          { translateX: b.interpolate({ inputRange: [0, 1], outputRange: [20, -30] }) },
          { translateY: b.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
        ] }]}
      >
        <LinearGradient colors={['rgba(217,70,239,0.35)', 'rgba(217,70,239,0)']} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {children}
    </View>
  );
};

// ─── Brand mark ───────────────────────────────────────────────────────────────
export const BrandMark: React.FC<{ size?: number; withWordmark?: boolean; tagline?: string }> = ({
  size = 72, withWordmark = true, tagline,
}) => (
  <View style={{ alignItems: 'center' }}>
    <View style={[{ width: size, height: size, borderRadius: size * 0.32 }, shadow.glow(brand.violet)]}>
      <LinearGradient
        colors={brand.gradient as any}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ flex: 1, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: size * 0.56, fontWeight: '900', color: '#fff', letterSpacing: -2, marginTop: -2 }}>U</Text>
      </LinearGradient>
    </View>
    {withWordmark && <Text style={styles.wordmark}>UniGram</Text>}
    {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
  </View>
);

// ─── Field (floating label) ───────────────────────────────────────────────────
export interface AuthFieldProps extends Pick<TextInputProps,
  'keyboardType' | 'autoCapitalize' | 'returnKeyType' | 'onSubmitEditing' | 'maxLength' | 'autoComplete' | 'textContentType'> {
  icon: string;
  /** Used as the floating label. */
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  rightNode?: React.ReactNode;
  /** Forces the border colour (e.g. availability feedback). Wins over focus/error. */
  borderOverride?: string;
  error?: string | null;
  hint?: string | null;
  style?: StyleProp<ViewStyle>;
}

/** Instance type of RN's TextInput (changed shape in RN 0.88). */
export type AuthInputRef = React.ComponentRef<typeof TextInput>;

export const AuthField = React.forwardRef<AuthInputRef, AuthFieldProps>(({
  icon, placeholder, value, onChangeText, secureTextEntry, rightNode, borderOverride,
  error, hint, style, autoCapitalize, ...rest
}, ref) => {
  const [focused, setFocused] = useState(false);
  const focus = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(value ? 1 : 0)).current;

  const floating = focused || !!value;
  useEffect(() => {
    Animated.timing(lift, { toValue: floating ? 1 : 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [floating]);
  useEffect(() => {
    Animated.timing(focus, { toValue: focused ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [focused]);

  const hasError = !!error;
  const borderColor = borderOverride
    ? borderOverride
    : hasError
      ? status.danger
      : focus.interpolate({ inputRange: [0, 1], outputRange: [P.fieldBorder, P.fieldFocus] });
  const backgroundColor = focus.interpolate({ inputRange: [0, 1], outputRange: [P.field, P.fieldFocusBg] });
  const iconColor = hasError ? status.danger : focused ? brand.violet : P.textMuted;

  return (
    <View style={[{ marginBottom: error || hint ? 6 : 14 }, style]}>
      <Animated.View style={[styles.field, { borderColor: borderColor as any, backgroundColor }]}>
        <Ionicons name={icon as any} size={19} color={iconColor} style={{ marginRight: 12 }} />
        <View style={{ flex: 1, height: '100%', justifyContent: 'center', paddingTop: floating ? 15 : 0 }}>
          <Animated.Text
            pointerEvents="none"
            numberOfLines={1}
            style={[styles.floatLabel, {
              color: hasError ? status.danger : focused ? P.link : P.placeholder,
              transform: [
                { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -11] }) },
                { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }) },
              ],
            }]}
          >
            {placeholder}
          </Animated.Text>
          <TextInput
            ref={ref}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            secureTextEntry={secureTextEntry}
            autoCapitalize={autoCapitalize ?? 'none'}
            autoCorrect={false}
            selectionColor={brand.violet}
            placeholderTextColor={P.placeholder}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            {...rest}
          />
        </View>
        {rightNode}
      </Animated.View>
      {error ? (
        <View style={styles.msgRow}>
          <Ionicons name="alert-circle" size={13} color={status.danger} />
          <Text style={[styles.msg, { color: status.danger }]}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={[styles.msg, { color: P.textMuted, marginBottom: 8 }]}>{hint}</Text>
      ) : null}
    </View>
  );
});

/** Eye toggle for password fields. */
export const PasswordToggle: React.FC<{ shown: boolean; onToggle: () => void }> = ({ shown, onToggle }) => (
  <TouchableOpacity
    onPress={onToggle}
    hitSlop={10}
    style={{ padding: 4 }}
    accessibilityRole="button"
    accessibilityLabel={shown ? 'Hide password' : 'Show password'}
  >
    <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={19} color={P.textMuted} />
  </TouchableOpacity>
);

// ─── Buttons ──────────────────────────────────────────────────────────────────
interface AuthButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'glass' | 'light';
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  label, onPress, loading, disabled, variant = 'primary', icon, style,
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, tension: 300, friction: 20, useNativeDriver: true }).start();
  const inactive = disabled || loading;

  const body = loading
    ? <ActivityIndicator color={variant === 'light' ? '#111' : '#fff'} />
    : (
      <>
        {icon}
        <Text style={[styles.btnText, variant === 'light' && { color: '#111' }]}>{label}</Text>
      </>
    );

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: disabled && !loading ? 0.5 : 1 }, style]}>
      <Pressable
        onPress={onPress}
        disabled={inactive}
        onPressIn={() => to(0.975)}
        onPressOut={() => to(1)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      >
        {variant === 'primary' ? (
          <View style={shadow.glow(brand.violet)}>
            <LinearGradient colors={brand.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
              {body}
            </LinearGradient>
          </View>
        ) : (
          <View style={[styles.btn, variant === 'light' ? styles.btnLight : styles.btnGlass]}>{body}</View>
        )}
      </Pressable>
    </Animated.View>
  );
};

/** "Continue with Google" — official mark on a light surface. */
export const GoogleButton: React.FC<{ onPress: () => void; loading?: boolean; label?: string }> = ({
  onPress, loading, label = 'Continue with Google',
}) => (
  <AuthButton
    variant="light"
    label={label}
    onPress={onPress}
    loading={loading}
    icon={<Image source={require('../../assets/google.png')} style={{ width: 20, height: 20 }} />}
  />
);

export const OrDivider: React.FC<{ text?: string }> = ({ text = 'or' }) => (
  <View style={styles.divider}>
    <View style={styles.dividerLine} />
    <Text style={styles.dividerText}>{text}</Text>
    <View style={styles.dividerLine} />
  </View>
);

/** Inline status pill (info / success / warning) used instead of throwaway popups. */
export const InfoPill: React.FC<{ icon: string; tone?: 'info' | 'success' | 'warning'; children: React.ReactNode }> = ({
  icon, tone = 'info', children,
}) => {
  const c = tone === 'success' ? status.success : tone === 'warning' ? status.warning : brand.violet;
  return (
    <View style={[styles.pill, { backgroundColor: c + '14', borderColor: c + '33' }]}>
      <Ionicons name={icon as any} size={15} color={c} />
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: P.bg, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 999, overflow: 'hidden' },
  orbA: { width: 420, height: 420, top: -140, left: -120 },
  orbB: { width: 380, height: 380, bottom: -120, right: -140 },

  wordmark: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 16 },
  tagline: { color: P.textSub, fontSize: 14, marginTop: 5, letterSpacing: 0.1 },

  field: {
    flexDirection: 'row', alignItems: 'center', height: 58,
    borderRadius: radius.lg, borderWidth: 1.5, paddingHorizontal: 16,
  },
  floatLabel: { position: 'absolute', left: 0, top: 18, fontSize: 15, lineHeight: 20, transformOrigin: 'left center' as any },
  input: { color: P.text, fontSize: 15.5, paddingVertical: 0, paddingHorizontal: 0, margin: 0, height: 28, lineHeight: 20, fontWeight: '500', textAlignVertical: 'center', includeFontPadding: false },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginBottom: 8, paddingLeft: 4 },
  msg: { fontSize: 12.5, fontWeight: '500', paddingLeft: 4 },

  btn: { height: 56, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnGlass: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  btnLight: { backgroundColor: '#fff' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: -0.1 },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.16)' },
  dividerText: { color: P.textMuted, fontSize: 12.5, marginHorizontal: 14, fontWeight: '500' },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  pillText: { color: P.textSub, fontSize: 12.5, lineHeight: 17, flex: 1 },
});
