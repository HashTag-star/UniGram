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
} from '../../../services/permissions';
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
            <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.btnGradient}>
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
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 16, paddingBottom: 8 },
  backBtn: { padding: 4, marginBottom: 2 },
  stepLabel: { fontSize: 11, color: '#4f46e5', fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', marginTop: 2 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 28, lineHeight: 18 },
  permList: { gap: 14, flex: 1 },
  permCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#0d0d0d', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1a1a1a' },
  permIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  permInfo: { flex: 1 },
  permTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  permDesc: { fontSize: 11, color: '#555', marginTop: 2, lineHeight: 15 },
  permBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#1e1e2e', borderRadius: 20, borderWidth: 1, borderColor: '#2a2a3a', minWidth: 60, alignItems: 'center' },
  permBtnGranted: { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)' },
  permBtnText: { color: '#818cf8', fontSize: 13, fontWeight: '600' },
  allowAllBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  allowAllText: { color: '#818cf8', fontSize: 13, fontWeight: '600' },
  bottom: { paddingBottom: 32, gap: 10 },
  btn: { borderRadius: 14, overflow: 'hidden' },
  btnGradient: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  note: { color: 'rgba(255,255,255,0.2)', fontSize: 11, textAlign: 'center' },
});
