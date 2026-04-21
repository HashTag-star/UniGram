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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConversations, sendSharedContent } from '../services/messages';
import { supabase } from '../lib/supabase';

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

export const ShareSheet: React.FC<ShareSheetProps> = ({ visible, onClose, content }) => {
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      currentUserId.current = user.id;
      const data = await getConversations(user.id);
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations for sharing', err);
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
      onClose();
    } catch (err) {
      console.error('Failed to share content', err);
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
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismiss} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handle} />
          
          <View style={styles.header}>
            <Text style={styles.title}>Send to</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search people..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 40 }} color="#6366f1" />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.conversations?.id ?? String(Math.random())}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
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
                        <View style={styles.placeholderAvatar}>
                          <Ionicons name={isGroup ? 'people' : 'person'} size={20} color="#555" />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.name}>{displayName}</Text>
                      {username ? <Text style={styles.username}>@{username}</Text> : null}
                    </View>
                    <TouchableOpacity
                      style={[styles.sendBtn, sending === convId && { opacity: 0.5 }]}
                      onPress={() => convId && handleSend(convId)}
                      disabled={sending !== null}
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
    </Modal>
  );
};

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
    backgroundColor: '#1c1c1c',
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
