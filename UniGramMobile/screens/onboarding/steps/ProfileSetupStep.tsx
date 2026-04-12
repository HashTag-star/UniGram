import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Animated, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Modal, FlatList, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { updateProfileSetup } from '../../../services/onboarding';
import { useHaptics } from '../../../hooks/useHaptics';
import { searchMajors } from '../../../constants/majors';
import { searchUniversities } from '../../../constants/universities';
import { usePopup } from '../../../context/PopupContext';

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'PhD', 'Faculty'];

const PRONOUN_OPTIONS = [
  'he/him', 'she/her', 'they/them', 'ze/zir', 'xe/xem', 'prefer not to say', 'custom',
];

interface Props {
  userId: string;
  onNext: () => void;
  onBack: () => void;
}

// ─── Search Modal ─────────────────────────────────────────────────────────────

interface SearchModalProps {
  visible: boolean;
  title: string;
  placeholder: string;
  icon: string;
  onSearch: (q: string) => Promise<string[]> | string[];
  onSelect: (val: string) => void;
  onClose: () => void;
}

function SearchModal({ visible, title, placeholder, icon, onSearch, onSelect, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [visible]);

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (!text.trim() || text.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await onSearch(text);
      setResults(r);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [onSearch]);

  const handleSelect = (val: string) => {
    onSelect(val);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={modal.container}>
        {/* Header */}
        <View style={modal.header}>
          <Text style={modal.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Search input */}
        <View style={modal.searchWrap}>
          <Ionicons name={icon as any} size={16} color="#555" style={{ marginRight: 10 }} />
          <TextInput
            ref={inputRef}
            style={modal.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder={placeholder}
            placeholderTextColor="#555"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="words"
          />
          {loading && <ActivityIndicator size="small" color="#8b5cf6" />}
          {!loading && query.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={18} color="#555" />
            </TouchableOpacity>
          )}
        </View>

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={(item, i) => `${item}-${i}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={modal.row} onPress={() => handleSelect(item)}>
              <Ionicons name={icon as any} size={15} color="#555" />
              <Text style={modal.rowText} numberOfLines={1}>{item}</Text>
            </TouchableOpacity>
          )}
          ListHeaderComponent={
            query.length >= 2 && !loading ? (
              <TouchableOpacity style={[modal.row, { borderBottomColor: 'rgba(139,92,246,0.2)' }]} onPress={() => handleSelect(query)}>
                <Ionicons name="add-circle-outline" size={16} color="#8b5cf6" />
                <Text style={[modal.rowText, { color: '#a855f7' }]}>Use "{query}"</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            query.length >= 2 && !loading ? null : (
              <View style={modal.hint}>
                <Text style={modal.hintText}>
                  {query.length < 2 ? `Type at least 2 characters to search` : `No results — type to add your own`}
                </Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ─── ProfileSetupStep ─────────────────────────────────────────────────────────

export function ProfileSetupStep({ userId, onNext, onBack }: Props) {
  const [university, setUniversity] = useState('');
  const [major, setMajor] = useState('');
  const [year, setYear] = useState('');
  const [bio, setBio] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [customPronoun, setCustomPronoun] = useState('');
  const [selectedPronounChip, setSelectedPronounChip] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUniModal, setShowUniModal] = useState(false);
  const [showMajorModal, setShowMajorModal] = useState(false);
  const { showPopup } = usePopup();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { light, success } = useHaptics();

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const handlePronounSelect = (chip: string) => {
    light();
    setSelectedPronounChip(chip);
    if (chip !== 'custom') {
      setPronouns(chip);
      setCustomPronoun('');
    } else {
      setPronouns('');
    }
  };

  const handleNext = async () => {
    await light();
    if (!university.trim() || !major.trim()) {
      showPopup({
        title: 'Almost there!',
        message: 'Please fill in your university and major.',
        icon: 'school-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }
    const finalPronouns = selectedPronounChip === 'custom' ? customPronoun.trim() : pronouns;
    setLoading(true);
    try {
      await updateProfileSetup(userId, {
        university: university.trim(),
        major: major.trim(),
        year,
        bio: bio.trim(),
        pronouns: finalPronouns,
      });
      await success();
      onNext();
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Failed to update profile',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
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
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subtitle}>Tell your campus community about yourself.</Text>

          {/* University picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>University *</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowUniModal(true)} activeOpacity={0.8}>
              <Ionicons name="school-outline" size={16} color="#555" style={styles.inputIcon} />
              <Text style={[styles.pickerText, !university && styles.pickerPlaceholder]} numberOfLines={1}>
                {university || 'Search your university...'}
              </Text>
              {university
                ? <Ionicons name="checkmark-circle" size={20} color="#8b5cf6" />
                : <Ionicons name="chevron-down" size={16} color="#555" />
              }
            </TouchableOpacity>
          </View>

          {/* Major picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Major *</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowMajorModal(true)} activeOpacity={0.8}>
              <Ionicons name="book-outline" size={16} color="#555" style={styles.inputIcon} />
              <Text style={[styles.pickerText, !major && styles.pickerPlaceholder]} numberOfLines={1}>
                {major || 'Search your major or course...'}
              </Text>
              {major
                ? <Ionicons name="checkmark-circle" size={20} color="#8b5cf6" />
                : <Ionicons name="chevron-down" size={16} color="#555" />
              }
            </TouchableOpacity>
          </View>

          {/* Pronouns chip picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pronouns</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              nestedScrollEnabled
            >
              {PRONOUN_OPTIONS.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, selectedPronounChip === p && styles.chipActive]}
                  onPress={() => handlePronounSelect(p)}
                >
                  <Text style={[styles.chipText, selectedPronounChip === p && styles.chipTextActive]}>
                    {p === 'custom' ? '✏️ custom' : p}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {selectedPronounChip === 'custom' && (
              <View style={[styles.inputWrap, { marginTop: 10 }]}>
                <TextInput
                  style={styles.input}
                  value={customPronoun}
                  onChangeText={setCustomPronoun}
                  placeholder="Type your pronouns..."
                  placeholderTextColor="#555"
                  autoCapitalize="none"
                />
              </View>
            )}
          </View>

          {/* Year chips */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Year</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              nestedScrollEnabled
            >
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

      {/* University search modal */}
      <SearchModal
        visible={showUniModal}
        title="Search University"
        placeholder="e.g. University of Lagos..."
        icon="school-outline"
        onSearch={searchUniversities}
        onSelect={(val) => { setUniversity(val); light(); }}
        onClose={() => setShowUniModal(false)}
      />

      {/* Major search modal */}
      <SearchModal
        visible={showMajorModal}
        title="Search Major / Course"
        placeholder="e.g. Computer Science..."
        icon="book-outline"
        onSearch={(q) => searchMajors(q)}
        onSelect={(val) => { setMajor(val); light(); }}
        onClose={() => setShowMajorModal(false)}
      />
    </Animated.View>
  );
}

// ─── Modal styles ─────────────────────────────────────────────────────────────

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 0.5, borderBottomColor: '#27272a',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#fff' },
  closeBtn: { padding: 6 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#18181b', borderRadius: 14, borderWidth: 1, borderColor: '#27272a',
    paddingHorizontal: 16, height: 52, margin: 16, gap: 4,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '500' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rowText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500' },
  hint: { paddingHorizontal: 20, paddingTop: 24, alignItems: 'center' },
  hintText: { color: 'rgba(255,255,255,0.3)', fontSize: 14, textAlign: 'center' },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b', paddingHorizontal: 28 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 16, paddingBottom: 8 },
  backBtn: { padding: 4, marginBottom: 2 },
  stepLabel: { fontSize: 12, color: '#8b5cf6', fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900', color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 32, lineHeight: 22, marginTop: 4 },
  scroll: { paddingBottom: 20 },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },

  // Picker button (tappable field that opens modal)
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#18181b', borderRadius: 16, borderWidth: 1, borderColor: '#27272a',
    paddingHorizontal: 16, height: 56,
  },
  inputIcon: { marginRight: 12 },
  pickerText: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '500' },
  pickerPlaceholder: { color: '#666', fontWeight: '400' },

  // Input (used for custom pronouns + bio)
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b', borderRadius: 16, borderWidth: 1, borderColor: '#27272a', paddingHorizontal: 16, height: 56 },
  input: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '500' },
  bioInput: { height: 100, textAlignVertical: 'top', paddingTop: 16, backgroundColor: '#18181b', borderRadius: 16, borderWidth: 1, borderColor: '#27272a', paddingHorizontal: 16, color: '#fff', fontSize: 16, fontWeight: '500' },
  charCount: { fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'right', marginTop: 8, fontWeight: '600' },

  // Chips (pronouns + year)
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: '#27272a', backgroundColor: '#18181b' },
  chipActive: { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: '#8b5cf6' },
  chipText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#a855f7' },

  bottom: { paddingBottom: 36, gap: 16 },
  btn: { backgroundColor: '#8b5cf6', borderRadius: 20, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  skipText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', fontWeight: '600' },
});
