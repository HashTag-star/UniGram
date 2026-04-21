import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Animated, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { usePopup } from '../../context/PopupContext';

interface Props {
  onDone: () => void;
}

const Field: React.FC<{
  icon: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  rightNode?: React.ReactNode;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
}> = ({ icon, placeholder, value, onChangeText, secureTextEntry, rightNode, returnKeyType, onSubmitEditing }) => {
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
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
      {rightNode}
    </Animated.View>
  );
};

export default function ResetPasswordScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showPopup } = usePopup();

  const handleReset = async () => {
    if (!password || !confirm) {
      showPopup({
        title: 'Missing fields',
        message: 'Please fill in both password fields.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }
    if (password.length < 8) {
      showPopup({
        title: 'Too short',
        message: 'Password must be at least 8 characters.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }
    if (password !== confirm) {
      showPopup({
        title: 'Mismatch',
        message: 'Passwords do not match.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showPopup({
        title: 'Password updated',
        message: 'Your password has been changed successfully.',
        icon: 'checkmark-circle-outline',
        buttons: [{ text: 'Sign in', onPress: onDone }]
      });
    } catch (err: any) {
      showPopup({
        title: 'Error',
        message: err.message ?? 'Could not update password.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

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
          {/* Icon */}
          <View style={[styles.iconWrap, { marginTop: insets.top + 24 }]}>
            <LinearGradient
              colors={['#818cf8', '#6366f1', '#4338ca']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.iconCircle}
            >
              <Ionicons name="lock-closed" size={34} color="#fff" />
            </LinearGradient>
          </View>

          <Text style={styles.title}>Set new password</Text>
          <Text style={styles.subtitle}>Choose a strong password for your UniGram account.</Text>

          <Field
            icon="lock-closed-outline"
            placeholder="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPass}
            returnKeyType="next"
            rightNode={
              <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#4b5563" />
              </TouchableOpacity>
            }
          />

          <Field
            icon="shield-checkmark-outline"
            placeholder="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showConfirm}
            returnKeyType="done"
            onSubmitEditing={handleReset}
            rightNode={
              <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color="#4b5563" />
              </TouchableOpacity>
            }
          />

          {/* Strength hint */}
          <View style={styles.hint}>
            <Ionicons name="information-circle-outline" size={13} color="#6366f1" />
            <Text style={styles.hintText}>At least 8 characters recommended.</Text>
          </View>

          <TouchableOpacity onPress={handleReset} disabled={loading} activeOpacity={0.85} style={styles.primaryWrap}>
            <LinearGradient
              colors={loading ? ['#374151', '#374151'] : ['#818cf8', '#6366f1', '#4338ca']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.primaryBtn}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Update password</Text>
              }
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050a' },
  blobTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 420, zIndex: 0 },
  blobBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 300, zIndex: 0 },

  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 48 },

  iconWrap: { alignItems: 'center', marginBottom: 28 },
  iconCircle: {
    width: 88, height: 88, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7, shadowRadius: 28, elevation: 28,
  },

  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.38)', marginBottom: 32, lineHeight: 20 },

  field: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 14, marginBottom: 14, height: 54,
  },
  fieldIcon: { marginRight: 10 },
  fieldInput: { flex: 1, color: '#fff', fontSize: 15 },
  eyeBtn: { padding: 4 },

  hint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.18)',
    marginBottom: 28,
  },
  hintText: { flex: 1, color: 'rgba(255,255,255,0.4)', fontSize: 12, lineHeight: 17 },

  primaryWrap: { borderRadius: 14, overflow: 'hidden' },
  primaryBtn: { height: 56, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
