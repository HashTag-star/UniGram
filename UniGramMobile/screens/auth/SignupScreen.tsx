import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Animated, StatusBar,
  GestureResponderEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { signUp, signInWithGoogle, checkUsernameAvailable, detectUniversityFromEmail } from '../../services/auth';

interface Props {
  onNavigateLogin: () => void;
  onShowPrivacy: () => void;
  onShowTerms: () => void;
  onShowGuidelines: () => void;
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
const AppLogo: React.FC<{ size?: number }> = ({ size = 68 }) => (
  <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
    <View style={{
      position: 'absolute',
      width: size * 1.28, height: size * 1.28, borderRadius: size * 0.64,
      borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)',
      backgroundColor: 'rgba(79,70,229,0.05)',
    }} />
    <LinearGradient
      colors={['#818cf8', '#6366f1', '#4338ca']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{
        width: size, height: size, borderRadius: size * 0.3,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#6366f1', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.65, shadowRadius: 22, elevation: 22,
      }}
    >
      <Text style={{ fontSize: size * 0.54, fontWeight: '900', color: '#fff', letterSpacing: -2 }}>U</Text>
    </LinearGradient>
  </View>
);

// ─── Password strength ─────────────────────────────────────────────────────────
function getStrength(pass: string) {
  if (!pass) return { level: 0, label: '', color: '#333' };
  const checks = [
    pass.length >= 8,
    /[A-Z]/.test(pass),
    /[0-9]/.test(pass),
    /[^A-Za-z0-9]/.test(pass),
  ];
  const score = checks.filter(Boolean).length;
  if (score <= 1) return { level: 1, label: 'Weak', color: '#ef4444' };
  if (score === 2) return { level: 2, label: 'Fair', color: '#f59e0b' };
  if (score === 3) return { level: 3, label: 'Good', color: '#3b82f6' };
  return { level: 4, label: 'Strong', color: '#22c55e' };
}

const StrengthBar: React.FC<{ password: string }> = ({ password }) => {
  const { level, label, color } = getStrength(password);
  if (!password) return null;
  return (
    <View style={styles.strengthWrap}>
      <View style={styles.strengthBars}>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={[styles.strengthBar, { backgroundColor: i <= level ? color : 'rgba(255,255,255,0.08)' }]} />
        ))}
      </View>
      <Text style={[styles.strengthLabel, { color }]}>{label}</Text>
    </View>
  );
};

