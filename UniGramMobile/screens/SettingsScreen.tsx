import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, Switch, Alert, Modal, TextInput, ActivityIndicator,
  Linking, KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { EditProfileModal } from './EditProfileModal';
import { useTheme } from '../context/ThemeContext';
import { deleteUserAccount } from '../services/profiles';

interface Props {
  visible: boolean;
  profile: any;
  onClose: () => void;
  onProfileUpdated: (updated: any) => void;
  onAdminPress?: () => void;
  onShowPrivacy?: () => void;
  onShowTerms?: () => void;
  onShowGuidelines?: () => void;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.section]}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.sectionBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
};

const Row: React.FC<{
  icon: string;
  iconColor?: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
  noBorder?: boolean;
}> = ({ icon, iconColor = '#818cf8', label, sublabel, onPress, danger, right, noBorder }) => {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.rowBorder }, noBorder && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.rowIcon, { backgroundColor: (danger ? '#ef4444' : iconColor) + '20' }]}>
        <Ionicons name={icon as any} size={18} color={danger ? '#ef4444' : iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: danger ? '#ef4444' : colors.text }]}>{label}</Text>
        {sublabel ? <Text style={[styles.rowSub, { color: colors.textMuted }]}>{sublabel}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null)}
    </TouchableOpacity>
  );
};

// ─── Password Change Modal ──────────────────────────────────────────────────────

