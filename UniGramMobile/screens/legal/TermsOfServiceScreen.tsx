import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  onClose: () => void;
}

export default function TermsOfServiceScreen({ onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Eligibility</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          By using UniGram, you represent that you are at least 13 years of age and a verified student or faculty member of a recognized Ghanaian university.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>2. Content Ownership</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          • <Text style={{ fontWeight: 'bold', color: colors.text }}>Yours:</Text> You own the text and media you post.{"\n"}
          • <Text style={{ fontWeight: 'bold', color: colors.text }}>Ours:</Text> By posting, you grant UniGram a license to host, store, and display that content so your friends can see it.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Prohibited Conduct</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          You agree not to use UniGram for:{"\n"}
          • Bullying, harassment, or "doxing" of fellow students.{"\n"}
          • Academic dishonesty (e.g., sharing exam leaks).{"\n"}
          • Impersonating university officials or faculty.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Termination</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          We reserve the right to suspend or ban accounts that violate these terms or the Community Guidelines without prior notice.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>5. Legal Jurisdiction</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          These terms are governed by the laws of the Republic of Ghana, specifically aligning with the Data Protection Act (2012).
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
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  paragraph: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
});
