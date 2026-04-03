import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updateProfile } from '../services/profiles';

interface Props {
  visible: boolean;
  profile: any;
  onClose: () => void;
  onSaved: (updated: any) => void;
}

export const EditProfileModal: React.FC<Props> = ({ visible, profile, onClose, onSaved }) => {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPronouns, setEditPronouns] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editMajor, setEditMajor] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editUniversity, setEditUniversity] = useState('');
  const [uniQuery, setUniQuery] = useState('');
  const [uniResults, setUniResults] = useState<string[]>([]);
  const [uniSearching, setUniSearching] = useState(false);
  const [showUniList, setShowUniList] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible && profile) {
      setEditName(profile.full_name ?? '');
      setEditBio(profile.bio ?? '');
      setEditPronouns(profile.pronouns ?? '');
      setEditWebsite(profile.website ?? '');
      setEditMajor(profile.major ?? '');
      setEditYear(profile.year ?? '');
      setEditUniversity(profile.university ?? '');
      setUniQuery(profile.university ?? '');
    }
  }, [visible, profile]);

  const searchUniversity = async (q: string) => {
    if (!q.trim() || q.length < 3) { setUniResults([]); return; }
    setUniSearching(true);
    try {
      const res = await fetch(`https://universities.hipolabs.com/search?name=${encodeURIComponent(q)}&limit=25`);
      const data: any[] = await res.json();
      setUniResults([...new Set(data.map((u: any) => u.name as string))].slice(0, 15));
    } catch {
      setUniResults([]);
    } finally {
      setUniSearching(false);
    }
  };

  const handleUniType = (text: string) => {
    setUniQuery(text);
    setEditUniversity(text);
    setShowUniList(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchUniversity(text), 400);
  };

  const selectUniversity = (name: string) => {
    setEditUniversity(name);
    setUniQuery(name);
    setUniResults([]);
    setShowUniList(false);
  };

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
      Alert.alert('Error', e.message ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top || 16 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#818cf8" size="small" />
              : <Text style={styles.save}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {[
            { label: 'Name', value: editName, onChange: setEditName, placeholder: 'Full name' },
            { label: 'Bio', value: editBio, onChange: setEditBio, placeholder: 'Write a bio...', multi: true },
            { label: 'Pronouns', value: editPronouns, onChange: setEditPronouns, placeholder: 'e.g. they/them' },
            { label: 'Website', value: editWebsite, onChange: setEditWebsite, placeholder: 'https://...', keyboard: 'url' as any },
            { label: 'Major', value: editMajor, onChange: setEditMajor, placeholder: 'Your major' },
            { label: 'Year', value: editYear, onChange: setEditYear, placeholder: 'e.g. Senior, Graduate' },
          ].map(({ label, value, onChange, placeholder, multi, keyboard }) => (
            <View key={label} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={[styles.input, multi && { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor="rgba(255,255,255,0.25)"
                multiline={multi}
                keyboardType={keyboard}
                autoCapitalize="none"
              />
            </View>
          ))}

          {/* University with search */}
          <View style={styles.field}>
            <Text style={styles.label}>University</Text>
            <View style={styles.uniInputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={uniQuery}
                onChangeText={handleUniType}
                placeholder="Search your university..."
                placeholderTextColor="rgba(255,255,255,0.25)"
                onFocus={() => setShowUniList(true)}
                autoCapitalize="words"
              />
              {uniSearching && <ActivityIndicator size="small" color="#4f46e5" style={{ marginLeft: 8 }} />}
            </View>
            {showUniList && uniResults.length > 0 && (
              <View style={styles.uniDropdown}>
                <FlatList
                  data={uniResults}
                  keyExtractor={(item, i) => `${item}-${i}`}
                  style={{ maxHeight: 180 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.uniRow} onPress={() => selectUniversity(item)}>
                      <Text style={styles.uniRowText} numberOfLines={1}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}
            {showUniList && !uniSearching && uniQuery.length >= 3 && uniResults.length === 0 && (
              <View style={styles.uniDropdown}>
                <TouchableOpacity style={styles.uniRow} onPress={() => selectUniversity(uniQuery)}>
                  <Text style={[styles.uniRowText, { color: '#818cf8' }]}>Use "{uniQuery}"</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancel: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  save: { fontSize: 15, fontWeight: '700', color: '#818cf8' },
  body: { padding: 20, gap: 4 },
  field: { marginBottom: 16 },
  label: {
    fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: '#fff', fontSize: 15,
  },
  uniInputRow: { flexDirection: 'row', alignItems: 'center' },
  uniDropdown: {
    backgroundColor: '#1a1a1a', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 4, overflow: 'hidden',
  },
  uniRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  uniRowText: { color: '#fff', fontSize: 14 },
});
