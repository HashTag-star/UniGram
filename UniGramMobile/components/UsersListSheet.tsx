import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { CachedImage } from './CachedImage';
import { VerifiedBadge } from './VerifiedBadge';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  visible: boolean;
  title: string;
  users?: any[];
  fetchUsers?: () => Promise<any[]>;
  onClose: () => void;
  onUserPress?: (profile: any) => void;
}

export const UsersListSheet: React.FC<Props> = ({
  visible, title, users, fetchUsers, onClose, onUserPress,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    if (users) {
      setData(users);
      return;
    }
    if (!fetchUsers || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetchUsers()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  // Reset fetch guard when closed so re-open re-fetches fresh data
  useEffect(() => {
    if (!visible) fetchedRef.current = false;
  }, [visible]);

  // Keep data in sync when pre-loaded users change (profile re-fetches)
  useEffect(() => {
    if (users) setData(users);
  }, [users]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismiss} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color="#818cf8" />
            </View>
          ) : data.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="people-outline" size={40} color={colors.textMuted} style={{ marginBottom: 10 }} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Nobody here yet</Text>
            </View>
          ) : (
            <FlatList
              data={data}
              keyExtractor={(item, i) => item?.id ?? String(i)}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={() => {
                    onUserPress?.(item);
                    onClose();
                  }}
                >
                  {item?.avatar_url ? (
                    <CachedImage uri={item.avatar_url} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Ionicons name="person" size={18} color="#555" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
                        {item?.username ?? 'user'}
                      </Text>
                      {item?.is_verified && (
                        <VerifiedBadge type={item.verification_type} size="sm" />
                      )}
                    </View>
                    {!!item?.full_name && (
                      <Text style={[styles.fullName, { color: colors.textMuted }]} numberOfLines={1}>
                        {item.full_name}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  dismiss: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.75,
    overflow: 'hidden',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 16, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center' },
  username: { fontSize: 14, fontWeight: '600' },
  fullName: { fontSize: 12, marginTop: 1 },
  center: { height: 160, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14 },
});
