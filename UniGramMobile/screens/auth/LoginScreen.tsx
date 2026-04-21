import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Animated, StatusBar, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signIn, signInWithGoogle, sendPasswordReset } from '../../services/auth';
import { supabase } from '../../lib/supabase';
import { usePopup } from '../../context/PopupContext';

const { width } = Dimensions.get('window');

interface Props {
  onNavigateSignup: () => void;
}

// ─── Logo ────────────────────────────────────────────────────────────────────
const AppLogo: React.FC<{ size?: number }> = ({ size = 80 }) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const ringSize = size * 1.55;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
      {/* Outer pulse ring */}
      <Animated.View style={{
        position: 'absolute',
        width: ringSize, height: ringSize, borderRadius: ringSize / 2,
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
        transform: [{ scale: pulse }],
      }} />
      {/* Middle ring */}
      <View style={{
        position: 'absolute',
        width: size * 1.28, height: size * 1.28, borderRadius: size * 0.64,
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.35)',
        backgroundColor: 'rgba(79,70,229,0.06)',
      }} />
      {/* Logo mark */}
      <LinearGradient
        colors={['#818cf8', '#6366f1', '#4338ca']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{
          width: size, height: size, borderRadius: size * 0.3,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#6366f1', shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.7, shadowRadius: 28, elevation: 28,
        }}
      >
        <Text style={{ fontSize: size * 0.54, fontWeight: '900', color: '#fff', letterSpacing: -2 }}>U</Text>
      </LinearGradient>
    </View>
  );
};

// ─── Feature pills ────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: 'images-outline', label: 'Posts & Reels' },
  { icon: 'bag-outline', label: 'Marketplace' },
  { icon: 'chatbubbles-outline', label: 'Campus Chat' },
];

const FeatureStrip = () => (
  <View style={featureStyles.row}>
    {FEATURES.map((f, i) => (
      <View key={i} style={featureStyles.pill}>
        <Ionicons name={f.icon as any} size={13} color="#818cf8" />
        <Text style={featureStyles.label}>{f.label}</Text>
      </View>
    ))}
  </View>
);

const featureStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
  },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
});

// ─── Field ────────────────────────────────────────────────────────────────────
const Field: React.FC<{
  icon: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  rightNode?: React.ReactNode;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
}> = ({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, rightNode, returnKeyType, onSubmitEditing }) => {
  const [focused, setFocused] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const onFocus = () => {
    setFocused(true);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: false }).start();
  };
  const onBlur = () => {
    setFocused(false);
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', 'rgba(129,140,248,0.7)'],
  });
  const bgColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.05)', 'rgba(99,102,241,0.08)'],
  });

  return (
    <Animated.View style={[styles.field, { borderColor, backgroundColor: bgColor }]}>
      <Ionicons name={icon as any} size={18} color={focused ? '#818cf8' : '#4b5563'} style={styles.fieldIcon} />
      <TextInput
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor="#4b5563"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'none'}
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoCorrect={false}
      />
      {rightNode}
    </Animated.View>
  );
};

// ─── Google button ─────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <View style={googleStyles.iconWrap}>
    <Text style={[googleStyles.gLetter, { color: '#EA4335' }]}>G</Text>
    <Text style={[googleStyles.gLetter, { color: '#4285F4' }]}>o</Text>
    <Text style={[googleStyles.gLetter, { color: '#FBBC05' }]}>o</Text>
    <Text style={[googleStyles.gLetter, { color: '#4285F4' }]}>g</Text>
    <Text style={[googleStyles.gLetter, { color: '#34A853' }]}>l</Text>
    <Text style={[googleStyles.gLetter, { color: '#EA4335' }]}>e</Text>
  </View>
);

