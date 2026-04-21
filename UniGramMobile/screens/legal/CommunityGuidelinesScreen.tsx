import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  onClose: () => void;
}

export default function CommunityGuidelinesScreen({ onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Community Guidelines</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: colors.textMuted }]}>
          These guidelines are designed to ensure UniGram remains a safe, respectful, and productive environment for all students and faculty members in Ghana.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Respect the Campus</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          UniGram is for building community, not tearing it down. No hate speech, targeted harassment, or discriminatory behavior based on tribe, religion, gender, or faculty.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>2. No "Fake News"</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          Do not spread misinformation regarding university strikes, exam dates, campus emergencies, or university management decisions. Verified information should come from official channels.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Media Safety & NCII</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          Strictly no non-consensual sharing of intimate images (NCII). We have a zero-tolerance policy for explicit content or illegal activities.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Academic Integrity</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          Sharing exam leaks, promoting academic fraud, or selling coursework is strictly prohibited and can be reported to university authorities.
        </Text>

        <Text style={[styles.paragraph, { color: colors.text, marginTop: 24, fontWeight: '700' }]}>
          Reporting violations:
        </Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          If you see content that violates these rules, use the "Report" button. Our moderation team reviews all reports within 24 hours.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  backBtn: { padding: 8 },
  content: { padding: 20 },
  intro: { fontSize: 15, lineHeight: 22, fontStyle: 'italic', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  paragraph: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
});
