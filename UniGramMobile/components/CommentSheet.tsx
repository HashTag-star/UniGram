import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, ActivityIndicator, Alert, ActionSheetIOS, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetFlatList,
  BottomSheetFooter,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { CommentsSkeleton } from './Skeleton';
import {
  getPostComments, addPostComment, deletePostComment,
  likeComment, unlikeComment,
} from '../services/posts';
import {
  getReelComments, addReelComment,
  deleteReelComment, likeReelComment, unlikeReelComment,
} from '../services/reels';
import { useTheme } from '../context/ThemeContext';
import { VerifiedBadge } from './VerifiedBadge';
import { createReport } from '../services/reports';
import { CachedImage } from './CachedImage';
import { useHaptics } from '../hooks/useHaptics';
import { usePopup } from '../context/PopupContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

function renderMentions(text: string, colors: any): React.ReactNode {
  if (!text?.includes('@')) return text;
  return text.split(/(@\w+)/g).map((part, i) =>
    part.startsWith('@')
      ? <Text key={i} style={{ color: '#818cf8', fontWeight: '700' }}>{part}</Text>
      : <Text key={i}>{part}</Text>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  targetId: string;
  targetType: 'post' | 'reel';
  currentUserId: string;
  authorId?: string;
  onClose: () => void;
  onCountChange?: (delta: number) => void;
  /** Called once after comments load with the true count — lets parent sync its badge */
  onCountSync?: (count: number) => void;
}

interface CommentRowProps {
  item: any;
  depth: number;
  currentUserId: string;
  authorId?: string;
  colors: any;
  expandedParents: Set<string>;
  childrenMap: Record<string, any[]>;
  onLike: (comment: any) => void;
  onReply: (comment: any) => void;
  onLongPress: (comment: any) => void;
  onToggleExpand: (parentId: string) => void;
}

// ─── CommentRow ──────────────────────────────────────────────────────────────

const CommentRow = React.memo(function CommentRow({
  item, depth, currentUserId, authorId, colors,
  expandedParents, childrenMap,
  onLike, onReply, onLongPress, onToggleExpand,
}: CommentRowProps) {
  const profile = item.profiles;
  const isAuthor = item.user_id === authorId;
  const replies = childrenMap[item.id] || [];
  const isExpanded = expandedParents.has(item.id);
  const avatarSize = depth > 0 ? 28 : 36;

  return (
    <View style={[styles.commentGroup, depth > 0 && { marginLeft: depth * 24, marginBottom: 12 }]}>
      <TouchableWithoutFeedback onLongPress={() => onLongPress(item)}>
        <View style={styles.commentRow}>
          {profile?.avatar_url ? (
            <CachedImage
              uri={profile.avatar_url}
              style={[styles.commentAvatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
            />
          ) : (
            <View style={[
              styles.commentAvatar,
              { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
                backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' },
            ]}>
              <Ionicons name="person" size={depth > 0 ? 12 : 16} color={colors.textMuted} />
            </View>
          )}

          <View style={{ flex: 1, marginLeft: depth > 0 ? 8 : 12 }}>
            <View style={styles.commentHeader}>
              <Text style={[styles.commentUser, { color: colors.text, fontSize: depth > 0 ? 13 : 14 }]}>
                {profile?.username ?? 'user'}
              </Text>
              {profile?.is_verified && (
                <VerifiedBadge type={profile.verification_type} size="sm" />
              )}
              {isAuthor && depth === 0 && (
                <View style={styles.authorBadge}>
                  <Text style={styles.authorBadgeText}>Author</Text>
                </View>
              )}
              <Text style={[styles.commentTime, { color: colors.textMuted }]}>
                {timeAgo(item.created_at)}
              </Text>
            </View>

            <Text style={[styles.commentText, { color: colors.textSub, fontSize: depth > 0 ? 13 : 14 }]}>
              {renderMentions(item.text, colors)}
            </Text>

            <View style={styles.commentActions}>
              <TouchableOpacity
                onPress={() => onLike(item)}
                style={styles.actionItem}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              >
                <Ionicons
                  name={item.isLiked ? 'heart' : 'heart-outline'}
                  size={depth > 0 ? 13 : 16}
                  color={item.isLiked ? '#ef4444' : colors.textMuted}
                />
                {item.likes_count > 0 && (
                  <Text style={[styles.actionText, { color: colors.textMuted }, item.isLiked && { color: '#ef4444' }]}>
                    {item.likes_count}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onReply(item)}
                style={styles.actionItem}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              >
                <Text style={[styles.actionTextBold, { color: colors.textMuted }]}>Reply</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onLongPress(item)}
                style={styles.actionItem}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Ionicons name="ellipsis-horizontal" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {replies.length > 0 && (
              <TouchableOpacity style={styles.repliesToggle} onPress={() => onToggleExpand(item.id)}>
                <View style={[styles.repliesLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.repliesToggleText, { color: colors.textMuted }]}>
                  {isExpanded
                    ? 'Hide replies'
                    : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                </Text>
              </TouchableOpacity>
            )}

            {isExpanded && replies.map(reply => (
              <CommentRow
                key={reply.id}
                item={reply}
                depth={depth + 1}
                currentUserId={currentUserId}
                authorId={authorId}
                colors={colors}
                expandedParents={expandedParents}
                childrenMap={childrenMap}
                onLike={onLike}
                onReply={onReply}
                onLongPress={onLongPress}
                onToggleExpand={onToggleExpand}
              />
            ))}
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
});

// ─── FooterInput ─────────────────────────────────────────────────────────────
// Owns its own text state so renderFooter never re-creates on keystrokes.
// This prevents BottomSheetTextInput from unmounting (which closes the keyboard).

interface FooterInputProps {
  replyingTo: any;
  colors: any;
  bottomInset: number;
  onSend: (text: string) => Promise<void>;
  onCancelReply: () => void;
  setTextRef: (getText: () => string) => void;
}

const FooterInput = React.memo(function FooterInput({
  replyingTo, colors, bottomInset, onSend, onCancelReply, setTextRef,
}: FooterInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Expose current text to parent (for send callback)
  useEffect(() => {
    setTextRef(() => text);
  }, [text, setTextRef]);

  // Prepopulate @mention when reply target changes
  useEffect(() => {
    if (replyingTo) {
      setText(`@${replyingTo.profiles?.username} `);
    } else {
      setText('');
    }
  }, [replyingTo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setText('');
    setSending(true);
    try {
      await onSend(t);
    } finally {
      setSending(false);
    }
  };

  const canSend = text.trim().length > 0 && !sending;

  return (
    <View style={[styles.footerContainer, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
      {replyingTo && (
        <View style={[styles.replyBanner, { backgroundColor: colors.accent + '18', borderBottomColor: colors.border }]}>
          <Ionicons name="return-down-forward-outline" size={14} color={colors.accent} />
          <Text style={[styles.replyBannerText, { color: colors.accent }]} numberOfLines={1}>
            Replying to <Text style={{ fontWeight: '800' }}>@{replyingTo.profiles?.username}</Text>
          </Text>
          <TouchableOpacity onPress={onCancelReply} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={16} color={colors.accent} />
          </TouchableOpacity>
        </View>
      )}
      <View style={[styles.inputRow, { paddingBottom: Math.max(bottomInset, 8) }]}>
        <BottomSheetTextInput
          style={[
            styles.input,
            { backgroundColor: colors.bg2, color: colors.text, borderColor: colors.border },
          ]}
          value={text}
          onChangeText={setText}
          placeholder={replyingTo ? `Reply to @${replyingTo.profiles?.username}…` : 'Add a comment…'}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
          returnKeyType="default"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { opacity: canSend ? 1 : 0.4 }]}
          onPress={handleSend}
          disabled={!canSend}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ─── CommentSheet ─────────────────────────────────────────────────────────────

export const CommentSheet: React.FC<Props> = ({
  visible, targetId, targetType, currentUserId, authorId, onClose, onCountChange, onCountSync,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const flatListRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const { light: hapticLight, success: hapticSuccess, selection: hapticSelection, error: hapticError } = useHaptics();

  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // Ref to read current text from FooterInput without it being a render dep
  const getTextRef = useRef<() => string>(() => '');
  const setTextRef = useCallback((fn: () => string) => { getTextRef.current = fn; }, []);

  // Always-current refs for parent callbacks — never trigger useEffect re-runs
  const onCountSyncRef = useRef(onCountSync);
  onCountSyncRef.current = onCountSync;
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const snapPoints = useMemo(() => ['65%', '92%'], []);

  // Used for error-recovery reloads from handleLongPress
  const loadRequestId = useRef(0);
  const loadComments = useCallback(async () => {
    if (!targetId) return;
    const reqId = ++loadRequestId.current;
    setLoading(true);
    try {
      const data = targetType === 'post'
        ? await getPostComments(targetId, currentUserId)
        : await getReelComments(targetId, currentUserId);
      if (reqId !== loadRequestId.current) return;
      setComments(data);
      onCountSyncRef.current?.(data.length);
    } catch (e) {
      console.error(e);
    } finally {
      if (reqId === loadRequestId.current) setLoading(false);
    }
  }, [targetId, targetType, currentUserId]);

  // Main open/close effect — deps are all stable primitives, no function deps
  // so this never re-fires after data loads. requestId prevents stale writes.
  useEffect(() => {
    if (!visible) {
      bottomSheetModalRef.current?.dismiss();
      setReplyingTo(null);
      return;
    }
    if (!targetId) return;

    const reqId = ++loadRequestId.current;
    setComments([]);
    setLoading(true);
    bottomSheetModalRef.current?.present();

    (targetType === 'post'
      ? getPostComments(targetId, currentUserId)
      : getReelComments(targetId, currentUserId)
    ).then(data => {
      if (reqId !== loadRequestId.current) return;
      setComments(data);
      onCountSyncRef.current?.(data.length);
    }).catch(console.error).finally(() => {
      if (reqId === loadRequestId.current) setLoading(false);
    });

    // Cleanup cancels any in-flight result (handles React StrictMode double-invoke)
    return () => { ++loadRequestId.current; };
  }, [visible, targetId, targetType, currentUserId]); // ← all stable primitives, no function deps

  const toggleExpand = useCallback((parentId: string) => {
    hapticSelection();
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId); else next.add(parentId);
      return next;
    });
  }, [hapticSelection]);

  const handleLike = useCallback(async (comment: any) => {
    const isLiked = !!comment.isLiked;
    hapticLight();
    setComments(prev => prev.map(c => c.id === comment.id
      ? { ...c, likes_count: (c.likes_count ?? 0) + (isLiked ? -1 : 1), isLiked: !isLiked }
      : c
    ));
    try {
      if (targetType === 'post') {
        if (isLiked) await unlikeComment(comment.id, currentUserId);
        else await likeComment(comment.id, currentUserId);
      } else {
        if (isLiked) await unlikeReelComment(comment.id, currentUserId);
        else await likeReelComment(comment.id, currentUserId);
      }
    } catch {
      setComments(prev => prev.map(c => c.id === comment.id
        ? { ...c, likes_count: (c.likes_count ?? 0) + (isLiked ? 1 : -1), isLiked }
        : c
      ));
    }
  }, [currentUserId, targetType, hapticLight]);

  const handleReply = useCallback((comment: any) => {
    setReplyingTo(comment);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleLongPress = useCallback((comment: any) => {
    hapticLight();
    const isOwn = comment.user_id === currentUserId;

    const doDelete = () => {
      setComments(prev => prev.filter(c => c.id !== comment.id));
      onCountChangeRef.current?.(-1);
      const del = targetType === 'post'
        ? deletePostComment(comment.id, currentUserId)
        : deleteReelComment(comment.id, currentUserId);
      del.then(() => hapticSuccess()).catch(() => {
        showPopup({
          title: 'Error',
          message: 'Could not delete comment.',
          icon: 'alert-circle-outline',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
        loadComments();
      });
    };

    const doReport = (reason: string) => {
      createReport(comment.id, 'comment' as any, reason)
        .then(() => { 
          hapticSuccess(); 
          showPopup({
            title: 'Reported',
            message: "Thanks — we'll review this.",
            icon: 'shield-checkmark-outline',
            buttons: [{ text: 'OK', onPress: () => {} }]
          });
        })
        .catch((e: any) => { 
          hapticError(); 
          showPopup({
            title: 'Error',
            message: e.message ?? 'Could not report.',
            icon: 'alert-circle-outline',
            buttons: [{ text: 'OK', onPress: () => {} }]
          });
        });
    };

    if (isOwn) {
      showPopup({
        title: 'Comment',
        message: 'Manage your comment.',
        icon: 'chatbubble-outline',
        buttons: [
          { text: 'Cancel', style: 'cancel', onPress: () => {} },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      });
    } else {
      showPopup({
        title: 'Report Comment',
        message: 'Why are you reporting this?',
        icon: 'flag-outline',
        buttons: [
          { text: 'Cancel', style: 'cancel', onPress: () => {} },
          { text: 'Inappropriate', onPress: () => doReport('Inappropriate content') },
          { text: 'Spam', onPress: () => doReport('Spam') },
          { text: 'Harassment', onPress: () => doReport('Harassment') },
        ]
      });
    }
  }, [currentUserId, targetType, hapticLight, hapticSuccess, hapticError, loadComments]); // onCountChange accessed via ref

  // Stable send callback — reads text from ref so it's not a dep of renderFooter
  const handleSend = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    const parentId = replyingTo?.id;
    setReplyingTo(null);

    const tempId = 'temp-' + Date.now();
    const tempComment = {
      id: tempId, text: t, user_id: currentUserId,
      parent_id: parentId,
      created_at: new Date().toISOString(),
      likes_count: 0, isLiked: false,
      profiles: { username: 'You', avatar_url: null },
    };

    setComments(prev => [...prev, tempComment]);
    onCountChangeRef.current?.(1);
    if (parentId) {
      setExpandedParents(prev => new Set([...prev, parentId]));
    }
    // Scroll so the new comment is always visible above the input
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const newComment = targetType === 'post'
        ? await addPostComment(targetId, currentUserId, t, parentId)
        : await addReelComment(targetId, currentUserId, t, parentId);
      setComments(prev => prev.map(c => c.id === tempId ? { ...newComment, isLiked: false } : c));
      hapticSuccess();
    } catch {
      setComments(prev => prev.filter(c => c.id !== tempId));
      onCountChangeRef.current?.(-1);
    }
  }, [replyingTo, currentUserId, targetId, targetType, hapticSuccess]); // onCountChange accessed via ref

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ), []
  );

  const commentTree = useMemo(() => {
    const map: Record<string, any[]> = {};
    const roots: any[] = [];
    [...comments]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach(c => {
        if (c.parent_id) {
          if (!map[c.parent_id]) map[c.parent_id] = [];
          map[c.parent_id].push(c);
        } else {
          roots.push(c);
        }
      });
    return { roots, childrenMap: map };
  }, [comments]);

  const renderItem = useCallback(({ item }: { item: any }) => (
    <CommentRow
      item={item}
      depth={0}
      currentUserId={currentUserId}
      authorId={authorId}
      colors={colors}
      expandedParents={expandedParents}
      childrenMap={commentTree.childrenMap}
      onLike={handleLike}
      onReply={handleReply}
      onLongPress={handleLongPress}
      onToggleExpand={toggleExpand}
    />
  ), [currentUserId, authorId, colors, expandedParents, commentTree.childrenMap,
    handleLike, handleReply, handleLongPress, toggleExpand]);

  // renderFooter ONLY depends on stable values — never re-creates on keystrokes
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={0}>
        <FooterInput
          replyingTo={replyingTo}
          colors={colors}
          bottomInset={insets.bottom}
          onSend={handleSend}
          onCancelReply={handleCancelReply}
          setTextRef={setTextRef}
        />
      </BottomSheetFooter>
    ),
    // text/sending live inside FooterInput — NOT listed here
    [replyingTo, colors, insets.bottom, handleSend, handleCancelReply, setTextRef]
  );

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={snapPoints}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      backgroundStyle={{ backgroundColor: colors.bg }}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <View style={{ flex: 1 }}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Comments</Text>
          {!loading && comments.length > 0 && (
            <Text style={[styles.countLabel, { color: colors.textMuted }]}>{comments.length}</Text>
          )}
        </View>

        {/* keyboardShouldPersistTaps="handled" lets swipe-scroll work while keyboard is open */}
        <BottomSheetFlatList
          ref={flatListRef}
          data={commentTree.roots}
          keyExtractor={c => c.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            // Extra padding when reply banner is visible to keep last comment above it
            replyingTo ? { paddingBottom: 170 } : { paddingBottom: 130 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          ListHeaderComponent={
            <View style={[styles.aiHighlight, { backgroundColor: colors.bg2, borderColor: colors.accent + '25' }]}>
              <View style={styles.aiHeader}>
                <Ionicons name="sparkles" size={15} color={colors.accent} />
                <Text style={[styles.aiTitle, { color: colors.accent }]}>AI Highlights</Text>
              </View>
              <Text style={[styles.aiText, { color: colors.textMuted }]}>
                Analyzing conversations… Key points will appear here as we integrate our Unigram AI engine.
              </Text>
            </View>
          }
          ListEmptyComponent={
            loading ? <CommentsSkeleton /> : (
              <View style={styles.emptyWrap}>
                <Ionicons name="chatbubble-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textSub }]}>No comments yet</Text>
                <Text style={[styles.emptyHint, { color: colors.textMuted }]}>Be the first to comment</Text>
              </View>
            )
          }
        />
      </View>
    </BottomSheetModal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderBottomWidth: 0.5, gap: 6,
  },
  title: { fontSize: 16, fontWeight: '700' },
  countLabel: { fontSize: 13, fontWeight: '600' },

  listContent: { paddingHorizontal: 16, paddingTop: 8 },

  commentGroup: { marginBottom: 18 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start' },
  commentAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' },
  commentUser: { fontSize: 14, fontWeight: '700' },
  commentTime: { fontSize: 11 },
  commentText: { fontSize: 14, lineHeight: 20 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 6 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12 },
  actionTextBold: { fontSize: 12, fontWeight: '700' },
  authorBadge: { backgroundColor: '#6366f1', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  authorBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  repliesToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  repliesLine: { width: 24, height: 1, marginRight: 8 },
  repliesToggleText: { fontSize: 12, fontWeight: '600' },

  aiHighlight: { marginBottom: 16, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  aiTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  aiText: { fontSize: 12, fontStyle: 'italic', lineHeight: 16 },

  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '600' },
  emptyHint: { marginTop: 6, fontSize: 13 },

  // Footer / input
  footerContainer: { borderTopWidth: 0.5 },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5,
  },
  replyBannerText: { flex: 1, fontSize: 13 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingTop: 10, gap: 10,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120,
    borderRadius: 22, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 9,
    fontSize: 15, lineHeight: 20,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center',
  },
});