const PasswordModal: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setNewPassword(''); setConfirmPassword(''); setSaving(false); };

  const handleSave = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Too short', 'Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      Alert.alert('Done', 'Your password has been updated.');
      reset();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView
        style={[styles.subModalContainer, { backgroundColor: colors.bg, paddingTop: Platform.OS === 'ios' ? 0 : (insets.top || 16) }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.subModalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Text style={[styles.subModalCancel, { color: colors.textSub }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.subModalTitle, { color: colors.text }]}>Change Password</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color={colors.accentLight} />
              : <Text style={[styles.subModalSave, { color: colors.accentLight }]}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.subModalBody} keyboardShouldPersistTaps="handled">
          <Text style={[styles.subModalHint, { color: colors.textSub }]}>
            Choose a strong password with at least 8 characters.
          </Text>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>New Password</Text>
          <View style={[styles.passwordRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <TextInput
              style={[styles.passwordInput, { color: colors.text }]}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNew}
              placeholder="Min. 8 characters"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowNew(v => !v)} style={styles.eyeBtn}>
              <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSub} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Confirm Password</Text>
          <View style={[styles.passwordRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <TextInput
              style={[styles.passwordInput, { color: colors.text }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm}
              placeholder="Repeat new password"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={styles.eyeBtn}>
              <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSub} />
            </TouchableOpacity>
          </View>

          <View style={[styles.infoBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.accentLight} />
            <Text style={[styles.infoText, { color: colors.textSub }]}>
              You'll be asked to log in again after changing your password.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Privacy Modal ──────────────────────────────────────────────────────────────

const PRIVACY_STORAGE_KEY = 'unigram_privacy_prefs';

interface PrivacyPrefs {
  showActivityStatus: boolean;
  allowDmsFrom: 'everyone' | 'followers';
}

const PrivacyModal: React.FC<{
  visible: boolean;
  profile: any;
  onClose: () => void;
  onProfileUpdated: (p: any) => void;
}> = ({ visible, profile, onClose, onProfileUpdated }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [isPrivate, setIsPrivate] = useState(false);
  const [showActivityStatus, setShowActivityStatus] = useState(true);
  const [allowDmsFrom, setAllowDmsFrom] = useState<'everyone' | 'followers'>('everyone');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && profile) {
      setIsPrivate(profile.is_private ?? false);
      AsyncStorage.getItem(PRIVACY_STORAGE_KEY).then(raw => {
        if (raw) {
          const prefs: PrivacyPrefs = JSON.parse(raw);
          setShowActivityStatus(prefs.showActivityStatus ?? true);
          setAllowDmsFrom(prefs.allowDmsFrom ?? 'everyone');
        }
      }).catch(() => {});
    }
  }, [visible, profile]);

  const savePrivacyToStorage = (prefs: Partial<PrivacyPrefs>) => {
    const current: PrivacyPrefs = { showActivityStatus, allowDmsFrom, ...prefs };
    AsyncStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(current)).catch(() => {});
  };

  const handlePrivateToggle = async (val: boolean) => {
    setIsPrivate(val);
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ is_private: val }).eq('id', profile.id);
      if (error) throw error;
      onProfileUpdated({ ...profile, is_private: val });
    } catch (e: any) {
      setIsPrivate(!val);
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleActivityToggle = (val: boolean) => {
    setShowActivityStatus(val);
    savePrivacyToStorage({ showActivityStatus: val });
  };

  const handleDmsChange = (val: 'everyone' | 'followers') => {
    setAllowDmsFrom(val);
    savePrivacyToStorage({ allowDmsFrom: val });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.subModalContainer, { backgroundColor: colors.bg, paddingTop: insets.top || 16 }]}>
        <View style={[styles.subModalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.subModalCancel, { color: colors.textSub }]}>Done</Text>
          </TouchableOpacity>
          <Text style={[styles.subModalTitle, { color: colors.text }]}>Privacy</Text>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView contentContainerStyle={styles.subModalBody}>
          {/* Account Visibility */}
          <Text style={[styles.privacyGroupLabel, { color: colors.textMuted }]}>Account</Text>
          <View style={[styles.privacyGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.privacyRow, { borderBottomColor: colors.rowBorder }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.privacyRowLabel, { color: colors.text }]}>Private Account</Text>
                <Text style={[styles.privacyRowSub, { color: colors.textMuted }]}>
                  Only approved followers can see your posts
                </Text>
              </View>
              {saving
                ? <ActivityIndicator size="small" color={colors.accent} />
                : <Switch value={isPrivate} onValueChange={handlePrivateToggle} trackColor={{ false: '#333', true: colors.accent }} thumbColor="#fff" />
              }
            </View>
            <View style={[styles.privacyRow, { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.privacyRowLabel, { color: colors.text }]}>Show Activity Status</Text>
                <Text style={[styles.privacyRowSub, { color: colors.textMuted }]}>
                  Let others see when you were last active
                </Text>
              </View>
              <Switch value={showActivityStatus} onValueChange={handleActivityToggle} trackColor={{ false: '#333', true: colors.accent }} thumbColor="#fff" />
            </View>
          </View>

          {/* Messaging */}
          <Text style={[styles.privacyGroupLabel, { color: colors.textMuted }]}>Messages</Text>
          <View style={[styles.privacyGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(['everyone', 'followers'] as const).map((opt, i, arr) => (
              <TouchableOpacity
                key={opt}
                style={[styles.privacyRow, { borderBottomColor: colors.rowBorder }, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => handleDmsChange(opt)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.privacyRowLabel, { color: colors.text }]}>
                    {opt === 'everyone' ? 'Everyone' : 'Followers only'}
                  </Text>
                  <Text style={[styles.privacyRowSub, { color: colors.textMuted }]}>
                    {opt === 'everyone' ? 'Anyone can send you a message' : 'Only people you follow can DM you'}
                  </Text>
                </View>
                {allowDmsFrom === opt && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.privacyNote, { color: colors.textMuted }]}>
            Activity status and message settings are saved locally on this device.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
};

// ─── Blocked Accounts Modal ─────────────────────────────────────────────────────

const BlockedModal: React.FC<{ visible: boolean; profile: any; onClose: () => void }> = ({ visible, profile, onClose }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [blocked, setBlocked] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !profile?.id) return;
    
    const fetchBlocked = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('blocked_users')
          .select('blocked_id, profiles!blocked_users_blocked_id_fkey(id, full_name, username, avatar_url)')
          .eq('blocker_id', profile.id);
        setBlocked(data?.map((r: any) => r.profiles).filter(Boolean) ?? []);
      } catch (e) {
        setBlocked([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBlocked();
  }, [visible, profile?.id]);

  const handleUnblock = (userId: string, name: string) => {
    Alert.alert(`Unblock ${name}?`, 'They will be able to see your posts and follow you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          await supabase.from('blocked_users')
            .delete()
            .eq('blocker_id', profile.id)
            .eq('blocked_id', userId);
          setBlocked(prev => prev.filter(u => u.id !== userId));
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.subModalContainer, { backgroundColor: colors.bg, paddingTop: insets.top || 16 }]}>
        <View style={[styles.subModalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.subModalCancel, { color: colors.textSub }]}>Done</Text>
          </TouchableOpacity>
          <Text style={[styles.subModalTitle, { color: colors.text }]}>Blocked Accounts</Text>
          <View style={{ width: 48 }} />
        </View>

        {loading
          ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.accentLight} />
          : blocked.length === 0
            ? (
              <View style={styles.emptyState}>
                <Ionicons name="ban-outline" size={44} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Blocked Accounts</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  People you block won't be able to find your profile or see your posts.
                </Text>
              </View>
            )
            : (
              <FlatList
                data={blocked}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => (
                  <View style={[styles.blockedRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {item.avatar_url
                      ? <Image source={{ uri: item.avatar_url }} style={styles.blockedAvatar} />
                      : (
                        <View style={[styles.blockedAvatar, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="person" size={18} color={colors.textMuted} />
                        </View>
                      )
                    }
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.blockedName, { color: colors.text }]}>{item.full_name ?? item.username}</Text>
                      <Text style={[styles.blockedUser, { color: colors.textMuted }]}>@{item.username}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.unblockBtn, { borderColor: colors.accentLight }]}
                      onPress={() => handleUnblock(item.id, item.full_name ?? item.username)}
                    >
                      <Text style={[styles.unblockText, { color: colors.accentLight }]}>Unblock</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )
        }
      </View>
    </Modal>
  );
};

// ─── Main Settings Screen ───────────────────────────────────────────────────────

const NOTIF_STORAGE_KEY = 'unigram_notifications_enabled';

export const SettingsScreen: React.FC<Props> = ({ 
  visible, profile, onClose, onProfileUpdated, onAdminPress,
  onShowPrivacy, onShowTerms, onShowGuidelines
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(NOTIF_STORAGE_KEY).then(val => {
        setNotificationsEnabled(val !== 'false');
      }).catch(() => {});
    }
  }, [visible]);

  const handleNotifToggle = (val: boolean) => {
    setNotificationsEnabled(val);
    AsyncStorage.setItem(NOTIF_STORAGE_KEY, String(val)).catch(() => {});
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => { await supabase.auth.signOut(); onClose(); },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This action cannot be undone and complies with the "Right to be Forgotten" protocol.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue', style: 'destructive',
          onPress: () => Alert.alert(
            'Final Confirmation',
            'Are you absolutely sure? This will scrub your posts, reels, and profiles from UniGram permanently.',
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Delete Permanently', 
                style: 'destructive', 
                onPress: async () => {
                  try {
                    await deleteUserAccount(profile.id);
                    onClose();
                  } catch (e: any) {
                    Alert.alert('error', e.message);
                  }
                } 
              },
            ]
          ),
        },
      ]
    );
  };

  const handleHelp = () => Linking.openURL('mailto:support@unigram.app').catch(() =>
    Alert.alert('Help', 'Reach us at support@unigram.app')
  );

  const handleReport = () => Linking.openURL('mailto:support@unigram.app?subject=Bug%20Report&body=Describe%20the%20issue%20here...').catch(() =>
    Alert.alert('Report', 'Reach us at support@unigram.app')
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: Platform.OS === 'ios' ? 0 : (insets.top || 16) }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Profile card */}
          <TouchableOpacity
            style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowEditProfile(true)}
          >
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={styles.profileAvatar} />
              : (
                <View style={[styles.profileAvatar, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={28} color={colors.textMuted} />
                </View>
              )
            }
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileName, { color: colors.text }]}>{profile?.full_name ?? 'Your Name'}</Text>
              <Text style={[styles.profileUsername, { color: colors.textSub }]}>@{profile?.username ?? 'username'}</Text>
              <Text style={[styles.editHint, { color: colors.accentLight }]}>Edit profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <Section title="Account">
            <Row icon="person-outline" label="Edit Profile" onPress={() => setShowEditProfile(true)} />
            {profile?.is_admin && (
              <Row icon="shield-checkmark-outline" iconColor="#fbbf24" label="Admin Dashboard" sublabel="Verify users & manage content" onPress={onAdminPress} />
            )}
            <Row
              icon="lock-closed-outline"
              label="Password & Security"
              sublabel="Change your password"
              onPress={() => setShowPasswordModal(true)}
            />
            <Row
              icon="eye-outline"
              label="Privacy"
              sublabel={profile?.is_private ? 'Private account' : 'Public account'}
              onPress={() => setShowPrivacyModal(true)}
            />
            <Row
              icon="ban-outline"
              label="Blocked Accounts"
              sublabel="Manage who you've blocked"
              onPress={() => setShowBlockedModal(true)}
              noBorder
            />
          </Section>

          <Section title="Preferences">
            <Row
              icon="notifications-outline"
              label="Push Notifications"
              right={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotifToggle}
                  trackColor={{ false: '#333', true: colors.accent }}
                  thumbColor="#fff"
                />
              }
            />
            <Row
              icon={isDark ? 'moon' : 'sunny'}
              iconColor={isDark ? '#818cf8' : '#f59e0b'}
              label="Appearance"
              sublabel={isDark ? 'Dark mode' : 'Light mode'}
              right={
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: '#e5e7eb', true: colors.accent }}
                  thumbColor="#fff"
                />
              }
            />
            <Row
              icon="language-outline"
              label="Language"
              sublabel="English"
              onPress={() => Alert.alert('Language', 'Additional languages coming in a future update.')}
              noBorder
            />
          </Section>

          <Section title="Campus & Content">
            <Row
              icon="school-outline"
              label="University"
              sublabel={profile?.university ?? 'Not set'}
              onPress={() => setShowEditProfile(true)}
            />
            <Row
              icon="book-outline"
              label="Major"
              sublabel={profile?.major ?? 'Not set'}
              onPress={() => setShowEditProfile(true)}
              noBorder
            />
          </Section>

          <Section title="Legal & Compliance">
            <Row icon="document-text-outline" label="Privacy Policy" onPress={onShowPrivacy} />
            <Row icon="reader-outline" label="Terms of Service" onPress={onShowTerms} />
            <Row icon="checkmark-shield-outline" label="Community Guidelines" onPress={onShowGuidelines} noBorder />
          </Section>

          <Section title="Support">
            <Row icon="help-circle-outline" label="Help & Support" sublabel="Contact us" onPress={handleHelp} />
            <Row icon="flag-outline" label="Report a Problem" sublabel="Send feedback to the team" onPress={handleReport} noBorder />
          </Section>

          <Section title="Account Management">
            <Row icon="log-out-outline" label="Log Out" danger onPress={handleLogout} />
            <Row icon="trash-outline" label="Delete Account" danger onPress={handleDeleteAccount} noBorder />
          </Section>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textMuted }]}>UniGram for Campus</Text>
            <Text style={[styles.footerText, { color: colors.textMuted }]}>Version 1.0.0 (Build 20260409)</Text>
            <Text style={[styles.footerText, { color: colors.textMuted, marginTop: 8 }]}>© 2026 UniGram. All rights reserved.</Text>
          </View>
        </ScrollView>
      </View>

      {/* Sub-modals */}
      <EditProfileModal
        visible={showEditProfile}
        profile={profile}
        onClose={() => setShowEditProfile(false)}
        onSaved={(updated: any) => { onProfileUpdated(updated); setShowEditProfile(false); }}
      />
      <PasswordModal visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
      <PrivacyModal
        visible={showPrivacyModal}
        profile={profile}
        onClose={() => setShowPrivacyModal(false)}
        onProfileUpdated={onProfileUpdated}
      />
      <BlockedModal visible={showBlockedModal} profile={profile} onClose={() => setShowBlockedModal(false)} />
    </Modal>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, marginHorizontal: 16, marginTop: 16, marginBottom: 8,
    borderRadius: 18, borderWidth: 1,
  },
  profileAvatar: { width: 60, height: 60, borderRadius: 30 },
  profileName: { fontSize: 16, fontWeight: '700' },
  profileUsername: { fontSize: 13, marginTop: 1 },
  editHint: { fontSize: 12, marginTop: 4 },

  section: { marginTop: 20, marginHorizontal: 16 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 },
  sectionBody: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '500' },
  rowSub: { fontSize: 11, marginTop: 1 },

  // Sub-modal shared
  subModalContainer: { flex: 1 },
  subModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  subModalTitle: { fontSize: 16, fontWeight: '700' },
  subModalCancel: { fontSize: 15 },
  subModalSave: { fontSize: 15, fontWeight: '700' },
  subModalBody: { padding: 20, gap: 4 },
  subModalHint: { fontSize: 14, lineHeight: 20, marginBottom: 20 },

  // Password modal
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginTop: 16 },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
  },
  passwordInput: { flex: 1, height: 50, fontSize: 15 },
  eyeBtn: { padding: 4 },
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    marginTop: 24, padding: 14, borderRadius: 12, borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },

  // Privacy modal
  privacyGroupLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
    textTransform: 'uppercase', marginTop: 20, marginBottom: 8,
  },
  privacyGroup: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  privacyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1,
  },
  privacyRowLabel: { fontSize: 14, fontWeight: '500' },
  privacyRowSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  privacyNote: { fontSize: 12, lineHeight: 18, marginTop: 16 },

  // Blocked modal
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  blockedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10,
  },
  blockedAvatar: { width: 44, height: 44, borderRadius: 22 },
  blockedName: { fontSize: 14, fontWeight: '600' },
  blockedUser: { fontSize: 12, marginTop: 1 },
  unblockBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  unblockText: { fontSize: 13, fontWeight: '600' },

  footer: { marginTop: 40, paddingHorizontal: 20, alignItems: 'center' },
  footerText: { fontSize: 12, lineHeight: 18 },
});
