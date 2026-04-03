import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { signUp } from '../../services/auth';

interface Props {
  onNavigateLogin: () => void;
}

export default function SignupScreen({ onNavigateLogin }: Props) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!fullName.trim() || !username.trim() || !email.trim() || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      Alert.alert('Weak password', 'Password must contain at least one uppercase letter and one number.');
      return;
    }
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (cleanUsername.length < 3) {
      Alert.alert('Invalid username', 'Username must be at least 3 characters (letters, numbers, _ or .)');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, cleanUsername, fullName.trim());
      Alert.alert('Almost there!', 'Check your email to confirm your account, then sign in.');
      onNavigateLogin();
    } catch (err: any) {
      Alert.alert('Signup failed', err.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#4f46e5', '#818cf8']} style={styles.logoWrap}>
          <Text style={styles.logoText}>UniGram</Text>
          <Text style={styles.tagline}>Join your campus community</Text>
        </LinearGradient>

        <View style={styles.form}>
          <Text style={styles.title}>Create account</Text>

          {[
            { placeholder: 'Full name', value: fullName, onChange: setFullName, icon: 'person-outline', cap: 'words' as any },
            { placeholder: 'Username', value: username, onChange: setUsername, icon: 'at-outline', cap: 'none' as any },
            { placeholder: 'Email', value: email, onChange: setEmail, icon: 'mail-outline', cap: 'none' as any, keyboard: 'email-address' as any },
          ].map(({ placeholder, value, onChange, icon, cap, keyboard }) => (
            <View key={placeholder} style={styles.inputWrap}>
              <Ionicons name={icon as any} size={18} color="#6b7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor="#6b7280"
                value={value}
                onChangeText={onChange}
                autoCapitalize={cap}
                keyboardType={keyboard}
              />
            </View>
          ))}

          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Password (8+ chars, uppercase & number)"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.btn} onPress={handleSignup} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.switchBtn} onPress={onNavigateLogin}>
            <Text style={styles.switchText}>
              Already have an account? <Text style={styles.switchLink}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { flexGrow: 1 },
  logoWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  logoText: { fontSize: 42, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 6 },
  form: { flex: 1, padding: 24, paddingTop: 32 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 24 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111', borderRadius: 12,
    borderWidth: 1, borderColor: '#222',
    paddingHorizontal: 14, marginBottom: 14, height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#fff', fontSize: 15 },
  eyeBtn: { padding: 4 },
  btn: {
    backgroundColor: '#4f46e5', borderRadius: 12,
    height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchBtn: { alignItems: 'center', marginTop: 20 },
  switchText: { color: '#9ca3af', fontSize: 14 },
  switchLink: { color: '#818cf8', fontWeight: '600' },
});