const googleStyles = StyleSheet.create({
  iconWrap: { flexDirection: 'row', alignItems: 'center' },
  gLetter: { fontSize: 15, fontWeight: '700' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function LoginScreen({ onNavigateSignup }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { showPopup } = usePopup();
  const insets = useSafeAreaInsets();

  const heroAnim = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(50)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const featuresOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(heroAnim, { toValue: 1, tension: 55, friction: 8, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(featuresOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(formSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
        Animated.timing(formOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      showPopup({
        title: 'Missing fields',
        message: 'Please enter your email and password.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }
    setLoading(true);
    try {
      const session = await signIn(email.trim().toLowerCase(), password);
      // Immediately check if the signed-in user is banned
      if (session?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_banned')
          .eq('id', session.user.id)
          .single();
        if (profile?.is_banned) {
          // Sign them back out right away — no access to the app
          await supabase.auth.signOut();
          showPopup({
            title: '🚫 Account Banned',
            message: 'Your account has been permanently banned from UniGram for violating campus community guidelines.\n\nIf you believe this is a mistake, contact campus support.',
            icon: 'ban-outline',
            buttons: [{ text: 'Got it', style: 'destructive', onPress: () => {} }]
          });
          return;
        }
      }
    } catch (err: any) {
      showPopup({
        title: 'Sign in failed',
        message: err.message ?? 'Something went wrong.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      // 'cancelled' means user closed the browser — no alert needed
      if (result === 'cancelled') return;
    } catch (err: any) {
      showPopup({
        title: 'Google sign in failed',
        message: err.message ?? 'Could not sign in with Google.',
        icon: 'logo-google',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setGoogleLoading(false);
    }
  };
  const handleForgotPassword = () => {
    if (!email.trim()) {
      showPopup({
        title: 'Enter your email',
        message: 'Type your email address above, then tap "Forgot password?"',
        icon: 'mail-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }
    showPopup({
      title: 'Reset password',
      message: `Send a reset link to ${email.trim()}?`,
      icon: 'key-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: 'Send',
          onPress: async () => {
            try {
              await sendPasswordReset(email.trim());
              showPopup({
                title: 'Email sent',
                message: 'Check your inbox for a password reset link.',
                icon: 'checkmark-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
            } catch (err: any) {
              showPopup({
                title: 'Error',
                message: err.message ?? 'Could not send reset email.',
                icon: 'alert-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
            }
          },
        },
      ]
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Background blobs */}
      <LinearGradient
        colors={['rgba(99,102,241,0.18)', 'rgba(67,56,202,0.08)', 'transparent']}
        style={[styles.blobTop, { pointerEvents: 'none' }]}
      />
      <LinearGradient
        colors={['transparent', 'rgba(79,70,229,0.1)', 'rgba(109,40,217,0.06)']}
        style={[styles.blobBottom, { pointerEvents: 'none' }]}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero ── */}
          <Animated.View style={[styles.hero, {
            paddingTop: insets.top + 40,
            opacity: heroAnim,
            transform: [{ scale: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
          }]}>
            <AppLogo size={80} />
            <Text style={styles.wordmark}>UniGram</Text>
            <Text style={styles.tagline}>Your campus, connected.</Text>
          </Animated.View>

          {/* ── Features ── */}
          <Animated.View style={{ opacity: featuresOpacity, marginBottom: 36 }}>
            <FeatureStrip />
          </Animated.View>

          {/* ── Form ── */}
          <Animated.View style={[styles.form, {
            opacity: formOpacity,
            transform: [{ translateY: formSlide }],
          }]}>
            <Text style={styles.formTitle}>Welcome back</Text>
            <Text style={styles.formSubtitle}>Sign in to your account</Text>

            <Field
              icon="mail-outline"
              placeholder="University or personal email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              returnKeyType="next"
            />

            <Field
              icon="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              rightNode={
                <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#4b5563" />
                </TouchableOpacity>
              }
            />

            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotWrap}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Sign in button */}
            <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.85} style={styles.primaryWrap}>
              <LinearGradient
                colors={loading ? ['#374151', '#374151'] : ['#818cf8', '#6366f1', '#4338ca']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.primaryBtn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Sign in</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google button */}
            <TouchableOpacity onPress={handleGoogle} disabled={googleLoading} style={styles.googleBtn} activeOpacity={0.85}>
              {googleLoading ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <>
                  <View style={styles.googleIconCircle}>
                    <Text style={styles.googleG}>G</Text>
                  </View>
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* University hint */}
            <View style={styles.uniHint}>
              <Ionicons name="school-outline" size={13} color="#6366f1" />
              <Text style={styles.uniHintText}>
                Use your <Text style={styles.uniHintBold}>.edu email</Text> to unlock campus verification
              </Text>
            </View>

            {/* Switch */}
            <TouchableOpacity onPress={onNavigateSignup} style={styles.switchBtn}>
              <Text style={styles.switchText}>
                New to UniGram?{'  '}
                <Text style={styles.switchLink}>Create account</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050a' },

  blobTop: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 420, zIndex: 0,
  },
  blobBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 300, zIndex: 0,
  },

  scroll: { flexGrow: 1, paddingBottom: 48 },

  hero: { alignItems: 'center', paddingBottom: 8 },
  wordmark: { fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 6 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.38)', letterSpacing: 0.2 },

  form: { paddingHorizontal: 24 },
  formTitle: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 4 },
  formSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.35)', marginBottom: 24 },

  field: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 14, marginBottom: 14, height: 54,
  },
  fieldIcon: { marginRight: 10 },
  fieldInput: { flex: 1, color: '#fff', fontSize: 15 },
  eyeBtn: { padding: 4 },

  forgotWrap: { alignSelf: 'flex-end', marginBottom: 22, marginTop: -4 },
  forgotText: { color: '#818cf8', fontSize: 13, fontWeight: '500' },

  primaryWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 22 },
  primaryBtn: { height: 56, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: { color: 'rgba(255,255,255,0.25)', fontSize: 12, marginHorizontal: 14 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14, height: 56, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  googleIconCircle: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f1f3f4',
  },
  googleG: { fontSize: 14, fontWeight: '800', color: '#4285F4' },
  googleBtnText: { color: '#111', fontSize: 15, fontWeight: '600' },

  uniHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.18)',
    marginBottom: 28,
  },
  uniHintText: { flex: 1, color: 'rgba(255,255,255,0.4)', fontSize: 12, lineHeight: 17 },
  uniHintBold: { color: '#818cf8', fontWeight: '600' },

  switchBtn: { alignItems: 'center' },
  switchText: { color: 'rgba(255,255,255,0.38)', fontSize: 14 },
  switchLink: { color: '#818cf8', fontWeight: '700' },
});
