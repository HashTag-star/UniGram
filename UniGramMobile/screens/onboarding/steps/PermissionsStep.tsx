import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  requestCameraPermission,
  requestMediaLibraryPermission,
  requestNotificationPermission,
  goToSettings,
} from '../../../services/permissions';
import { usePopup } from '../../../context/PopupContext';
import { completeOnboarding } from '../../../services/onboarding';
import { registerForPushNotifications } from '../../../services/pushNotifications';
import { useHaptics } from '../../../hooks/useHaptics';

interface Permission {
  id: string;
  icon: string;
  title: string;
  description: string;
  color: string;
  required: boolean;
}

const PERMISSIONS: Permission[] = [
  {
    id: 'notifications',
    icon: 'notifications-outline',
    title: 'Push Notifications',
    description: 'Get notified when someone likes, comments or follows you.',
    color: '#f59e0b',
    required: false,
  },
  {
    id: 'camera',
    icon: 'camera-outline',
    title: 'Camera',
    description: 'Take photos and videos for stories, posts, and reels.',
    color: '#3b82f6',
    required: false,
  },
  {
    id: 'photos',
    icon: 'images-outline',
    title: 'Photo Library',
    description: 'Share photos from your gallery to posts and marketplace.',
    color: '#22c55e',
    required: false,
  },
];

interface Props {
  userId: string;
  onNext: () => void;
  onBack: () => void;
}

export function PermissionsStep({ userId, onNext, onBack }: Props) {
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [requesting, setRequesting] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const { showPopup } = usePopup();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { success, light } = useHaptics();

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const requestPermission = async (id: string) => {
    await light();
    setRequesting(id);
    let ok = false;
    try {
      if (id === 'notifications') {
        ok = await requestNotificationPermission();
        if (ok) await registerForPushNotifications(userId);
      } else if (id === 'camera') {
        ok = await requestCameraPermission();
      } else if (id === 'photos') {
        ok = await requestMediaLibraryPermission();
      }
      if (ok) {
        setGranted(prev => new Set([...prev, id]));
        await success();
      } else {
        showPopup({
          title: 'Permission Required',
          message: `UniGram needs access to ${id} to work properly. Please enable it in Settings.`,
          icon: id === 'notifications' ? 'notifications-outline' : id === 'camera' ? 'camera-outline' : 'images-outline',
          buttons: [
            { text: 'Cancel', style: 'cancel', onPress: () => {} },
            { text: 'Open Settings', onPress: () => goToSettings() }
          ]
        });
      }
    } catch { } finally {
      setRequesting(null);
    }
  };

  const requestAll = async () => {
    for (const p of PERMISSIONS) {
      if (!granted.has(p.id)) await requestPermission(p.id);
    }
  };

  const handleFinish = async () => {
    setCompleting(true);
    try {
      await completeOnboarding(userId);
      await success();
      onNext();
    } catch { onNext(); } finally {
      setCompleting(false);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <View>
          <Text style={styles.stepLabel}>Step 5 of 5</Text>
          <Text style={styles.title}>Enable features</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Allow these to get the full UniGram experience. All permissions are optional.
      </Text>

      <View style={styles.permList}>
        {PERMISSIONS.map(perm => {
          const isGranted = granted.has(perm.id);
          const isRequesting = requesting === perm.id;
          return (
            <Animated.View key={perm.id} style={styles.permCard}>
              <View style={[styles.permIcon, { backgroundColor: perm.color + '20' }]}>
                <Ionicons name={perm.icon as any} size={24} color={perm.color} />
              </View>
              <View style={styles.permInfo}>
                <Text style={styles.permTitle}>{perm.title}</Text>
                <Text style={styles.permDesc}>{perm.description}</Text>
              </View>
              <TouchableOpacity
                style={[styles.permBtn, isGranted && styles.permBtnGranted]}
                onPress={() => requestPermission(perm.id)}
                disabled={isGranted || isRequesting}
              >
                {isRequesting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : isGranted ? (
                  <Ionicons name="checkmark" size={18} color="#22c55e" />
                ) : (
                  <Text style={styles.permBtnText}>Allow</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      <TouchableOpacity style={styles.allowAllBtn} onPress={requestAll}>
        <Text style={styles.allowAllText}>Allow All Permissions</Text>
      </TouchableOpacity>

      <View style={styles.bottom}>
        <TouchableOpacity style={styles.btn} onPress={handleFinish} disabled={completing}>
          {completing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <LinearGradient colors={['#8b5cf6', '#6366f1']} start={{x:0, y:0}} end={{x:1, y:1}} style={styles.btnGradient}>
              <Text style={styles.btnText}>🎉 Enter UniGram</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
        <Text style={styles.note}>You can change permissions anytime in Settings.</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b', paddingHorizontal: 28 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 16, paddingBottom: 8 },
  backBtn: { padding: 4, marginBottom: 2 },
  stepLabel: { fontSize: 12, color: '#8b5cf6', fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900', color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 32, lineHeight: 22, marginTop: 4 },
  permList: { gap: 16, flex: 1 },
  permCard: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#18181b', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#27272a', shadowColor: '#000', shadowOffset: { width:0, height:4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  permIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  permInfo: { flex: 1 },
  permTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  permDesc: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4, lineHeight: 18, fontWeight: '500' },
  permBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#27272a', borderRadius: 20, borderWidth: 1, borderColor: '#3f3f46', minWidth: 68, alignItems: 'center' },
  permBtnGranted: { backgroundColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.4)' },
  permBtnText: { color: '#a855f7', fontSize: 14, fontWeight: '700' },
  allowAllBtn: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  allowAllText: { color: '#a855f7', fontSize: 15, fontWeight: '700' },
  bottom: { paddingBottom: 36, gap: 12 },
  btn: { borderRadius: 20, overflow: 'hidden', shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  btnGradient: { alignItems: 'center', justifyContent: 'center', paddingVertical: 18 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  note: { color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', fontWeight: '500' },
});
