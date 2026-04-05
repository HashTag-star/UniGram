import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList, TextInput,
  StyleSheet, Image, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CommentsSkeleton } from './Skeleton';
import { getPostComments, addPostComment, deletePostComment } from '../services/posts';
import { getReelComments, addReelComment } from '../services/reels';
import { useTheme } from '../context/ThemeContext';

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
  const { colors } = useTheme();
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
    
    // Optimistic update
    const tempId = 'temp-' + Date.now();
    const tempComment = {
      id: tempId,
      text: t,
      user_id: currentUserId,
      created_at: new Date().toISOString(),
      profiles: { username: 'Sending...', avatar_url: null },
    };
    setComments(prev => [...prev, tempComment]);
    onCountChange?.(1);

    try {
      const newComment = targetType === 'post'
        ? await addPostComment(targetId, currentUserId, t)
        : await addReelComment(targetId, currentUserId, t);
      setComments(prev => prev.map(c => c.id === tempId ? newComment : c));
    } catch (e) {
      setComments(prev => prev.filter(c => c.id !== tempId));
      onCountChange?.(-1);
      setText(t);
    }
  };

  const deleteComment = (comment: any) => {
    if (comment.user_id !== currentUserId) return;
    // Optimistic: remove immediately
    setComments(prev => prev.filter(c => c.id !== comment.id));
    onCountChange?.(-1);
    if (targetType === 'post') {
      deletePostComment(comment.id, currentUserId).catch(() => {
        setComments(prev => [...prev, comment].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ));
        onCountChange?.(1);
      });
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
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: insets.bottom || 16 }]}
        >
          {/* Handle */}
          <View style={styles.handle} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Comments</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <CommentsSkeleton />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={c => c.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 14, paddingBottom: 8 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="chatbubble-outline" size={40} color={colors.textMuted} />
                  <Text style={{ color: colors.textSub, marginTop: 10, fontSize: 14 }}>No comments yet</Text>
                  <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 12 }}>Be the first to comment!</Text>
                </View>
              }
              renderItem={({ item }) => {
                const profile = item.profiles;
                const isMe = item.user_id === currentUserId;
                return (
                  <View style={styles.commentRow}>
                    {profile?.avatar_url
                      ? <Image source={{ uri: profile.avatar_url }} style={styles.commentAvatar} />
                      : <View style={[styles.commentAvatar, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="person" size={14} color={colors.textMuted} />
                        </View>
                    }
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.commentUser, { color: colors.text }]}>{profile?.username ?? 'user'}</Text>
                        <Text style={[styles.commentTime, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
                        {isMe && (
                          <TouchableOpacity onPress={() => deleteComment(item)} style={{ marginLeft: 'auto' }}>
                            <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={[styles.commentText, { color: colors.textSub }]}>{item.text}</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Input */}
          <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]}
              value={text}
              onChangeText={setText}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textMuted}
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
                : <Ionicons name="send" size={18} color={text.trim() ? '#fff' : colors.textMuted} />
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
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '75%',
    minHeight: 300,
  },
  handle: { width: 40, height: 4, backgroundColor: 'rgba(128,128,128,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  commentRow: { flexDirection: 'row', marginBottom: 16 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentUser: { fontSize: 12, fontWeight: 'bold' },
  commentTime: { fontSize: 11 },
  commentText: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 14, maxHeight: 100,
  },
  sendBtn: { padding: 10, borderRadius: 20 },
  sendBtnActive: { backgroundColor: '#4f46e5' },
});
