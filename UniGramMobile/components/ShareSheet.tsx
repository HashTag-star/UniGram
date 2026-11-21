// [Abena Owusu - Frontend] Fixed hardcoded sheet color, added keyboardShouldPersistTaps, theme token for sheet bg
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Modal,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConversations, sendSharedContent } from '../services/messages';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  content: {
    type: 'post' | 'reel';
    id: string;
    thumbnail?: string;
    username?: string;
  };
}

// [Abena Owusu - Frontend Dev] React.memo: prevents re-render when parent updates unrelated state
export const ShareSheet: React.FC<ShareSheetProps> = React.memo(({ visible, onClose, content }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const currentUserId = React.useRef<string>('');

  const getOtherProfile = (c: any) => {
    const participants = c.conversations?.conversation_participants ?? [];
    return participants.find((p: any) => p.user_id !== currentUserId.current)?.profiles ?? null;
  };

  useEffect(() => {
    if (visible) {
      loadConversations();
    }
  }, [visible]);

  const loadConversations = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      currentUserId.current = user.id;
      const data = await getConversations(user.id);
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations for sharing', err);
      // Show a friendly message for timeouts
      if ((err as any)?.name === 'SupabaseTimeoutError' && (err as any).userMessage) {
        showToast((err as any).userMessage, 'error');
      }
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const list = conversations.filter((c) => {
      const prof = getOtherProfile(c);
      const name = (prof?.full_name ?? '') + (prof?.username ?? '');
      const groupName = c.conversations?.group_name ?? '';
      return !query.trim() || name.toLowerCase().includes(query.toLowerCase()) || groupName.toLowerCase().includes(query.toLowerCase());
    });
    return list;
  }, [conversations, query]);

  const handleSend = async (convId: string) => {
    setSending(convId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      currentUserId.current = user.id;

      await sendSharedContent(
        convId,
        user.id,
        {
          type: content.type,
          id: content.id,
          previewUrl: content.thumbnail,
        }
      );
      showToast('Sent', 'success');
      onClose();
    } catch (err) {
      console.error('Failed to share content', err);
      if ((err as any)?.name === 'SupabaseTimeoutError' && (err as any).userMessage) {
        showToast((err as any).userMessage, 'error');
      } else {
        showToast('Couldn’t send. Try again.', 'error');
      }
    } finally {
      setSending(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismiss} onPress={onClose} activeOpacity={1} accessibilityLabel="Close share sheet" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20, backgroundColor: colors.bg }]}>
          <View style={styles.handle} />
          
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Send to</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close share" accessibilityRole="button">
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchBar, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search people..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              accessibilityLabel="Search people"
            />
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 40 }} color={colors.accent} />
          ) : loadError ? (
            <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
              <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontSize: 14 }}>Couldn't load your chats.</Text>
              <TouchableOpacity
                onPress={loadConversations}
                style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.accent, borderRadius: 8 }}
                accessibilityLabel="Try again"
                accessibilityRole="button"
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.conversations?.id ?? String(Math.random())}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, flexGrow: 1 }}
              ListEmptyComponent={
                <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
                  <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                    {query.trim() ? 'No matches' : 'No conversations yet'}
                  </Text>
                  {!query.trim() && (
                    <Text style={{ color: colors.textSub, fontSize: 12, textAlign: 'center', maxWidth: 240 }}>
                      Start a chat from someone's profile, then come back to share.
                    </Text>
                  )}
                </View>
              }
              renderItem={({ item }) => {
                const convId = item.conversations?.id;
                const isGroup = item.conversations?.is_group;
                const prof = getOtherProfile(item);
                const displayName = isGroup
                  ? (item.conversations?.group_name ?? 'Group')
                  : (prof?.full_name || prof?.username || 'Unknown');
                const username = isGroup ? null : prof?.username;
                const avatarUrl = isGroup ? null : prof?.avatar_url;
                return (
                  <View style={styles.userRow}>
                    <View style={styles.avatarWrap}>
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.placeholderAvatar, { backgroundColor: colors.bg2 }]}>
                          <Ionicons name={isGroup ? 'people' : 'person'} size={20} color={colors.textMuted} />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
                      {username ? <Text style={[styles.username, { color: colors.textMuted }]}>@{username}</Text> : null}
                    </View>
                    <TouchableOpacity
                      style={[styles.sendBtn, { backgroundColor: colors.accent }, sending === convId && { opacity: 0.5 }]}
                      onPress={() => convId && handleSend(convId)}
                      disabled={sending !== null}
                      accessibilityLabel={`Send to ${displayName}`}
                      accessibilityRole="button"
                    >
                      {sending === convId ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.sendText}>Send</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    // backgroundColor now applied via theme token inline style above
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.8,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    margin: 16,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 0,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  placeholderAvatar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  username: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 1,
  },
  sendBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  sendText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
