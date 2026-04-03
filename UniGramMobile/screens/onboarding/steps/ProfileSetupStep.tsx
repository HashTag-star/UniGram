import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Animated, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { updateProfileSetup } from '../../../services/onboarding';
import { uploadAvatar } from '../../../services/profiles';
import { useHaptics } from '../../../hooks/useHaptics';

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'PhD', 'Faculty'];

interface Props {
  userId: string;
  onNext: () => void;
  onBack: () => void;
}

export function ProfileSetupStep({ userId, onNext, onBack }: Props) {
  const [university, setUniversity] = useState('');
  const [major, setMajor] = useState('');
  const [year, setYear] = useState('');
  const [bio, setBio] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { light, success } = useHaptics();

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const handleNext = async () => {
    await light();
    if (!university.trim() || !major.trim()) {
      Alert.alert('Almost there!', 'Please fill in your university and major.');
      return;
    }
    setLoading(true);
    try {
      await updateProfileSetup(userId, {
        university: university.trim(),
        major: major.trim(),
        year,
        bio: bio.trim(),
        pronouns: pronouns.trim(),
      });
      await success();
      onNext();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <View>
          <Text style={styles.stepLabel}>Step 2 of 5</Text>
          <Text style={styles.title}>Set up your profile</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>Tell your campus community about yourself.</Text>

        {[
          { label: 'University *', value: university, onChange: setUniversity, placeholder: 'e.g. Stanford University', icon: 'school-outline' },
          { label: 'Major *', value: major, onChange: setMajor, placeholder: 'e.g. Computer Science', icon: 'book-outline' },
          { label: 'Pronouns', value: pronouns, onChange: setPronouns, placeholder: 'e.g. he/him, she/her, they/them', icon: 'person-outline' },
        ].map(({ label, value, onChange, placeholder, icon }) => (
          <View key={label} style={styles.inputGroup}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputWrap}>
              <Ionicons name={icon as any} size={16} color="#555" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor="#444"
              />
            </View>
          </View>
        ))}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Year</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {YEARS.map(y => (
              <TouchableOpacity
                key={y}
                style={[styles.chip, year === y && styles.chipActive]}
                onPress={() => { setYear(y); light(); }}
              >
                <Text style={[styles.chipText, year === y && styles.chipTextActive]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell people about yourself..."
            placeholderTextColor="#444"
            multiline
            maxLength={150}
          />
          <Text style={styles.charCount}>{bio.length}/150</Text>
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        <TouchableOpacity style={styles.btn} onPress={handleNext} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Text style={styles.btnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={onNext}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 16, paddingBottom: 8 },
  backBtn: { padding: 4, marginBottom: 2 },
  stepLabel: { fontSize: 11, color: '#4f46e5', fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', marginTop: 2 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 24, lineHeight: 20 },
  scroll: { paddingBottom: 20 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#1e1e1e', paddingHorizontal: 14, height: 50 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#fff', fontSize: 15 },
  bioInput: { height: 90, textAlignVertical: 'top', paddingTop: 12, backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#1e1e1e', paddingHorizontal: 14, color: '#fff', fontSize: 15 },
  charCount: { fontSize: 10, color: '#444', textAlign: 'right', marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' },
  chipActive: { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: '#4f46e5' },
  chipText: { color: '#888', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#818cf8' },
  bottom: { paddingBottom: 32, gap: 12 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipText: { color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center' },
});
