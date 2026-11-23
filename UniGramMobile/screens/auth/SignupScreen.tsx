import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, Animated, Easing, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signUp, signInWithGoogle, checkUsernameAvailable, detectUniversityFromEmail } from '../../services/auth';
import { usePopup } from '../../context/PopupContext';
import { useHaptics } from '../../hooks/useHaptics';
import {
  AuthBackground, BrandMark, AuthField, PasswordToggle, AuthButton, GoogleButton, OrDivider, InfoPill,
  type AuthInputRef,
} from '../../components/ui/AuthKit';
import { authPalette as P, brand, status } from '../../constants/design';

import { friendlyError } from '../../lib/friendlyError';
interface Props {
  onNavigateLogin: () => void;
  onShowPrivacy: () => void;
  onShowTerms: () => void;
  onShowGuidelines: () => void;
}

// ─── Password strength ─────────────────────────────────────────────────────────
function getStrength(pass: string) {
  if (!pass) return { level: 0, label: '', color: '#333' };
  const checks = [pass.length >= 8, /[A-Z]/.test(pass), /[0-9]/.test(pass), /[^A-Za-z0-9]/.test(pass)];
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
    <View style={s.strengthWrap}>
      <View style={s.strengthBars}>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={[s.strengthBar, { backgroundColor: i <= level ? color : 'rgba(255,255,255,0.1)' }]} />
        ))}
      </View>
      <Text style={[s.strengthLabel, { color }]}>{label}</Text>
    </View>
  );
};

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

