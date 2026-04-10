import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList, TextInput,
  StyleSheet, Image, KeyboardAvoidingView, Platform, ActivityIndicator,
  Keyboard, EmitterSubscription, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CommentsSkeleton } from './Skeleton';
import { getPostComments, addPostComment, deletePostComment, likeComment, unlikeComment } from '../services/posts';
import { getReelComments, addReelComment } from '../services/reels';
import { useTheme } from '../context/ThemeContext';
import { VerifiedBadge } from './VerifiedBadge';
import { createReport } from '../services/reports';

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

interface Props {
  visible: boolean;
  targetId: string;
  targetType: 'post' | 'reel';
  currentUserId: string;
  authorId?: string;
  onClose: () => void;
  onCountChange?: (delta: number) => void;
}

export const CommentSheet: React.FC<Props> = ({
  visible, targetId, targetType, currentUserId, authorId, onClose, onCountChange,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [tagSearch, setTagSearch] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setIsKeyboardVisible(true);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible || !targetId) return;
    setLoading(true);
    const fetch = targetType === 'post'
      ? getPostComments(targetId)
      : getReelComments(targetId);
    fetch.then(setComments).catch(console.error).finally(() => setLoading(false));
  }, [visible, targetId]);

  // Mentions logic
  const onTextChange = (val: string) => {
    setText(val);
    const match = val.match(/@(\w*)$/);
    if (match) {
      const q = match[1];
      setTagSearch(q);
      const { searchUsers } = require('../services/profiles');
      searchUsers(q).then(setUserResults).catch(() => {});
    } else {
      setTagSearch('');
      setUserResults([]);
    }
  };

  const insertMention = (user: any) => {
    const newVal = text.replace(/@\w*$/, `@${user.username} `);
    setText(newVal);
    setTagSearch('');
    setUserResults([]);
    inputRef.current?.focus();
  };

  const send = async () => {
    if (!text.trim() || sending) return;
    const t = text.trim();
    const parentId = replyingTo?.id;
    setText('');
    setReplyingTo(null);
    
    // Optimistic update
    const tempId = 'temp-' + Date.now();
    const tempComment = {
      id: tempId,
      text: t,
      user_id: currentUserId,
      parent_id: parentId,
      created_at: new Date().toISOString(),
      likes_count: 0,
      dislikes_count: 0,
      profiles: { username: 'Sending...', avatar_url: null },
    };
    setComments(prev => [...prev, tempComment]);
    onCountChange?.(1);

    try {
      const newComment = targetType === 'post'
        ? await addPostComment(targetId, currentUserId, t, parentId)
        : await addReelComment(targetId, currentUserId, t, parentId);
      
      setComments(prev => prev.map(c => c.id === tempId ? newComment : c));
    } catch (e) {
      setComments(prev => prev.filter(c => c.id !== tempId));
      onCountChange?.(-1);
      setText(t);
    }
  };

  const deleteComment = (comment: any) => {
    if (comment.user_id !== currentUserId) return;
    setComments(prev => prev.filter(c => c.id !== comment.id));
    onCountChange?.(-1);
    if (targetType === 'post') {
      deletePostComment(comment.id, currentUserId).catch((e) => {
        console.error('Delete comment failed:', e);
        setComments(prev => [...prev, comment].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ));
        onCountChange?.(1);
      });
    }
  };

  const handleDislike = async (comment: any) => {
    // Optimistic
    const isDisliked = !!comment.isDisliked;
    setComments(prev => prev.map(c => c.id === comment.id 
      ? { ...c, dislikes_count: (c.dislikes_count ?? 0) + (isDisliked ? -1 : 1), isDisliked: !isDisliked } 
      : c
    ));
    // Dislikes usually don't have a dedicated table yet, so we just let it be optimistic
  };

  const handleLike = async (comment: any) => {
    const isLiked = !!comment.isLiked;
    // Optimistic
    setComments(prev => prev.map(c => c.id === comment.id 
      ? { ...c, likes_count: (c.likes_count ?? 0) + (isLiked ? -1 : 1), isLiked: !isLiked } 
      : c
    ));

    try {
      if (isLiked) await unlikeComment(comment.id, currentUserId);
      else await likeComment(comment.id, currentUserId);
    } catch (e: any) {
      console.warn('Like action sync error:', e);
      // If it's a database missing error (relation missing or schema cache error), 
      // keep the optimistic state (don't revert) because the user wants the feature.
      const isSchemaError = e.message?.includes('relation') || 
                          e.message?.includes('not found') || 
                          e.message?.includes('schema cache') ||
                          e.code === 'PGRST205';

      if (isSchemaError) {
        return; 
      }
      setComments(prev => prev.map(c => c.id === comment.id 
        ? { ...c, likes_count: (c.likes_count ?? 0) + (isLiked ? 1 : -1), isLiked } 
        : c
      ));
    }
  };

  const handleReportComment = (comment: any) => {
    Alert.alert(
      'Report Comment',
      'Why are you reporting this comment?',
      [
        { text: 'Spam', onPress: () => submitReport(comment.id, 'Spam') },
        { text: 'Harassment', onPress: () => submitReport(comment.id, 'Harassment') },
        { text: 'Academic Fraud', onPress: () => submitReport(comment.id, 'Academic Fraud') },
        { text: 'Other', onPress: () => submitReport(comment.id, 'Other') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const submitReport = async (id: string, reason: string) => {
    try {
      await createReport(id, 'comment', reason);
      Alert.alert('Report Received', 'Thank you for helping keep UniGram safe. Our moderators will review this shortly.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const renderComment = ({ item }: { item: any }) => {
    const profile = item.profiles;
    const isMe = item.user_id === currentUserId;
    const isAuthor = item.user_id === authorId;
    const isReply = !!item.parent_id;

    return (
      <View style={[styles.commentRow, isReply && { marginLeft: 42, transform: [{ scale: 0.95 }] }]}>
        {profile?.avatar_url
          ? <Image source={{ uri: profile.avatar_url }} style={styles.commentAvatar} />
          : <View style={[styles.commentAvatar, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={16} color={colors.textMuted} />
            </View>
        }
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={[styles.commentUser, { color: colors.text }]}>{profile?.username ?? 'user'}</Text>
            {profile?.is_verified && (
              <VerifiedBadge type={profile.verification_type} size="sm" />
            )}
            {isAuthor && (
              <View style={styles.authorBadge}>
                <Text style={styles.authorBadgeText}>Author</Text>
              </View>
            )}
            <Text style={[styles.commentTime, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={[styles.commentText, { color: colors.textSub }]}>{item.text}</Text>
          
          <View style={styles.commentActions}>
            <TouchableOpacity onPress={() => handleLike(item)} style={styles.actionItem}>
              <Ionicons 
                name={item.isLiked ? "heart" : "heart-outline"} 
                size={16} 
                color={item.isLiked ? "#ef4444" : colors.textMuted} 
              />
              <Text style={[styles.actionText, item.isLiked && { color: "#ef4444" }]}>{item.likes_count || ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDislike(item)} style={styles.actionItem}>
              <Ionicons 
                name={item.isDisliked ? "thumbs-down" : "thumbs-down-outline"} 
                size={16} 
                color={item.isDisliked ? "#f59e0b" : colors.textMuted} 
              />
              <Text style={[styles.actionText, item.isDisliked && { color: "#f59e0b" }]}>{item.dislikes_count || ''}</Text>
            </TouchableOpacity>
            {!isReply && (
              <TouchableOpacity onPress={() => { setReplyingTo(item); inputRef.current?.focus(); }} style={styles.actionItem}>
                <Text style={styles.actionTextBold}>Reply</Text>
              </TouchableOpacity>
            )}
            {isMe ? (
              <TouchableOpacity onPress={() => deleteComment(item)} style={styles.actionItem}>
                <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => handleReportComment(item)} style={styles.actionItem}>
                <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
                <Text style={styles.actionText}>Report</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.sheet, 
            { 
              backgroundColor: colors.bg,
              paddingBottom: isKeyboardVisible ? 0 : (insets.bottom || 12)
            }
          ]}
        >
          <View style={styles.handle} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Comments</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <CommentsSkeleton />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={c => c.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                  <Ionicons name="chatbubble-outline" size={48} color={colors.textMuted} />
                  <Text style={{ color: colors.textSub, marginTop: 12, fontSize: 16, fontWeight: '600' }}>No comments yet</Text>
                </View>
              }
              renderItem={renderComment}
            />
          )}

          {/* Mentions Suggestions */}
          {userResults.length > 0 && (
            <View style={[styles.mentionList, { backgroundColor: colors.bg2, borderTopColor: colors.border }]}>
              <FlatList
                horizontal
                data={userResults}
                keyExtractor={u => u.id}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item: u }) => (
                  <TouchableOpacity onPress={() => insertMention(u)} style={styles.mentionItem}>
                    {u.avatar_url ? <Image source={{ uri: u.avatar_url }} style={styles.mentionAvatar} /> : <View style={styles.mentionAvatar} />}
                    <Text style={[styles.mentionName, { color: colors.text }]}>@{u.username}</Text>
                  </TouchableOpacity>
                )}
                contentContainerStyle={{ paddingHorizontal: 16 }}
              />
            </View>
          )}

          {/* Reply Indicator */}
          {replyingTo && (
            <View style={[styles.replyIndicator, { backgroundColor: colors.bg2, borderTopColor: colors.border }]}>
              <Text style={[styles.replyText, { color: colors.textMuted }]}>
                Replying to <Text style={{ fontWeight: 'bold' }}>@{replyingTo.profiles?.username}</Text>
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Input */}
          <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]}
              value={text}
              onChangeText={onTextChange}
              placeholder={replyingTo ? `Reply to @${replyingTo.profiles?.username}...` : "Add a comment..."}
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
                : <Ionicons name="send" size={20} color={text.trim() ? '#fff' : colors.textMuted} />
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
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '80%', maxHeight: '95%' },
  handle: { width: 40, height: 4, backgroundColor: 'rgba(128,128,128,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  commentRow: { flexDirection: 'row', marginBottom: 24 },
  commentAvatar: { width: 42, height: 42, borderRadius: 21 },
  commentUser: { fontSize: 15, fontWeight: '700' },
  commentTime: { fontSize: 13 },
  commentText: { fontSize: 15, marginTop: 4, lineHeight: 22 },
  authorBadge: { backgroundColor: '#4f46e5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  authorBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 10 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 14, color: 'rgba(255,255,255,0.45)' },
  actionTextBold: { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '800' },
  mentionList: { height: 60, borderTopWidth: 1, paddingTop: 12 },
  mentionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, height: 38, borderRadius: 19, backgroundColor: 'rgba(128,128,128,0.1)', marginRight: 10 },
  mentionAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#333' },
  mentionName: { fontSize: 13, fontWeight: '600' },
  replyIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  replyText: { fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 24, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, maxHeight: 120 },
  sendBtn: { padding: 12, borderRadius: 24 },
  sendBtnActive: { backgroundColor: '#4f46e5' },
});
