import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Animated, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { updateProfileSetup } from '../../../services/onboarding';
import { uploadAvatar } from '../../../services/profiles';
import { useHaptics } from '../../../hooks/useHaptics';
import { searchMajors } from '../../../constants/majors';

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'PhD', 'Faculty'];

interface Props {
  userId: string;
  onNext: () => void;
  onBack: () => void;
}

export function ProfileSetupStep({ userId, onNext, onBack }: Props) {
  const [university, setUniversity] = useState('');
  const [uniQuery, setUniQuery] = useState('');
  const [uniResults, setUniResults] = useState<string[]>([]);
  const [uniSearching, setUniSearching] = useState(false);
  const [showUniList, setShowUniList] = useState(false);
  const [major, setMajor] = useState('');
  const [majorQuery, setMajorQuery] = useState('');
  const [majorResults, setMajorResults] = useState<string[]>([]);
  const [showMajorList, setShowMajorList] = useState(false);
  const [year, setYear] = useState('');
  const [bio, setBio] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { light, success } = useHaptics();

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const searchUniversity = async (q: string) => {
    if (!q.trim() || q.length < 3) { setUniResults([]); return; }
    setUniSearching(true);
    try {
      const res = await fetch(
        `https://universities.hipolabs.com/search?name=${encodeURIComponent(q)}&limit=30`
      );
      const data: any[] = await res.json();
      const names = [...new Set(data.map((u: any) => u.name as string))].slice(0, 20);
      setUniResults(names);
    } catch {
      setUniResults([]);
    } finally {
      setUniSearching(false);
    }
  };

  const handleUniType = (text: string) => {
    setUniQuery(text);
    setShowUniList(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchUniversity(text), 400);
  };

  const selectUniversity = (name: string) => {
    setUniversity(name);
    setUniQuery(name);
    setUniResults([]);
    setShowUniList(false);
    light();
  };

  const handleMajorType = (text: string) => {
    setMajorQuery(text);
    setMajor(text);
    setShowMajorList(true);
    setMajorResults(searchMajors(text));
  };

  const selectMajor = (name: string) => {
    setMajor(name);
    setMajorQuery(name);
    setMajorResults([]);
    setShowMajorList(false);
    light();
  };

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <View>
            <Text style={styles.stepLabel}>Step 2 of 5</Text>
            <Text style={styles.title}>Set up your profile</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subtitle}>Tell your campus community about yourself.</Text>

          {/* University search */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>University *</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="school-outline" size={16} color="#555" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={uniQuery}
                onChangeText={handleUniType}
                placeholder="Search your university..."
                placeholderTextColor="#444"
                onFocus={() => setShowUniList(true)}
                returnKeyType="search"
              />
              {uniSearching
                ? <ActivityIndicator size="small" color="#4f46e5" />
                : university
                  ? <Ionicons name="checkmark-circle" size={18} color="#4f46e5" />
                  : null
              }
            </View>
            {showUniList && uniResults.length > 0 && (
              <View style={styles.uniDropdown}>
                <ScrollView
                  style={{ maxHeight: 200 }}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {uniResults.map((item, i) => (
                    <TouchableOpacity key={`${item}-${i}`} style={styles.uniRow} onPress={() => selectUniversity(item)}>
                      <Ionicons name="school-outline" size={14} color="#555" />
                      <Text style={styles.uniRowText} numberOfLines={1}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {showUniList && !uniSearching && uniQuery.length >= 3 && uniResults.length === 0 && (
              <View style={styles.uniDropdown}>
                <TouchableOpacity
                  style={styles.uniRow}
                  onPress={() => { selectUniversity(uniQuery); }}
                >
                  <Ionicons name="add-circle-outline" size={14} color="#4f46e5" />
                  <Text style={[styles.uniRowText, { color: '#818cf8' }]}>Use "{uniQuery}"</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Major */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Major *</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="book-outline" size={16} color="#555" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={majorQuery}
                onChangeText={handleMajorType}
                placeholder="Search your major..."
                placeholderTextColor="#444"
                onFocus={() => { setShowMajorList(true); setMajorResults(searchMajors(majorQuery)); }}
              />
              {major && majorQuery === major
                ? <Ionicons name="checkmark-circle" size={18} color="#4f46e5" />
                : null
              }
            </View>
            {showMajorList && majorResults.length > 0 && (
              <View style={styles.uniDropdown}>
                <ScrollView
                  style={{ maxHeight: 200 }}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {majorResults.map((item, i) => (
                    <TouchableOpacity key={`${item}-${i}`} style={styles.uniRow} onPress={() => selectMajor(item)}>
                      <Ionicons name="book-outline" size={14} color="#555" />
                      <Text style={styles.uniRowText} numberOfLines={1}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {showMajorList && majorQuery.length > 0 && majorResults.length === 0 && (
              <View style={styles.uniDropdown}>
                <TouchableOpacity style={styles.uniRow} onPress={() => selectMajor(majorQuery)}>
                  <Ionicons name="add-circle-outline" size={14} color="#4f46e5" />
                  <Text style={[styles.uniRowText, { color: '#818cf8' }]}>Use "{majorQuery}"</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Pronouns */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pronouns</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={16} color="#555" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={pronouns}
                onChangeText={setPronouns}
                placeholder="e.g. he/him, she/her, they/them"
                placeholderTextColor="#444"
              />
            </View>
          </View>

          {/* Year */}
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

          {/* Bio */}
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
      </KeyboardAvoidingView>
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
  uniDropdown: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12, marginTop: 4, overflow: 'hidden',
  },
  uniRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  uniRowText: { flex: 1, color: '#fff', fontSize: 14 },
  bottom: { paddingBottom: 32, gap: 12 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipText: { color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center' },
});
