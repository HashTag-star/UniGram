import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput,
  StyleSheet, Image, KeyboardAvoidingView, Platform, ActivityIndicator,
  Keyboard, Alert, Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { CommentsSkeleton } from './Skeleton';
import { getPostComments, addPostComment, deletePostComment, likeComment, unlikeComment } from '../services/posts';
import { getReelComments, addReelComment } from '../services/reels';
import { useTheme } from '../context/ThemeContext';
import { VerifiedBadge } from './VerifiedBadge';
import { createReport } from '../services/reports';

const { width } = Dimensions.get('window');

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
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const snapPoints = useMemo(() => ['50%', '95%'], []);

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
      loadComments();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible, targetId]);

  const loadComments = async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const data = targetType === 'post'
        ? await getPostComments(targetId)
        : await getReelComments(targetId);
      setComments(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
    Haptics.selectionAsync();
  };

  const handleLike = async (comment: any) => {
    const isLiked = !!comment.isLiked;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    setComments(prev => prev.map(c => c.id === comment.id 
      ? { ...c, likes_count: (c.likes_count ?? 0) + (isLiked ? -1 : 1), isLiked: !isLiked } 
      : c
    ));

    try {
      if (isLiked) await unlikeComment(comment.id, currentUserId);
      else await likeComment(comment.id, currentUserId);
    } catch (e: any) {
      setComments(prev => prev.map(c => c.id === comment.id 
        ? { ...c, likes_count: (c.likes_count ?? 0) + (isLiked ? 1 : -1), isLiked } 
        : c
      ));
    }
  };

  const send = async () => {
    if (!text.trim() || sending) return;
    const t = text.trim();
    const parentId = replyingTo?.id;
    setText('');
    setReplyingTo(null);
    setSending(true);

    // Optimistic
    const tempId = 'temp-' + Date.now();
    const tempComment = {
      id: tempId,
      text: t,
      user_id: currentUserId,
      parent_id: parentId,
      created_at: new Date().toISOString(),
      likes_count: 0,
      profiles: { username: 'Sending...', avatar_url: null },
    };
    
    setComments(prev => [...prev, tempComment]);
    onCountChange?.(1);
    if (parentId) {
      setExpandedParents(prev => {
        const next = new Set(prev);
        next.add(parentId);
        return next;
      });
    }

    try {
      const newComment = targetType === 'post'
        ? await addPostComment(targetId, currentUserId, t, parentId)
        : await addReelComment(targetId, currentUserId, t, parentId);
      
      setComments(prev => prev.map(c => c.id === tempId ? newComment : c));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setComments(prev => prev.filter(c => c.id !== tempId));
      onCountChange?.(-1);
      setText(t);
    } finally {
      setSending(false);
    }
  };
 
  const handleDeleteComment = (comment: any) => {
    Alert.alert('Delete comment?', 'This will permanently remove your comment.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          setComments(prev => prev.filter(c => c.id !== comment.id));
          onCountChange?.(-1);
          await deletePostComment(comment.id, currentUserId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) {
          Alert.alert('Error', 'Could not delete comment.');
          loadComments(); // Rollback
        }
      }}
    ]);
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsAt={-1}
        appearsAt={0}
        opacity={0.5}
      />
    ),
    []
  );

  // Hierarchical data prep: Build a tree for nested expansion
  const commentTree = useMemo(() => {
    const map: Record<string, any[]> = {};
    const roots: any[] = [];
    
    // Sort by date first to ensure order
    const sorted = [...comments].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    sorted.forEach(c => {
      if (c.parent_id) {
        if (!map[c.parent_id]) map[c.parent_id] = [];
        map[c.parent_id].push(c);
      } else {
        roots.push(c);
      }
    });
    return { roots, childrenMap: map };
  }, [comments]);

  const renderComment = ({ item, depth = 0 }: { item: any, depth?: number }) => {
    const profile = item.profiles;
    const isAuthor = item.user_id === authorId;
    const replies = commentTree.childrenMap[item.id] || [];
    const isExpanded = expandedParents.has(item.id);

    return (
      <View key={item.id} style={[styles.commentGroup, depth > 0 && { marginLeft: depth * 24, marginBottom: 12 }]}>
        <View style={styles.commentRow}>
          {profile?.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={[styles.commentAvatar, depth > 0 && { width: 28, height: 28 }]} />
            : <View style={[styles.commentAvatar, depth > 0 && { width: 28, height: 28 }, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={depth > 0 ? 12 : 16} color={colors.textMuted} />
              </View>
          }
          <View style={{ flex: 1, marginLeft: depth > 0 ? 8 : 12 }}>
            <View style={styles.commentHeader}>
              <Text style={[styles.commentUser, { color: colors.text, fontSize: depth > 0 ? 13 : 14 }]}>{profile?.username ?? 'user'}</Text>
              {profile?.is_verified && <VerifiedBadge type={profile.verification_type} size="sm" />}
              {isAuthor && depth === 0 && (
                <View style={styles.authorBadge}>
                  <Text style={styles.authorBadgeText}>Author</Text>
                </View>
              )}
              <Text style={[styles.commentTime, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
            </View>
            <Text style={[styles.commentText, { color: colors.textSub, fontSize: depth > 0 ? 13 : 14 }]}>{item.text}</Text>
            
            <View style={styles.commentActions}>
              <TouchableOpacity onPress={() => handleLike(item)} style={styles.actionItem}>
                <Ionicons 
                  name={item.isLiked ? "heart" : "heart-outline"} 
                  size={depth > 0 ? 12 : 16} 
                  color={item.isLiked ? "#ef4444" : colors.textMuted} 
                />
                <Text style={[styles.actionText, item.isLiked && { color: "#ef4444" }]}>{item.likes_count || ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => { 
                   setReplyingTo(item); 
                   setText(`@${profile?.username} `);
                }} 
                style={styles.actionItem}
              >
                <Text style={styles.actionTextBold}>Reply</Text>
              </TouchableOpacity>
              
              {item.user_id === currentUserId && (
                <TouchableOpacity onPress={() => handleDeleteComment(item)} style={styles.actionItem}>
                  <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Expansion Toggle */}
            {replies.length > 0 && (
              <TouchableOpacity style={styles.repliesToggle} onPress={() => toggleExpand(item.id)}>
                <View style={[styles.repliesLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.repliesToggleText, { color: colors.textMuted }]}>
                  {isExpanded ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                </Text>
              </TouchableOpacity>
            )}

            {/* True Nested Expansion Rendering */}
            {isExpanded && replies.map(reply => (
              renderComment({ item: reply, depth: depth + 1 })
            ))}
          </View>
        </View>
      </View>
    );
  };

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={1}
      snapPoints={snapPoints}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      backgroundStyle={{ backgroundColor: colors.bg }}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <View style={{ flex: 1 }}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.title, { color: colors.text }]}>Comments</Text>
        </View>

        <BottomSheetFlatList
          data={commentTree.roots}
          keyExtractor={c => c.id}
          renderItem={renderComment}
          contentContainerStyle={{ padding: 16, paddingBottom: 150 }}
          ListHeaderComponent={
            <>
              {/* AI Highlight Placeholder */}
              <View style={[styles.aiHighlight, { backgroundColor: colors.bg2, borderColor: colors.accent + '20' }]}>
                <View style={styles.aiHeader}>
                  <Ionicons name="sparkles" size={16} color={colors.accent} />
                  <Text style={[styles.aiTitle, { color: colors.accent }]}>AI Highlights</Text>
                </View>
                <Text style={[styles.aiText, { color: colors.textMuted }]}>
                  Analyzing conversations... Key points will appear here as we integrate our Unigram AI engine.
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={
            loading ? <CommentsSkeleton /> : (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Ionicons name="chatbubble-outline" size={48} color={colors.textMuted} />
                <Text style={{ color: colors.textSub, marginTop: 12, fontSize: 16, fontWeight: '600' }}>No comments yet</Text>
              </View>
            )
          }
        />

        {/* Input Bar: Anchored to bottom of sheet */}
        <View style={[styles.footer, { backgroundColor: colors.bg, borderTopColor: colors.border, paddingBottom: (insets.bottom || 12) }]}>
          {replyingTo && (
            <View style={[styles.replyHeader, { backgroundColor: colors.bg2 }]}>
              <Text style={{ color: colors.textSub, fontSize: 13 }}>Replying to @{replyingTo.profiles?.username}</Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputRow}>
            <BottomSheetTextInput
              style={[styles.input, { backgroundColor: colors.bg2, color: colors.text, borderColor: colors.border }]}
              value={text}
              onChangeText={setText}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <TouchableOpacity 
              style={[styles.sendBtn, text.trim() ? styles.sendBtnActive : { opacity: 0.5 }]}
              onPress={send}
              disabled={!text.trim() || sending}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  sheetHeader: { paddingVertical: 12, alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.1)' },
  title: { fontSize: 16, fontWeight: '700' },
  commentGroup: { marginBottom: 20 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start' },
  commentAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  commentUser: { fontSize: 14, fontWeight: '700' },
  commentTime: { fontSize: 12 },
  commentText: { fontSize: 14, lineHeight: 19 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12 },
  actionTextBold: { fontSize: 12, fontWeight: '700' },
  authorBadge: { backgroundColor: '#6366f1', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  authorBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  
  repliesToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginLeft: 0 },
  repliesLine: { width: 30, height: 1, marginRight: 10 },
  repliesToggleText: { fontSize: 12, fontWeight: '600' },
  
  replyRow: { flexDirection: 'row', marginTop: 14, marginLeft: 0 },
  
  aiHighlight: { margin: 16, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  aiTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  aiText: { fontSize: 12, fontStyle: 'italic', lineHeight: 16 },

  footer: { borderTopWidth: 0.5, backgroundColor: '#000' },
  replyHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10 },
  input: { flex: 1, minHeight: 40, maxHeight: 100, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { opacity: 1 }
});
