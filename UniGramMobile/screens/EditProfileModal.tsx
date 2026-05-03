import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { usePopup } from '../context/PopupContext';
import { updateProfile } from '../services/profiles';
import { searchMajors } from '../constants/majors';
import { searchUniversities } from '../constants/universities';

interface Props {
  visible: boolean;
  profile: any;
  onClose: () => void;
  onSaved: (updated: any) => void;
}

// ─── SearchModal ──────────────────────────────────────────────────────────────
// Same component as in onboarding ProfileSetupStep — full-screen picker sheet.

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
        <View style={modal.header}>
          <Text style={modal.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

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
          {loading && <ActivityIndicator size="small" color="#818cf8" />}
          {!loading && query.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={18} color="#555" />
            </TouchableOpacity>
          )}
        </View>

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
              <TouchableOpacity
                style={[modal.row, { borderBottomColor: 'rgba(129,140,248,0.2)' }]}
                onPress={() => handleSelect(query)}
              >
                <Ionicons name="add-circle-outline" size={16} color="#818cf8" />
                <Text style={[modal.rowText, { color: '#a5b4fc' }]}>Use "{query}"</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            query.length >= 2 && !loading ? null : (
              <View style={modal.hint}>
                <Text style={modal.hintText}>
                  {query.length < 2
                    ? 'Type at least 2 characters to search'
                    : 'No results — type to add your own'}
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

// ─── EditProfileModal ─────────────────────────────────────────────────────────

export const EditProfileModal: React.FC<Props> = ({ visible, profile, onClose, onSaved }) => {

  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const insets = useSafeAreaInsets();

  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPronouns, setEditPronouns] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editMajor, setEditMajor] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editUniversity, setEditUniversity] = useState('');

  const [showUniModal, setShowUniModal] = useState(false);
  const [showMajorModal, setShowMajorModal] = useState(false);

  useEffect(() => {
    if (visible && profile) {
      setEditName(profile.full_name ?? '');
      setEditBio(profile.bio ?? '');
      setEditPronouns(profile.pronouns ?? '');
      setEditWebsite(profile.website ?? '');
      setEditMajor(profile.major ?? '');
      setEditYear(profile.year ?? '');
      setEditUniversity(profile.university ?? '');
    }
  }, [visible, profile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await updateProfile(profile.id, {
        full_name: editName.trim(),
        bio: editBio.trim(),
        pronouns: editPronouns.trim(),
        website: editWebsite.trim(),
        major: editMajor.trim(),
        year: editYear.trim(),
        university: editUniversity.trim(),
      });
      onSaved({
        ...profile,
        full_name: editName.trim(),
        bio: editBio.trim(),
        pronouns: editPronouns.trim(),
        website: editWebsite.trim(),
        major: editMajor.trim(),
        year: editYear.trim(),
        university: editUniversity.trim(),
      });
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Could not save changes.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <KeyboardAvoidingView
          style={[styles.container, { backgroundColor: colors.bg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 16 }]}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[styles.cancel, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {saving
                ? <ActivityIndicator color="#818cf8" size="small" />
                : <Text style={styles.save}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Standard text fields */}
            {([
              { label: 'Name', value: editName, onChange: setEditName, placeholder: 'Full name', autoCapitalize: 'words' as any },
              { label: 'Bio', value: editBio, onChange: setEditBio, placeholder: 'Write a bio...', multi: true, autoCapitalize: 'sentences' as any },
              { label: 'Pronouns', value: editPronouns, onChange: setEditPronouns, placeholder: 'e.g. they/them', autoCapitalize: 'none' as any },
              { label: 'Website', value: editWebsite, onChange: setEditWebsite, placeholder: 'https://...', keyboard: 'url' as any, autoCapitalize: 'none' as any },
              { label: 'Year', value: editYear, onChange: setEditYear, placeholder: 'e.g. Junior, Graduate', autoCapitalize: 'words' as any },
            ] as any[]).map(({ label, value, onChange, placeholder, multi, keyboard, autoCapitalize }) => (
              <View key={label} style={styles.field}>
                <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text },
                    multi && { height: 88, textAlignVertical: 'top', paddingTop: 12 },
                  ]}
                  value={value}
                  onChangeText={onChange}
                  placeholder={placeholder}
                  placeholderTextColor={colors.textMuted}
                  multiline={multi}
                  keyboardType={keyboard}
                  autoCapitalize={autoCapitalize}
                />
              </View>
            ))}

            {/* Major — tappable picker */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Major / Course</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                onPress={() => setShowMajorModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="book-outline" size={18} color={editMajor ? colors.accent : colors.textMuted} />
                <Text
                  style={[styles.pickerText, { color: editMajor ? colors.text : colors.textMuted }]}
                  numberOfLines={1}
                >
                  {editMajor || 'Select your major or course'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* University — tappable picker */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textMuted }]}>University</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                onPress={() => setShowUniModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="school-outline" size={18} color={editUniversity ? colors.accent : colors.textMuted} />
                <Text
                  style={[styles.pickerText, { color: editUniversity ? colors.text : colors.textMuted }]}
                  numberOfLines={1}
                >
                  {editUniversity || 'Select your university'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full-screen search modals — rendered outside the main Modal to avoid nesting issues */}
      <SearchModal
        visible={showUniModal}
        title="Search University"
        placeholder="e.g. University of Lagos..."
        icon="school-outline"
        onSearch={searchUniversities}
        onSelect={(val) => setEditUniversity(val)}
        onClose={() => setShowUniModal(false)}
      />
      <SearchModal
        visible={showMajorModal}
        title="Search Major / Course"
        placeholder="e.g. Computer Science..."
        icon="book-outline"
        onSearch={(q) => searchMajors(q)}
        onSelect={(val) => setEditMajor(val)}
        onClose={() => setShowMajorModal(false)}
      />
    </>
  );
};

// ─── Modal sheet styles ────────────────────────────────────────────────────────

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
  hint: { paddingHorizontal: 20, paddingTop: 32, alignItems: 'center' },
  hintText: { color: 'rgba(255,255,255,0.3)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});

// ─── Form styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontWeight: '700' },
  cancel: { fontSize: 15 },
  save: { fontSize: 15, fontWeight: '700', color: '#818cf8' },

  body: { padding: 20, paddingBottom: 60, gap: 4 },
  field: { marginBottom: 18 },
  label: {
    fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, minHeight: 46,
  },

  // Picker button — replaces inline text input for university/major
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14, minHeight: 50,
  },
  pickerText: { flex: 1, fontSize: 15 },
});
