import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, FlatList, TouchableOpacity, ActivityIndicator, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { fx } from '../lib/feedback';
import { friendlyError } from '../lib/friendlyError';
import { CachedImage } from './CachedImage';
import { EmptyState } from './EmptyState';
import { listIncoming, approve, deny, IncomingRequest } from '../services/followRequests';

interface Props {
  visible: boolean;
  onClose: () => void;
  onChanged?: (remaining: number) => void;
}

export const FollowRequestsSheet: React.FC<Props> = ({ visible, onClose, onChanged }) => {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await listIncoming());
    setLoading(false);
  }, []);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const act = async (r: IncomingRequest, kind: 'approve' | 'deny') => {
    setBusyId(r.requester_id);
    try {
      if (kind === 'approve') await approve(r.requester_id); else await deny(r.requester_id);
      fx.success();
      const next = items.filter(i => i.requester_id !== r.requester_id);
      setItems(next);
      onChanged?.(next.length);
    } catch (e) {
      fx.error();
      showToast(friendlyError(e), 'error');
    } finally { setBusyId(null); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <TouchableWithoutFeedback>
            <View style={{ height: '70%', backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Follow requests</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Close follow requests">
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              {loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
              ) : (
                <FlatList
                  data={items}
                  keyExtractor={i => i.requester_id}
                  ListEmptyComponent={<EmptyState icon="person-add-outline" title="No pending requests" subtitle="When someone asks to follow your private account, it shows up here." />}
                  renderItem={({ item }) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 }}>
                      <CachedImage uri={item.profile?.avatar_url} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.card }} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '700' }}>{item.profile?.full_name || item.profile?.username || 'Student'}</Text>
                        <Text numberOfLines={1} style={{ color: colors.textSub, fontSize: 12 }}>@{item.profile?.username ?? 'unknown'}</Text>
                      </View>
                      {busyId === item.requester_id ? <ActivityIndicator color={colors.accent} /> : (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity onPress={() => act(item, 'approve')} accessibilityRole="button" accessibilityLabel={`Approve ${item.profile?.username ?? 'request'}`}
                            style={{ minHeight: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Approve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => act(item, 'deny')} accessibilityRole="button" accessibilityLabel={`Deny ${item.profile?.username ?? 'request'}`}
                            style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>Deny</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                />
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default FollowRequestsSheet;
