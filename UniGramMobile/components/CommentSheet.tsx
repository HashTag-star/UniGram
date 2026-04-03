import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList, TextInput,
  StyleSheet, Image, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getPostComments, addPostComment, deletePostComment } from '../services/posts';
import { getReelComments, addReelComment } from '../services/reels';

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

interface Props {
  visible: boolean;
  targetId: string;          // post_id or reel_id
  targetType: 'post' | 'reel';
  currentUserId: string;
  onClose: () => void;
  onCountChange?: (delta: number) => void;
}

export const CommentSheet: React.FC<Props> = ({
  visible, targetId, targetType, currentUserId, onClose, onCountChange,
}) => {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible || !targetId) return;
    setLoading(true);
    const fetch = targetType === 'post'
      ? getPostComments(targetId)
      : getReelComments(targetId);
    fetch.then(setComments).catch(console.error).finally(() => setLoading(false));
  }, [visible, targetId]);

  const send = async () => {
    if (!text.trim() || sending) return;
    const t = text.trim();
    setText('');
    setSending(true);
    try {
      const newComment = targetType === 'post'
        ? await addPostComment(targetId, currentUserId, t)
        : await addReelComment(targetId, currentUserId, t);
      setComments(prev => [...prev, newComment]);
      onCountChange?.(1);
    } catch (e) {
      setText(t);
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (comment: any) => {
    if (comment.user_id !== currentUserId) return;
    try {
      if (targetType === 'post') await deletePostComment(comment.id, currentUserId);
      setComments(prev => prev.filter(c => c.id !== comment.id));
      onCountChange?.(-1);
    } catch {}
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.sheet, { paddingBottom: insets.bottom || 16 }]}
        >
          {/* Handle */}
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Comments</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color="#818cf8" />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={c => c.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 14, paddingBottom: 8 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="chatbubble-outline" size={40} color="#333" />
                  <Text style={{ color: '#555', marginTop: 10, fontSize: 14 }}>No comments yet</Text>
                  <Text style={{ color: '#444', marginTop: 4, fontSize: 12 }}>Be the first to comment!</Text>
                </View>
              }
              renderItem={({ item }) => {
                const profile = item.profiles;
                const isMe = item.user_id === currentUserId;
                return (
                  <View style={styles.commentRow}>
                    {profile?.avatar_url
                      ? <Image source={{ uri: profile.avatar_url }} style={styles.commentAvatar} />
                      : <View style={[styles.commentAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="person" size={14} color="#555" />
                        </View>
                    }
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.commentUser}>{profile?.username ?? 'user'}</Text>
                        <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
                        {isMe && (
                          <TouchableOpacity onPress={() => deleteComment(item)} style={{ marginLeft: 'auto' }}>
                            <Ionicons name="trash-outline" size={14} color="rgba(255,255,255,0.25)" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={styles.commentText}>{item.text}</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Input */}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Add a comment..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              returnKeyType="send"
              onSubmitEditing={send}
              multiline
            />
            <TouchableOpacity
              onPress={send}
              disabled={!text.trim() || sending}
              style={[styles.sendBtn, text.trim() && !sending && styles.sendBtnActive]}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={18} color={text.trim() ? '#fff' : 'rgba(255,255,255,0.25)'} />
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '75%',
    minHeight: 300,
  },
  handle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  title: { fontSize: 15, fontWeight: '700', color: '#fff' },
  commentRow: { flexDirection: 'row', marginBottom: 16 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentUser: { fontSize: 12, fontWeight: 'bold', color: '#fff' },
  commentTime: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  commentText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 3, lineHeight: 18 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14, paddingVertical: 9,
    color: '#fff', fontSize: 14, maxHeight: 100,
  },
  sendBtn: { padding: 10, borderRadius: 20 },
  sendBtnActive: { backgroundColor: '#4f46e5' },
});