// ─── Field ─────────────────────────────────────────────────────────────────────
const Field: React.FC<{
  icon: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  rightNode?: React.ReactNode;
  borderOverride?: string;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
}> = ({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, rightNode, borderOverride, returnKeyType, onSubmitEditing }) => {
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

  const animBorder = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', 'rgba(129,140,248,0.7)'],
  });
  const animBg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.05)', 'rgba(99,102,241,0.08)'],
  });

  return (
    <Animated.View style={[
      styles.field,
      { borderColor: borderOverride ?? animBorder, backgroundColor: animBg },
    ]}>
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

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SignupScreen({ 
  onNavigateLogin, onShowPrivacy, onShowTerms, onShowGuidelines 
}: Props) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [detectedUni, setDetectedUni] = useState<string | null>(null);
  const [uniChecking, setUniChecking] = useState(false);
  const uniTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const heroAnim = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(50)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(heroAnim, { toValue: 1, tension: 55, friction: 8, useNativeDriver: true }),
      Animated.delay(120),
      Animated.parallel([
        Animated.spring(formSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
        Animated.timing(formOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  // Username availability debounce
  useEffect(() => {
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (clean.length < 3) { setUsernameAvailable(null); return; }
    setUsernameChecking(true);
    setUsernameAvailable(null);
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    usernameTimer.current = setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(clean);
        setUsernameAvailable(available);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 500);
  }, [username]);

  // University email detection
  useEffect(() => {
    setDetectedUni(null);
    if (!email.includes('@')) return;
    const domain = email.split('@')[1];
    if (!domain || domain.length < 4) return;
    setUniChecking(true);
    if (uniTimer.current) clearTimeout(uniTimer.current);
    uniTimer.current = setTimeout(async () => {
      try {
        const uni = await detectUniversityFromEmail(email);
        setDetectedUni(uni);
      } catch {
        setDetectedUni(null);
      } finally {
        setUniChecking(false);
      }
    }, 700);
  }, [email]);

  const handleSignup = async () => {
    if (!fullName.trim() || !username.trim() || !email.trim() || !password || !dobDay || !dobMonth || !dobYear) {
      Alert.alert('Missing fields', 'Please fill in all fields, including your date of birth.');
      return;
    }

    // Age validation (13+)
    const birthDate = new Date(parseInt(dobYear), parseInt(dobMonth) - 1, parseInt(dobDay));
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;

    if (isNaN(age) || age < 13) {
      Alert.alert('Ineligible', 'You must be at least 13 years old to join UniGram.');
      return;
    }

    // Email validation (.edu.gh)
    if (!email.trim().toLowerCase().endsWith('.edu.gh')) {
      Alert.alert('University Email Required', 'UniGram is currently exclusive to students with a .edu.gh email address.');
      return;
    }

    if (!acceptedTerms) {
      Alert.alert('Terms of Service', 'You must agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    if (getStrength(password).level < 2) {
      Alert.alert('Weak password', 'Use at least 8 characters with a mix of letters and numbers.');
      return;
    }
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (cleanUsername.length < 3) {
      Alert.alert('Invalid username', 'Username must be at least 3 characters (letters, numbers, _ or .)');
      return;
    }
    if (usernameAvailable === false) {
      Alert.alert('Username taken', 'Please choose a different username.');
      return;
    }
    if (usernameAvailable === null && usernameChecking) {
      Alert.alert('Please wait', 'Checking username availability...');
      return;
    }
    setLoading(true);
    try {
      const dobStr = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;
      await signUp(email.trim().toLowerCase(), password, cleanUsername, fullName.trim(), dobStr);
      Alert.alert(
        'Almost there!',
        'Check your email to confirm your account, then sign in.',
        [{ text: 'OK', onPress: onNavigateLogin }]
      );
    } catch (err: any) {
      Alert.alert('Sign up failed', err.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result === 'cancelled') return;
    } catch (err: any) {
      Alert.alert('Google sign in failed', err.message ?? 'Could not sign in with Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const usernameBorder = usernameAvailable === true
    ? '#22c55e'
    : usernameAvailable === false
      ? '#ef4444'
      : undefined;

  const usernameRight = usernameChecking
    ? <ActivityIndicator size="small" color="#6b7280" />
    : usernameAvailable === true
      ? <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
      : usernameAvailable === false
        ? <Ionicons name="close-circle" size={18} color="#ef4444" />
        : null;

  const showEduPrompt = !email.includes('@');
  const showPersonalHint = email.includes('@') && !uniChecking && !detectedUni && (email.split('@')[1]?.length ?? 0) > 3;



  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Background blobs */}
      <LinearGradient
        colors={['rgba(99,102,241,0.16)', 'rgba(67,56,202,0.07)', 'transparent']}
        style={[styles.blobTop, { pointerEvents: 'none' }]}
      />
      <LinearGradient
        colors={['transparent', 'rgba(79,70,229,0.09)', 'rgba(109,40,217,0.05)']}
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
            opacity: heroAnim,
            transform: [{ scale: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
          }]}>
            <AppLogo size={68} />
            <Text style={styles.wordmark}>UniGram</Text>
            <Text style={styles.tagline}>Join your campus community</Text>
          </Animated.View>

          {/* ── Form ── */}
          <Animated.View style={[styles.form, {
            opacity: formOpacity,
            transform: [{ translateY: formSlide }],
          }]}>
            <Text style={styles.formTitle}>Create account</Text>
            <Text style={styles.formSubtitle}>It's free and takes less than a minute</Text>

            {/* Full name */}
            <Field
              icon="person-outline"
              placeholder="Full name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              returnKeyType="next"
            />

            {/* Username */}
            <Field
              icon="at-outline"
              placeholder="Username"
              value={username}
              onChangeText={setUsername}
              borderOverride={usernameBorder}
              returnKeyType="next"
              rightNode={usernameRight}
            />
            {usernameAvailable === false && (
              <Text style={styles.hintError}>Username already taken</Text>
            )}
            {usernameAvailable === true && (
              <Text style={styles.hintOk}>Username available</Text>
            )}

            {/* University email prompt */}
            {showEduPrompt && (
              <View style={styles.eduPrompt}>
                <LinearGradient
                  colors={['rgba(99,102,241,0.15)', 'rgba(79,70,229,0.08)']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.eduPromptInner}
                >
                  <View style={styles.eduBadge}>
                    <Text style={styles.eduBadgeText}>.edu</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eduPromptTitle}>Use your university email</Text>
                    <Text style={styles.eduPromptBody}>
                      Get a verified campus badge and unlock exclusive student features
                    </Text>
                  </View>
                </LinearGradient>
              </View>
            )}

            {/* Email */}
            <Field
              icon="mail-outline"
              placeholder="University or personal email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              returnKeyType="next"
              rightNode={uniChecking ? <ActivityIndicator size="small" color="#6b7280" /> : null}
            />

            {/* University detected */}
            {detectedUni && (
              <View style={styles.uniDetectedBadge}>
                <View style={styles.uniIconWrap}>
                  <Ionicons name="school" size={15} color="#22c55e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uniDetectedTitle}>University email detected</Text>
                  <Text style={styles.uniDetectedName} numberOfLines={1}>{detectedUni}</Text>
                </View>
                <View style={styles.verifiedPill}>
                  <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
                  <Text style={styles.verifiedPillText}>Eligible</Text>
                </View>
              </View>
            )}

            {showPersonalHint && (
              <View style={styles.personalHint}>
                <Ionicons name="information-circle-outline" size={13} color="#6366f1" />
                <Text style={styles.personalHintText}>
                  Personal email — switch to your .edu for campus verification
                </Text>
              </View>
            )}

            {/* Password */}
            <Field
              icon="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              returnKeyType="done"
              onSubmitEditing={handleSignup}
              rightNode={
                <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#4b5563" />
                </TouchableOpacity>
              }
            />
            <StrengthBar password={password} />

            {/* Date of Birth */}
            <Text style={styles.sectionLabel}>Date of Birth (13+ only)</Text>
            <View style={styles.dobRow}>
              <View style={{ flex: 1.5 }}>
                <Field
                  icon="calendar-outline"
                  placeholder="DD"
                  value={dobDay}
                  onChangeText={t => setDobDay(t.replace(/[^0-9]/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Field
                  icon="calendar-outline"
                  placeholder="MM"
                  value={dobMonth}
                  onChangeText={t => setDobMonth(t.replace(/[^0-9]/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 2 }}>
                <Field
                  icon="calendar-outline"
                  placeholder="YYYY"
                  value={dobYear}
                  onChangeText={t => setDobYear(t.replace(/[^0-9]/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* Consent */}
            <TouchableOpacity 
              style={styles.consentRow} 
              onPress={() => setAcceptedTerms(!acceptedTerms)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, acceptedTerms && styles.checkboxActive]}>
                {acceptedTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={styles.consentText}>
                I agree to the{' '}
                <Text style={styles.legalLink} onPress={onShowTerms}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.legalLink} onPress={onShowPrivacy}>Privacy Policy</Text>
              </Text>
            </TouchableOpacity>

            {/* Create account button */}
            <TouchableOpacity onPress={handleSignup} disabled={loading} activeOpacity={0.85} style={styles.primaryWrap}>
              <LinearGradient
                colors={loading ? ['#374151', '#374151'] : ['#818cf8', '#6366f1', '#4338ca']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.primaryBtn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Create account</Text>
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

            {/* Terms */}
            <Text style={styles.terms}>
              By creating an account you agree to our{' '}
              <Text style={styles.termsLink} onPress={onShowTerms}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink} onPress={onShowPrivacy}>Privacy Policy</Text>
            </Text>

            {/* Switch to login */}
            <TouchableOpacity onPress={onNavigateLogin} style={styles.switchBtn}>
              <Text style={styles.switchText}>
                Already have an account?{'  '}
                <Text style={styles.switchLink}>Sign in</Text>
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
    height: 380, zIndex: 0,
  },
  blobBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 280, zIndex: 0,
  },

  scroll: { flexGrow: 1, paddingBottom: 48 },

  hero: { alignItems: 'center', paddingTop: 60, paddingBottom: 28 },
  wordmark: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 5 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.38)', letterSpacing: 0.2 },

  form: { paddingHorizontal: 24 },
  formTitle: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 4 },
  formSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.35)', marginBottom: 22 },

  field: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 14, marginBottom: 12, height: 54,
  },
  fieldIcon: { marginRight: 10 },
  fieldInput: { flex: 1, color: '#fff', fontSize: 15 },
  eyeBtn: { padding: 4 },

  hintError: { color: '#ef4444', fontSize: 11, marginTop: -8, marginBottom: 8, marginLeft: 4 },
  hintOk: { color: '#22c55e', fontSize: 11, marginTop: -8, marginBottom: 8, marginLeft: 4 },

  // Edu prompt (shows before typing email)
  eduPrompt: { marginBottom: 12, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)' },
  eduPromptInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  eduBadge: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)',
  },
  eduBadgeText: { color: '#818cf8', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  eduPromptTitle: { color: '#c7d2fe', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  eduPromptBody: { color: 'rgba(255,255,255,0.35)', fontSize: 11, lineHeight: 16 },

  // University detected badge
  uniDetectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
    marginTop: -8, marginBottom: 12,
  },
  uniIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  uniDetectedTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '500', marginBottom: 1 },
  uniDetectedName: { color: '#22c55e', fontSize: 13, fontWeight: '600' },
  verifiedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4,
  },
  verifiedPillText: { color: '#22c55e', fontSize: 10, fontWeight: '700' },

  // Personal email hint
  personalHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: -8, marginBottom: 10, paddingHorizontal: 2,
  },
  personalHintText: { flex: 1, color: 'rgba(255,255,255,0.3)', fontSize: 11, lineHeight: 16 },

  // Strength meter
  strengthWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -8, marginBottom: 14 },
  strengthBars: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '600', width: 42 },

  // Primary button
  primaryWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 22, marginTop: 6 },
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

  terms: { fontSize: 11, color: 'rgba(255,255,255,0.22)', textAlign: 'center', lineHeight: 18, marginBottom: 22 },
  termsLink: { color: 'rgba(129,140,248,0.65)' },

  switchBtn: { alignItems: 'center' },
  switchText: { color: 'rgba(255,255,255,0.38)', fontSize: 14 },
  switchLink: { color: '#818cf8', fontWeight: '700' },

  sectionLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 4, marginLeft: 2 },
  dobRow: { flexDirection: 'row', gap: 10, width: '100%' },
  
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 20 },
  checkbox: { 
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  checkboxActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  consentText: { flex: 1, color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18 },
  legalLink: { color: '#818cf8', fontWeight: 'bold' },
});
