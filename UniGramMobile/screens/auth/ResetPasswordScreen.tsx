import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { usePopup } from '../../context/PopupContext';
import { useHaptics } from '../../hooks/useHaptics';
import { AuthBackground, AuthField, PasswordToggle, AuthButton, type AuthInputRef } from '../../components/ui/AuthKit';
import { authPalette as P, brand, status, shadow } from '../../constants/design';

import { friendlyError } from '../../lib/friendlyError';
interface Props {
  onDone: () => void;
}

export default function ResetPasswordScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { showPopup } = usePopup();
  const { error: hapticError, success: hapticSuccess } = useHaptics();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const confirmRef = useRef<AuthInputRef>(null);

  const rules = [
    { ok: password.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(password) && /[0-9]/.test(password), label: 'Letters and numbers' },
    { ok: !!confirm && password === confirm, label: 'Passwords match' },
  ];

  const handleReset = async () => {
    setFormError(null);
    let ok = true;
    if (password.length < 8) { setPassError('Password must be at least 8 characters'); ok = false; } else setPassError(null);
    if (!confirm) { setConfirmError('Confirm your new password'); ok = false; }
    else if (password !== confirm) { setConfirmError('Passwords don’t match'); ok = false; }
    else setConfirmError(null);
    if (!ok) { hapticError(); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      hapticSuccess();
      showPopup({
        title: 'Password updated',
        message: 'Your password has been changed successfully.',
        icon: 'checkmark-circle-outline',
        buttons: [{ text: 'Sign in', onPress: onDone }],
      });
    } catch (err: any) {
      hapticError();
      setFormError(friendlyError(err, 'Could not update password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[s.iconWrap, shadow.glow(brand.violet)]}>
            <LinearGradient
              colors={brand.gradient as any}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.iconCircle}
            >
              <Ionicons name="lock-closed" size={32} color="#fff" />
            </LinearGradient>
          </View>

          <Text style={s.title}>Set a new password</Text>
          <Text style={s.subtitle}>Choose a strong password you don’t use anywhere else.</Text>

          {formError ? (
            <View style={s.errorBanner} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={16} color={status.danger} />
              <Text style={s.errorBannerText}>{formError}</Text>
            </View>
          ) : null}

          <AuthField
            icon="lock-closed-outline"
            placeholder="New password"
            value={password}
            onChangeText={(t) => { setPassword(t); if (passError) setPassError(null); }}
            secureTextEntry={!showPass}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            error={passError}
            rightNode={<PasswordToggle shown={showPass} onToggle={() => setShowPass(v => !v)} />}
          />
          <AuthField
            ref={confirmRef}
            icon="shield-checkmark-outline"
            placeholder="Confirm new password"
            value={confirm}
            onChangeText={(t) => { setConfirm(t); if (confirmError) setConfirmError(null); }}
            secureTextEntry={!showConfirm}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleReset}
            error={confirmError}
            rightNode={<PasswordToggle shown={showConfirm} onToggle={() => setShowConfirm(v => !v)} />}
          />

          <View style={s.rules}>
            {rules.map(r => (
              <View key={r.label} style={s.ruleRow}>
                <Ionicons
                  name={r.ok ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={r.ok ? status.success : P.textMuted}
                />
                <Text style={[s.ruleText, r.ok && { color: P.textSub }]}>{r.label}</Text>
              </View>
            ))}
          </View>

          <AuthButton label="Update password" onPress={handleReset} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthBackground>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  iconWrap: { alignSelf: 'center', width: 76, height: 76, borderRadius: 26, marginBottom: 28 },
  iconCircle: { flex: 1, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.7, textAlign: 'center' },
  subtitle: { color: P.textSub, fontSize: 14.5, lineHeight: 20, textAlign: 'center', marginTop: 6, marginBottom: 28, paddingHorizontal: 12 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14,
    backgroundColor: 'rgba(255,48,64,0.10)', borderColor: 'rgba(255,48,64,0.3)',
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11,
  },
  errorBannerText: { color: '#ff7a85', fontSize: 13.5, fontWeight: '500', flex: 1, lineHeight: 18 },

  rules: { gap: 9, marginTop: 4, marginBottom: 24, paddingHorizontal: 4 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ruleText: { color: P.textMuted, fontSize: 13 },
});