type Errors = Partial<Record<'fullName' | 'username' | 'email' | 'password' | 'dob' | 'terms', string>>;

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SignupScreen({ onNavigateLogin, onShowPrivacy, onShowTerms }: Props) {
  const insets = useSafeAreaInsets();
  const { showPopup } = usePopup();
  const { error: hapticError, success: hapticSuccess, selection } = useHaptics();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

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

  const usernameRef = useRef<AuthInputRef>(null);
  const emailRef = useRef<AuthInputRef>(null);
  const passRef = useRef<AuthInputRef>(null);
  const monthRef = useRef<AuthInputRef>(null);
  const yearRef = useRef<AuthInputRef>(null);

  const hero = useRef(new Animated.Value(0)).current;
  const form = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(hero, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(form, { toValue: 1, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const clearError = (k: keyof Errors) => setErrors(e => (e[k] ? { ...e, [k]: undefined } : e));

  // Username availability (debounced)
  useEffect(() => {
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (clean.length < 3) { setUsernameAvailable(null); setUsernameChecking(false); return; }
    setUsernameChecking(true);
    setUsernameAvailable(null);
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    usernameTimer.current = setTimeout(async () => {
      try { setUsernameAvailable(await checkUsernameAvailable(clean)); }
      catch { setUsernameAvailable(null); }
      finally { setUsernameChecking(false); }
    }, 500);
  }, [username]);

  // University email detection (debounced)
  useEffect(() => {
    setDetectedUni(null);
    if (!email.includes('@')) return;
    const domain = email.split('@')[1];
    if (!domain || domain.length < 4) return;
    setUniChecking(true);
    if (uniTimer.current) clearTimeout(uniTimer.current);
    uniTimer.current = setTimeout(async () => {
      try { setDetectedUni(await detectUniversityFromEmail(email)); }
      catch { setDetectedUni(null); }
      finally { setUniChecking(false); }
    }, 700);
  }, [email]);

  const validate = (): { ok: boolean; cleanUsername: string; dobStr: string } => {
    const e: Errors = {};
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');

    if (!fullName.trim()) e.fullName = 'Enter your full name';
    if (!username.trim()) e.username = 'Pick a username';
    else if (cleanUsername.length < 3) e.username = 'At least 3 characters (letters, numbers, . or _)';
    else if (usernameAvailable === false) e.username = 'That username is taken';
    else if (usernameAvailable === null) e.username = usernameChecking ? 'Checking availability…' : 'Couldn’t verify this username — try again in a moment';

    if (!email.trim()) e.email = 'Enter your email';
    else if (!isValidEmail(email)) e.email = 'That doesn’t look like a valid email';

    if (!password) e.password = 'Create a password';
    else if (getStrength(password).level < 2) e.password = 'Use 8+ characters with a mix of letters and numbers';

    // DOB — validate ranges explicitly so JS Date can't silently roll over (Feb 31 → Mar 3)
    const dayInt = parseInt(dobDay, 10);
    const monthInt = parseInt(dobMonth, 10);
    const yearInt = parseInt(dobYear, 10);
    if (!dobDay || !dobMonth || !dobYear) {
      e.dob = 'Enter your date of birth';
    } else if (
      isNaN(dayInt) || isNaN(monthInt) || isNaN(yearInt) ||
      dayInt < 1 || dayInt > 31 || monthInt < 1 || monthInt > 12 ||
      yearInt < 1900 || yearInt > new Date().getFullYear()
    ) {
      e.dob = 'Enter a valid date (DD / MM / YYYY)';
    } else {
      const birth = new Date(yearInt, monthInt - 1, dayInt);
      if (birth.getFullYear() !== yearInt || birth.getMonth() !== monthInt - 1 || birth.getDate() !== dayInt) {
        e.dob = 'That date doesn’t exist — check the day and month';
      } else {
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        if (age < 13) e.dob = 'You must be at least 13 to join UniGram';
      }
    }

    if (!acceptedTerms) e.terms = 'Please accept the Terms and Privacy Policy to continue';

    setErrors(e);
    const dobStr = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;
    return { ok: Object.keys(e).length === 0, cleanUsername, dobStr };
  };

  const handleSignup = async () => {
    setFormError(null);
    const { ok, cleanUsername, dobStr } = validate();
    if (!ok) { hapticError(); return; }
    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, cleanUsername, fullName.trim(), dobStr);
      hapticSuccess();
      showPopup({
        title: 'Almost there!',
        message: 'Check your email to confirm your account, then sign in.',
        icon: 'mail-open-outline',
        buttons: [{ text: 'OK', onPress: onNavigateLogin }],
      });
    } catch (err: any) {
      hapticError();
      setFormError(friendlyError(err, 'Something went wrong. Please try again.'));
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

  const usernameBorder = usernameAvailable === true ? status.success : undefined;
  const usernameRight = usernameChecking
    ? <ActivityIndicator size="small" color={P.textMuted} />
    : usernameAvailable === true
      ? <Ionicons name="checkmark-circle" size={20} color={status.success} />
      : usernameAvailable === false
        ? <Ionicons name="close-circle" size={20} color={status.danger} />
        : null;

  const showEduPrompt = !email.includes('@');
  const showPersonalHint = email.includes('@') && !uniChecking && !detectedUni && (email.split('@')[1]?.length ?? 0) > 3;

  return (
    <AuthBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[s.hero, {
            opacity: hero,
            transform: [{ translateY: hero.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
          }]}>
            <BrandMark size={64} tagline="Join your campus community" />
          </Animated.View>

          <Animated.View style={{
            opacity: form,
            transform: [{ translateY: form.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
          }}>
            <Text style={s.title}>Create your account</Text>
            <Text style={s.subtitle}>Free, and it takes less than a minute.</Text>

            {formError ? (
              <View style={s.errorBanner} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={16} color={status.danger} />
                <Text style={s.errorBannerText}>{formError}</Text>
              </View>
            ) : null}

            <AuthField
              icon="person-outline"
              placeholder="Full name"
              value={fullName}
              onChangeText={(t) => { setFullName(t); clearError('fullName'); }}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => usernameRef.current?.focus()}
              error={errors.fullName}
            />

            <AuthField
              ref={usernameRef}
              icon="at-outline"
              placeholder="Username"
              value={username}
              onChangeText={(t) => { setUsername(t); clearError('username'); }}
              borderOverride={usernameBorder}
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              rightNode={usernameRight}
              error={errors.username ?? (usernameAvailable === false ? 'That username is taken' : null)}
              hint={usernameAvailable === true ? 'Username is available' : null}
            />

            {showEduPrompt && (
              <View style={s.eduPrompt}>
                <LinearGradient
                  colors={['rgba(99,102,241,0.18)', 'rgba(217,70,239,0.08)']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.eduPromptInner}
                >
                  <View style={s.eduBadge}><Text style={s.eduBadgeText}>.edu</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.eduPromptTitle}>Use your university email</Text>
                    <Text style={s.eduPromptBody}>Get a verified campus badge and unlock student-only features.</Text>
                  </View>
                </LinearGradient>
              </View>
            )}

            <AuthField
              ref={emailRef}
              icon="mail-outline"
              placeholder="University or personal email"
              value={email}
              onChangeText={(t) => { setEmail(t); clearError('email'); }}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passRef.current?.focus()}
              rightNode={uniChecking ? <ActivityIndicator size="small" color={P.textMuted} /> : null}
              error={errors.email}
            />

            {detectedUni && (
              <View style={s.uniDetected}>
                <View style={s.uniIcon}><Ionicons name="school" size={16} color={status.success} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.uniTitle}>University email detected</Text>
                  <Text style={s.uniName} numberOfLines={1}>{detectedUni}</Text>
                </View>
                <View style={s.eligible}>
                  <Ionicons name="checkmark-circle" size={12} color={status.success} />
                  <Text style={s.eligibleText}>Eligible</Text>
                </View>
              </View>
            )}
            {showPersonalHint && (
              <View style={{ marginBottom: 14 }}>
                <InfoPill icon="information-circle-outline">
                  Personal email works too — you can verify with your school email later.
                </InfoPill>
              </View>
            )}

            <AuthField
              ref={passRef}
              icon="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={(t) => { setPassword(t); clearError('password'); }}
              secureTextEntry={!showPass}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              onSubmitEditing={() => undefined}
              error={errors.password}
              rightNode={<PasswordToggle shown={showPass} onToggle={() => setShowPass(v => !v)} />}
            />
            <StrengthBar password={password} />

            <Text style={s.sectionLabel}>Date of birth <Text style={s.sectionLabelMuted}>· must be 13+</Text></Text>
            <View style={s.dobRow}>
              <AuthField
                style={{ flex: 1 }}
                icon="calendar-outline"
                placeholder="DD"
                value={dobDay}
                maxLength={2}
                onChangeText={(t) => {
                  const v = t.replace(/[^0-9]/g, '').slice(0, 2);
                  setDobDay(v); clearError('dob');
                  if (v.length === 2) monthRef.current?.focus();
                }}
                keyboardType="number-pad"
                borderOverride={errors.dob ? status.danger : undefined}
              />
              <AuthField
                ref={monthRef}
                style={{ flex: 1 }}
                icon="calendar-outline"
                placeholder="MM"
                value={dobMonth}
                maxLength={2}
                onChangeText={(t) => {
                  const v = t.replace(/[^0-9]/g, '').slice(0, 2);
                  setDobMonth(v); clearError('dob');
                  if (v.length === 2) yearRef.current?.focus();
                }}
                keyboardType="number-pad"
                borderOverride={errors.dob ? status.danger : undefined}
              />
              <AuthField
                ref={yearRef}
                style={{ flex: 1.3 }}
                icon="calendar-outline"
                placeholder="YYYY"
                value={dobYear}
                maxLength={4}
                onChangeText={(t) => { setDobYear(t.replace(/[^0-9]/g, '').slice(0, 4)); clearError('dob'); }}
                keyboardType="number-pad"
                borderOverride={errors.dob ? status.danger : undefined}
              />
            </View>
            {errors.dob ? (
              <View style={[s.msgRow, { marginTop: -6 }]}>
                <Ionicons name="alert-circle" size={13} color={status.danger} />
                <Text style={s.msgError}>{errors.dob}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={s.consentRow}
              onPress={() => { selection(); setAcceptedTerms(v => !v); clearError('terms'); }}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms }}
            >
              <View style={[s.checkbox, acceptedTerms && s.checkboxOn, !!errors.terms && !acceptedTerms && { borderColor: status.danger }]}>
                {acceptedTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={s.consentText}>
                I agree to the{' '}
                <Text style={s.legalLink} onPress={onShowTerms}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={s.legalLink} onPress={onShowPrivacy}>Privacy Policy</Text>
              </Text>
            </TouchableOpacity>
            {errors.terms ? (
              <View style={[s.msgRow, { marginTop: -10, marginBottom: 12 }]}>
                <Ionicons name="alert-circle" size={13} color={status.danger} />
                <Text style={s.msgError}>{errors.terms}</Text>
              </View>
            ) : null}

            <AuthButton label="Create account" onPress={handleSignup} loading={loading} />

            <OrDivider />

            <GoogleButton onPress={handleGoogle} loading={googleLoading} label="Sign up with Google" />

            <TouchableOpacity onPress={onNavigateLogin} style={s.switchBtn} accessibilityRole="button">
              <Text style={s.switchText}>
                Already have an account?  <Text style={s.switchLink}>Sign in</Text>
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
  hero: { alignItems: 'center', marginBottom: 32 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: P.textSub, fontSize: 14.5, marginTop: 4, marginBottom: 22 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14,
    backgroundColor: 'rgba(255,48,64,0.10)', borderColor: 'rgba(255,48,64,0.3)',
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11,
  },
  errorBannerText: { color: '#ff7a85', fontSize: 13.5, fontWeight: '500', flex: 1, lineHeight: 18 },

  eduPrompt: { marginBottom: 14, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(139,92,246,0.28)' },
  eduPromptInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  eduBadge: {
    backgroundColor: 'rgba(139,92,246,0.22)', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.45)',
  },
  eduBadgeText: { color: '#c4b5fd', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  eduPromptTitle: { color: '#e9e5ff', fontSize: 13.5, fontWeight: '700', marginBottom: 2 },
  eduPromptBody: { color: P.textMuted, fontSize: 12, lineHeight: 16.5 },

  uniDetected: {
    flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 14, padding: 12,
    backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(34,197,94,0.28)',
  },
  uniIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(34,197,94,0.16)', alignItems: 'center', justifyContent: 'center' },
  uniTitle: { color: P.textMuted, fontSize: 11, fontWeight: '500' },
  uniName: { color: status.success, fontSize: 13.5, fontWeight: '700', marginTop: 1 },
  eligible: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34,197,94,0.16)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  eligibleText: { color: status.success, fontSize: 11, fontWeight: '700' },

  strengthWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -4, marginBottom: 18, paddingHorizontal: 2 },
  strengthBars: { flexDirection: 'row', gap: 5, flex: 1 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: '700', width: 46, textAlign: 'right' },

  sectionLabel: { color: P.textSub, fontSize: 13, fontWeight: '700', marginBottom: 8, marginLeft: 2 },
  sectionLabelMuted: { color: P.textMuted, fontWeight: '500' },
  dobRow: { flexDirection: 'row', gap: 10 },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10, paddingLeft: 4 },
  msgError: { color: status.danger, fontSize: 12.5, fontWeight: '500' },

  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 18 },
  checkbox: {
    width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  checkboxOn: { backgroundColor: brand.violet, borderColor: brand.violet },
  consentText: { flex: 1, color: P.textSub, fontSize: 13, lineHeight: 19 },
  legalLink: { color: P.link, fontWeight: '700' },

  switchBtn: { alignItems: 'center', marginTop: 22, paddingVertical: 8 },
  switchText: { color: P.textSub, fontSize: 14.5 },
  switchLink: { color: '#fff', fontWeight: '800' },
});
