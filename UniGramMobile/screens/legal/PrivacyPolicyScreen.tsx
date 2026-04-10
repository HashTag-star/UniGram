import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  onClose: () => void;
}

export default function PrivacyPolicyScreen({ onClose }: Props) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.date, { color: colors.textMuted }]}>Effective Date: April 9, 2026</Text>
        
        <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Data We Collect</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          <Text style={{ fontWeight: 'bold', color: colors.text }}>Identity Data:</Text> Full name, university email address (.edu.gh), and student ID (if used for verification).
        </Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          <Text style={{ fontWeight: 'bold', color: colors.text }}>Interaction Data:</Text> Posts, comments, likes, and messages sent within the app.
        </Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          <Text style={{ fontWeight: 'bold', color: colors.text }}>Technical Data:</Text> IP address, device type, and app usage patterns.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>2. How We Use Your Data</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          • To verify your status as a student and maintain a safe campus environment.{"\n"}
          • To provide the core UniGram social experience.{"\n"}
          • <Text style={{ fontWeight: 'bold' }}>Note:</Text> We do not sell your personal data to third-party advertisers.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Your Rights (Ghana Data Protection Act 2012)</Text>
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          <Text style={{ fontWeight: 'bold', color: colors.text }}>Access:</Text> You can request a copy of the data we hold about you.{"\n\n"}
          <Text style={{ fontWeight: 'bold', color: colors.text }}>Deletion:</Text> You can delete your account at any time, which will trigger the "Right to be Forgotten" protocol.{"\n\n"}
          <Text style={{ fontWeight: 'bold', color: colors.text }}>Correction:</Text> You can update your profile information via the app settings.
        </Text>

        <Text style={[styles.paragraph, { color: colors.textMuted, marginTop: 24, fontStyle: 'italic' }]}>
          By using UniGram, you agree to the collection and use of information in accordance with this policy.
        </Text>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
  date: { fontSize: 14, marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  paragraph: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
});
