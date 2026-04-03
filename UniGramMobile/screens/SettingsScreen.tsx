import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, Switch, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { EditProfileModal } from './EditProfileModal';

interface Props {
  visible: boolean;
  profile: any;
  onClose: () => void;
  onProfileUpdated: (updated: any) => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const Row: React.FC<{
  icon: string;
  iconColor?: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
  noBorder?: boolean;
}> = ({ icon, iconColor = '#818cf8', label, sublabel, onPress, danger, right, noBorder }) => (
  <TouchableOpacity
    style={[styles.row, noBorder && { borderBottomWidth: 0 }]}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
  >
    <View style={[styles.rowIcon, { backgroundColor: (danger ? '#ef4444' : iconColor) + '18' }]}>
      <Ionicons name={icon as any} size={18} color={danger ? '#ef4444' : iconColor} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[styles.rowLabel, danger && { color: '#ef4444' }]}>{label}</Text>
      {sublabel ? <Text style={styles.rowSub}>{sublabel}</Text> : null}
    </View>
    {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" /> : null)}
  </TouchableOpacity>
);

export const SettingsScreen: React.FC<Props> = ({ visible, profile, onClose, onProfileUpdated }) => {
  const insets = useSafeAreaInsets();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
            onClose();
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Contact Support', 'Please email support@unigram.app to delete your account.') },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Profile card */}
          <TouchableOpacity style={styles.profileCard} onPress={() => setShowEditProfile(true)}>
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={styles.profileAvatar} />
              : <View style={[styles.profileAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={28} color="#555" />
                </View>
            }
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{profile?.full_name ?? 'Your Name'}</Text>
              <Text style={styles.profileUsername}>@{profile?.username ?? 'username'}</Text>
              <Text style={styles.editHint}>Edit profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>

          <Section title="Account">
            <Row icon="person-outline" label="Edit Profile" onPress={() => setShowEditProfile(true)} />
            <Row icon="lock-closed-outline" label="Password & Security" sublabel="Manage your password" onPress={() => Alert.alert('Coming soon')} />
            <Row icon="eye-outline" label="Privacy" sublabel="Control who sees your content" onPress={() => Alert.alert('Coming soon')} />
            <Row icon="shield-checkmark-outline" label="Blocked Accounts" onPress={() => Alert.alert('Coming soon')} noBorder />
          </Section>

          <Section title="Preferences">
            <Row
              icon="notifications-outline"
              label="Push Notifications"
              right={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={{ false: '#333', true: '#4f46e5' }}
                  thumbColor="#fff"
                />
              }
            />
            <Row icon="moon-outline" label="Appearance" sublabel="Dark mode" onPress={() => Alert.alert('Coming soon')} />
            <Row icon="language-outline" label="Language" sublabel="English" onPress={() => Alert.alert('Coming soon')} noBorder />
          </Section>

          <Section title="Campus & Content">
            <Row icon="school-outline" label="University Settings" sublabel={profile?.university ?? 'Not set'} onPress={() => setShowEditProfile(true)} />
            <Row icon="pricetag-outline" label="Interest Tags" sublabel="Customize your feed" onPress={() => Alert.alert('Coming soon')} noBorder />
          </Section>

          <Section title="Support">
            <Row icon="help-circle-outline" label="Help Center" onPress={() => Alert.alert('Coming soon')} />
            <Row icon="flag-outline" label="Report a Problem" onPress={() => Alert.alert('Coming soon')} />
            <Row icon="information-circle-outline" label="About UniGram" sublabel="Version 1.0.0" onPress={() => Alert.alert('UniGram', 'Your campus social network.\nVersion 1.0.0')} noBorder />
          </Section>

          <Section title="Account Management">
            <Row icon="log-out-outline" label="Log Out" danger onPress={handleLogout} />
            <Row icon="trash-outline" label="Delete Account" danger onPress={handleDeleteAccount} noBorder />
          </Section>
        </ScrollView>
      </View>

      <EditProfileModal
        visible={showEditProfile}
        profile={profile}
        onClose={() => setShowEditProfile(false)}
        onSaved={updated => { onProfileUpdated(updated); setShowEditProfile(false); }}
      />
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, marginHorizontal: 16, marginTop: 16, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  profileAvatar: { width: 60, height: 60, borderRadius: 30 },
  profileName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  profileUsername: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  editHint: { fontSize: 12, color: '#818cf8', marginTop: 4 },

  section: { marginTop: 20, marginHorizontal: 16 },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 },
  sectionBody: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, color: '#fff', fontWeight: '500' },
  rowSub: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 },
});
