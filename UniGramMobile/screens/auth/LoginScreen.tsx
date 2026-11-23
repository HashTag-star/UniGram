import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, Animated, Easing, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signIn, signInWithGoogle, sendPasswordReset } from '../../services/auth';
import { supabase } from '../../lib/supabase';
import { usePopup } from '../../context/PopupContext';
import { useHaptics } from '../../hooks/useHaptics';
import {
  AuthBackground, BrandMark, AuthField, PasswordToggle, AuthButton, GoogleButton, OrDivider, InfoPill,
  type AuthInputRef,
} from '../../components/ui/AuthKit';
import { authPalette as P, status } from '../../constants/design';

import { friendlyError } from '../../lib/friendlyError';
interface Props {
  onNavigateSignup: () => void;
}

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export default function LoginScreen({ onNavigateSignup }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const { showPopup } = usePopup();
  const { error: hapticError, success: hapticSuccess } = useHaptics();
  const insets = useSafeAreaInsets();
  const passRef = useRef<AuthInputRef>(null);

  // Entrance: brand drops in, then the form rises.
  const hero = useRef(new Animated.Value(0)).current;
  const form = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(hero, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(form, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const validate = () => {
    let ok = true;
    if (!email.trim()) { setEmailError('Enter your email'); ok = false; }
    else if (!isValidEmail(email)) { setEmailError('That doesn’t look like a valid email'); ok = false; }
    else setEmailError(null);
    if (!password) { setPassError('Enter your password'); ok = false; } else setPassError(null);
    return ok;
  };

  const handleLogin = async () => {
    setFormError(null);
    setResetSent(false);
    if (!validate()) { hapticError(); return; }
    setLoading(true);
    try {
      const session = await signIn(email.trim().toLowerCase(), password);
      if (session?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles').select('is_banned').eq('id', session.user.id).single();
        if (profile?.is_banned) {
          await supabase.auth.signOut();
          showPopup({
            title: 'Account banned',
            message: 'Your account has been permanently banned from UniGram for violating campus community guidelines.\n\nIf you believe this is a mistake, contact campus support.',
            icon: 'ban-outline',
            buttons: [{ text: 'Got it', style: 'destructive', onPress: () => {} }],
          });
          return;
        }
      }
      hapticSuccess();
    } catch (err: any) {
      hapticError();
      const msg: string = friendlyError(err, 'Something went wrong.');
      setFormError(/invalid login/i.test(msg) ? 'Incorrect email or password. Try again.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setFormError(null);
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result === 'cancelled') return;
    } catch (err: any) {
      setFormError(friendlyError(err, 'Could not sign in with Google.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setFormError(null);
    if (!email.trim() || !isValidEmail(email)) {
      setEmailError('Enter your email first, then tap “Forgot password?”');
      return;
    }
    showPopup({
      title: 'Reset password',
      message: `Send a reset link to ${email.trim()}?`,
      icon: 'key-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: 'Send link',
          onPress: async () => {
            try {
              await sendPasswordReset(email.trim());
              setResetSent(true);
            } catch (err: any) {
              setFormError(friendlyError(err, 'Could not send reset email.'));
            }
          },
        },
      ],
    });
  };

  return (
    <AuthBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[s.hero, {
            opacity: hero,
            transform: [{ translateY: hero.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
          }]}>
            <BrandMark size={76} tagline="Your campus, connected." />
          </Animated.View>

          <Animated.View style={{
            opacity: form,
            transform: [{ translateY: form.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          }}>
            <Text style={s.title}>Welcome back</Text>
            <Text style={s.subtitle}>Sign in to keep up with your campus.</Text>

            {formError ? (
              <View style={s.errorBanner} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={16} color={status.danger} />
                <Text style={s.errorBannerText}>{formError}</Text>
              </View>
            ) : null}
            {resetSent ? (
              <View style={{ marginBottom: 14 }}>
                <InfoPill icon="checkmark-circle" tone="success">
                  Reset link sent — check your inbox (and spam folder).
                </InfoPill>
              </View>
            ) : null}

            <AuthField
              icon="mail-outline"
              placeholder="Email"
              value={email}
              onChangeText={(t) => { setEmail(t); if (emailError) setEmailError(null); }}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passRef.current?.focus()}
              error={emailError}
            />
            <AuthField
              ref={passRef}
              icon="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={(t) => { setPassword(t); if (passError) setPassError(null); }}
              secureTextEntry={!showPass}
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              error={passError}
              rightNode={<PasswordToggle shown={showPass} onToggle={() => setShowPass(v => !v)} />}
            />

            <TouchableOpacity onPress={handleForgotPassword} style={s.forgot} hitSlop={8} accessibilityRole="button">
              <Text style={s.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <AuthButton label="Sign in" onPress={handleLogin} loading={loading} />

            <OrDivider />

            <GoogleButton onPress={handleGoogle} loading={googleLoading} />

            <View style={s.hint}>
              <Ionicons name="school-outline" size={14} color={P.link} />
              <Text style={s.hintText}>
                Sign up with your <Text style={s.hintBold}>.edu email</Text> to unlock campus verification.
              </Text>
            </View>

            <TouchableOpacity onPress={onNavigateSignup} style={s.switchBtn} accessibilityRole="button">
              <Text style={s.switchText}>
                New to UniGram?  <Text style={s.switchLink}>Create account</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthBackground>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  hero: { alignItems: 'center', marginBottom: 40 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: P.textSub, fontSize: 14.5, marginTop: 4, marginBottom: 24 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14,
    backgroundColor: 'rgba(255,48,64,0.10)', borderColor: 'rgba(255,48,64,0.3)',
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11,
  },
  errorBannerText: { color: '#ff7a85', fontSize: 13.5, fontWeight: '500', flex: 1, lineHeight: 18 },

  forgot: { alignSelf: 'flex-end', marginBottom: 22, marginTop: 2, paddingVertical: 2 },
  forgotText: { color: P.link, fontSize: 13.5, fontWeight: '600' },

  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, justifyContent: 'center', paddingHorizontal: 8 },
  hintText: { color: P.textMuted, fontSize: 12.5, lineHeight: 17, flexShrink: 1, textAlign: 'center' },
  hintBold: { color: P.link, fontWeight: '700' },

  switchBtn: { alignItems: 'center', marginTop: 22, paddingVertical: 8 },
  switchText: { color: P.textSub, fontSize: 14.5 },
  switchLink: { color: '#fff', fontWeight: '800' },
});
