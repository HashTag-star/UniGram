import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, ActivityIndicator, Alert,
  FlatList, Animated,
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
import { CommentsSkeleton, CommentsLoadMoreSkeleton } from './Skeleton';
import {
  getPostComments, addPostComment, deletePostComment,
  likeComment, unlikeComment, COMMENTS_PAGE_SIZE,
} from '../services/posts';
import {
  getReelComments, addReelComment,
  deleteReelComment, likeReelComment, unlikeReelComment,
  REEL_COMMENTS_PAGE_SIZE,
} from '../services/reels';
import {
  getAdComments, addAdComment, deleteAdComment
} from '../services/campusAds';
import { useTheme } from '../context/ThemeContext';
import { VerifiedBadge } from './VerifiedBadge';
import { createReport } from '../services/reports';
import { CachedImage } from './CachedImage';
import { useHaptics } from '../hooks/useHaptics';
import { usePopup } from '../context/PopupContext';
import { getCommentHighlights } from '../services/aiEngine';
import { searchMentions, getFollowing } from '../services/profiles';
import { VerificationType } from '../data/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { timeAgo } from '../lib/formatUtils';

import { friendlyError } from '../lib/friendlyError';
import { callEdgeFunction } from '../lib/edgeFetch';
import * as ImagePicker from 'expo-image-picker';
import { uploadFile } from '../services/upload';
function renderMentions(text: string, colors: any): React.ReactNode {
  if (!text?.includes('@')) return text;
  return text.split(/(@\w+)/g).map((part, i) =>
    part.startsWith('@')
      ? <Text key={`mention-${i}-${part}`} style={{ color: '#818cf8', fontWeight: '700' }}>{part}</Text>
      : <Text key={`text-${i}`}>{part}</Text>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  targetId: string;
  targetType: 'post' | 'reel' | 'ad';
  currentUserId: string;
  authorId?: string;
  onClose: () => void;
  onCountChange?: (delta: number) => void;
  /** Called once after comments load with the true count — lets parent sync its badge */
  onCountSync?: (count: number) => void;
  /** IDs of users the current user follows — used for mention priority sorting */
  followingIds?: Set<string>;
  /** If set, scroll to and briefly highlight this comment after loading */
  initialCommentId?: string;
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
  highlightedId?: string;
}

// ─── CommentRow ──────────────────────────────────────────────────────────────

// Thread geometry (X / Facebook style): ONE vertical line down the parent's avatar,
// with a rounded elbow branching into every reply. Replies never indent further —
// deeper replies are flattened into the same column and show "↪ @user".
const TOP_AVATAR = 36;
const REPLY_AVATAR = 28;
const AVATAR_GAP = 12;
const REPLY_GAP = 8;
const ELBOW_Y = REPLY_AVATAR / 2; // elbow meets the reply avatar's centre
const LINE_W = 2;

function flattenReplies(rootId: string, childrenMap: Record<string, any[]>): any[] {
  const out: any[] = [];
  const walk = (id: string, parentName: string | null, level: number) => {
    for (const r of childrenMap[id] || []) {
      out.push(level >= 1 && parentName ? { ...r, _replyToName: parentName } : r);
      walk(r.id, r.profiles?.username ?? null, level + 1);
    }
  };
  walk(rootId, null, 0);
  return out;
}

const CommentRow = React.memo(function CommentRow({
  item, depth, currentUserId, authorId, colors,
  expandedParents, childrenMap,
  onLike, onReply, onLongPress, onToggleExpand, highlightedId,
}: CommentRowProps) {
  const profile = item.profiles;
  const isAuthor = item.user_id === authorId;
  const isTop = depth === 0;
  const replies = useMemo(() => (isTop ? flattenReplies(item.id, childrenMap) : []), [isTop, item.id, childrenMap]);
  const flaggedIds = isTop ? [item.id, ...replies.map((r: any) => r.id)].filter(id => expandedParents.has(id)) : [];
  const isExpanded = flaggedIds.length > 0;
  const avatarSize = isTop ? TOP_AVATAR : REPLY_AVATAR;
  const isHighlighted = item.id === highlightedId;
  const highlightBg = useRef(new Animated.Value(isHighlighted ? 1 : 0)).current;
  const [repliesY, setRepliesY] = useState(0);
  const [lastY, setLastY] = useState(0);
  const isAi = profile?.username === 'hashtag';

  useEffect(() => {
    if (!isHighlighted) return;
    highlightBg.setValue(1);
    Animated.timing(highlightBg, { toValue: 0, duration: 2200, useNativeDriver: false }).start();
  }, [isHighlighted]);

  const bgColor = highlightBg.interpolate({ inputRange: [0, 1], outputRange: ['transparent', 'rgba(99,102,241,0.18)'] });
  const lineColor = colors.border;
  // Trunk runs from just under the parent avatar to the last reply's elbow.
  const trunkHeight = isTop && isExpanded && replies.length
    ? Math.max(0, repliesY + lastY + ELBOW_Y - (TOP_AVATAR + 4))
    : 0;

  return (
    <Animated.View style={[styles.commentGroup, depth > 0 && { marginBottom: 12 }, { backgroundColor: bgColor, borderRadius: 10 }]}>
      <TouchableWithoutFeedback onLongPress={() => onLongPress(item)}>
        <View style={styles.commentRow}>
          {trunkHeight > 0 && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', left: TOP_AVATAR / 2 - LINE_W / 2, top: TOP_AVATAR + 4,
                width: LINE_W, height: trunkHeight, borderRadius: LINE_W / 2, backgroundColor: lineColor,
              }}
            />
          )}

          {profile?.avatar_url ? (
            <CachedImage
              uri={profile.avatar_url}
              style={[styles.commentAvatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
            />
          ) : (
            <View style={[
              styles.commentAvatar,
              { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
                backgroundColor: isAi ? colors.accent : colors.bg2, alignItems: 'center', justifyContent: 'center' },
            ]}>
              <Ionicons name={isAi ? 'sparkles' : 'person'} size={isTop ? 16 : 12} color={isAi ? '#fff' : colors.textMuted} />
            </View>
          )}

          <View style={{ flex: 1, marginLeft: isTop ? AVATAR_GAP : REPLY_GAP }}>
            <View style={styles.commentHeader}>
              <Text style={[styles.commentUser, { color: item.isDeleted ? colors.textMuted : colors.text, fontSize: isTop ? 14 : 13 }]}>
                {item.isDeleted ? 'Deleted Comment' : (profile?.username ?? 'user')}
              </Text>
              {profile?.is_verified && (
                <VerifiedBadge type={profile.verification_type} size="sm" />
              )}
              {isAi && (
                <View style={[styles.authorBadge, { backgroundColor: colors.accent + '22' }]}>
                  <Text style={[styles.authorBadgeText, { color: colors.accent }]}>AI</Text>
                </View>
              )}
              {isAuthor && isTop && (
                <View style={styles.authorBadge}>
                  <Text style={styles.authorBadgeText}>Author</Text>
                </View>
              )}
              <Text style={[styles.commentTime, { color: colors.textMuted }]}>
                {timeAgo(item.created_at)}
              </Text>
            </View>

            {item._replyToName ? (
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: 2 }}>↪ replying to @{item._replyToName}</Text>
            ) : null}

            {item.isDeleted ? (
              <View style={[styles.deletedCommentBox, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
                <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.deletedCommentText, { color: colors.textMuted }]}>This comment was deleted.</Text>
              </View>
            ) : (
              <>
                {!!item.text && (
                  <Text style={[styles.commentText, { color: colors.textSub, fontSize: isTop ? 14 : 13 }]}>
                    {renderMentions(item.text, colors)}
                  </Text>
                )}
                {!!item.media_url && (
                  <CachedImage
                    uri={item.media_url}
                    style={{ width: isTop ? 220 : 190, height: isTop ? 220 : 190, borderRadius: 14, marginTop: item.text ? 8 : 2, backgroundColor: colors.bg2 }}
                    resizeMode="cover"
                  />
                )}

                <View style={styles.commentActions}>
              <TouchableOpacity
                onPress={() => onLike(item)}
                style={styles.actionItem}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                accessibilityLabel={item.isLiked ? 'Unlike comment' : 'Like comment'}
                accessibilityRole="button"
              >
                <Ionicons
                  name={item.isLiked ? 'heart' : 'heart-outline'}
                  size={isTop ? 16 : 13}
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
                accessibilityLabel="Reply"
                accessibilityRole="button"
              >
                <Text style={[styles.actionTextBold, { color: colors.textMuted }]}>Reply</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onLongPress(item)}
                style={styles.actionItem}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityLabel="More options"
                accessibilityRole="button"
              >
                <Ionicons name="ellipsis-horizontal" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
              </>
            )}

            {isTop && replies.length > 0 && (
              <TouchableOpacity style={styles.repliesToggle} onPress={() => { if (isExpanded) flaggedIds.forEach(id => onToggleExpand(id)); else onToggleExpand(item.id); }}>
                {/* a short elbow that leads into the toggle, so a collapsed thread still reads as a thread */}
                <View style={{ width: 22, height: 10, marginRight: 8, borderLeftWidth: LINE_W, borderBottomWidth: LINE_W, borderBottomLeftRadius: 8, borderColor: lineColor, opacity: isExpanded ? 0 : 1 }} />
                <Text style={[styles.repliesToggleText, { color: colors.textMuted }]}>
                  {isExpanded
                    ? 'Hide replies'
                    : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                </Text>
              </TouchableOpacity>
            )}

            {isTop && isExpanded && replies.length > 0 && (
              <View style={{ marginTop: 12 }} onLayout={(e) => setRepliesY(e.nativeEvent.layout.y)}>
                {replies.map((reply, i) => (
                  <View
                    key={reply.id}
                    onLayout={i === replies.length - 1 ? (e) => setLastY(e.nativeEvent.layout.y) : undefined}
                  >
                    {/* curved elbow from the trunk into this reply's avatar */}
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: TOP_AVATAR / 2 - LINE_W / 2 - (TOP_AVATAR + AVATAR_GAP),
                        top: ELBOW_Y - 12,
                        width: TOP_AVATAR + AVATAR_GAP - (TOP_AVATAR / 2 - LINE_W / 2) - 4,
                        height: 12,
                        borderLeftWidth: LINE_W, borderBottomWidth: LINE_W,
                        borderBottomLeftRadius: 12, borderColor: lineColor,
                      }}
                    />
                    <CommentRow
                      item={reply}
                      depth={1}
                      currentUserId={currentUserId}
                      authorId={authorId}
                      colors={colors}
                      expandedParents={expandedParents}
                      childrenMap={childrenMap}
                      onLike={onLike}
                      onReply={onReply}
                      onLongPress={onLongPress}
                      onToggleExpand={onToggleExpand}
                      highlightedId={highlightedId}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
});

// ─── Mention suggestion pill ─────────────────────────────────────────────────

interface MentionUser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
  verification_type?: string | null;
  isFollowing: boolean;
}

const MentionSuggestions = React.memo(function MentionSuggestions({
  suggestions, colors, onSelect,
}: { suggestions: MentionUser[]; colors: any; onSelect: (u: MentionUser) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <View style={[mentionStyles.panel, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
      <FlatList
        data={suggestions}
        keyExtractor={u => u.id}
        keyboardShouldPersistTaps="always"
        horizontal={false}
        scrollEnabled={suggestions.length > 4}
        style={{ maxHeight: 220 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[mentionStyles.row, { borderBottomColor: colors.border }]}
            onPress={() => onSelect(item)}
            activeOpacity={0.7}
          >
            {item.avatar_url ? (
              <CachedImage uri={item.avatar_url} style={mentionStyles.avatar} />
            ) : (
              <View style={[mentionStyles.avatar, { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={14} color={colors.textMuted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[mentionStyles.username, { color: colors.text }]}>@{item.username}</Text>
                {item.is_verified && <VerifiedBadge type={item.verification_type as VerificationType | undefined} size="sm" />}
                {item.isFollowing && (
                  <View style={[mentionStyles.followingChip, { backgroundColor: colors.accent + '22' }]}>
                    <Text style={[mentionStyles.followingText, { color: colors.accent }]}>Following</Text>
                  </View>
                )}
              </View>
              {item.full_name ? (
                <Text style={[mentionStyles.fullName, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.full_name}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
});

const mentionStyles = StyleSheet.create({
  panel: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
    marginBottom: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  username: { fontSize: 14, fontWeight: '700' },
  fullName: { fontSize: 12, marginTop: 1 },
  followingChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  followingText: { fontSize: 10, fontWeight: '700' },
});

// ─── FooterInput ─────────────────────────────────────────────────────────────
// Owns its own text state so renderFooter never re-creates on keystrokes.
// This prevents BottomSheetTextInput from unmounting (which closes the keyboard).

interface FooterInputProps {
  replyingTo: any;
  colors: any;
  bottomInset: number;
  onSend: (text: string, media?: { uri: string; mime: string; type: 'image' | 'gif' } | null) => Promise<void>;
  onCancelReply: () => void;
  setTextRef: (getText: () => string) => void;
  followingIds: Set<string>;
}

const FooterInput = React.memo(function FooterInput({
  replyingTo, colors, bottomInset, onSend, onCancelReply, setTextRef, followingIds,
}: FooterInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [media, setMedia] = useState<{ uri: string; mime: string; type: 'image' | 'gif' } | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [mentionStart, setMentionStart] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setSuggestions([]);
    setMentionQuery(null);
  }, [replyingTo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parse text on every change to detect an active @ fragment
  const handleChangeText = useCallback((val: string) => {
    setText(val);

    // Find the last @ before the cursor that is not already completed
    // Completed = has a space after the @word
    const atIdx = val.lastIndexOf('@');
    if (atIdx === -1) {
      setMentionQuery(null);
      setSuggestions([]);
      return;
    }
    const fragment = val.slice(atIdx + 1); // text after the @
    // If there's a space inside the fragment the mention is done
    if (fragment.includes(' ')) {
      setMentionQuery(null);
      setSuggestions([]);
      return;
    }
    setMentionStart(atIdx);
    setMentionQuery(fragment); // '' means just typed @, 'jo' means @jo etc
  }, []);

  // Debounced search whenever mentionQuery changes
  useEffect(() => {
    if (mentionQuery === null) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchMentions(mentionQuery, followingIds);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
    }, mentionQuery.length === 0 ? 0 : 300); // instant on bare @, debounced while typing
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mentionQuery, followingIds]);

  // Inject selected user — replaces @<fragment> with @username and a space
  const handleSelect = useCallback((user: MentionUser) => {
    const before = text.slice(0, mentionStart);
    const after = text.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const next = `${before}@${user.username} ${after}`;
    setText(next);
    setSuggestions([]);
    setMentionQuery(null);
  }, [text, mentionStart, mentionQuery]);

  const handleSend = async () => {
    const t = text.trim();
    if ((!t && !media) || sending) return;
    const attached = media;
    setText('');
    setMedia(null);
    setSuggestions([]);
    setMentionQuery(null);
    setSending(true);
    try {
      await onSend(t, attached);
    } finally {
      setSending(false);
    }
  };

  const canSend = (text.trim().length > 0 || !!media) && !sending;

  const pickMedia = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const mime = a.mimeType ?? (a.uri.toLowerCase().endsWith('.gif') ? 'image/gif' : 'image/jpeg');
      setMedia({ uri: a.uri, mime, type: mime === 'image/gif' ? 'gif' : 'image' });
    } catch {}
  };

  return (
    <View style={[styles.footerContainer, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
      {replyingTo && (
        <View style={[styles.replyBanner, { backgroundColor: colors.accent + '18', borderBottomColor: colors.border }]}>
          <Ionicons name="return-down-forward-outline" size={14} color={colors.accent} />
          <Text style={[styles.replyBannerText, { color: colors.accent }]} numberOfLines={1}>
            Replying to <Text style={{ fontWeight: '800' }}>@{replyingTo.profiles?.username}</Text>
          </Text>
          <TouchableOpacity onPress={onCancelReply} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Cancel reply" accessibilityRole="button">
            <Ionicons name="close-circle" size={16} color={colors.accent} />
          </TouchableOpacity>
        </View>
      )}

      {/* Mention suggestion panel — floats above the input row */}
      <MentionSuggestions suggestions={suggestions} colors={colors} onSelect={handleSelect} />

      {media && (
        <View style={{ paddingHorizontal: 14, paddingTop: 8, flexDirection: 'row' }}>
          <View>
            <CachedImage uri={media.uri} style={{ width: 84, height: 84, borderRadius: 12 }} />
            <TouchableOpacity
              onPress={() => setMedia(null)}
              style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.bg, borderRadius: 11 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Remove attachment" accessibilityRole="button"
            >
              <Ionicons name="close-circle" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={[styles.inputRow, { paddingBottom: Math.max(bottomInset, 8) }]}>
        <TouchableOpacity
          onPress={pickMedia}
          style={{ justifyContent: 'center', paddingRight: 8, paddingLeft: 2 }}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 4 }}
          accessibilityLabel="Attach a picture, meme or GIF" accessibilityRole="button"
        >
          <Ionicons name="image-outline" size={24} color={colors.accent} />
        </TouchableOpacity>
        <BottomSheetTextInput
          style={[
            styles.input,
            { backgroundColor: colors.bg2, color: colors.text, borderColor: colors.border },
          ]}
          value={text}
          onChangeText={handleChangeText}
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
          accessibilityLabel="Send comment"
          accessibilityRole="button"
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
  followingIds: followingIdsProp, initialCommentId,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const flatListRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const { light: hapticLight, success: hapticSuccess, selection: hapticSelection, error: hapticError } = useHaptics();

  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | undefined>(undefined);
  // Cached following IDs for mention autocomplete — prop takes priority (already loaded by parent)
  const [followingIds, setFollowingIds] = useState<Set<string>>(followingIdsProp ?? new Set());

  // AI Highlights
  const [aiHighlights, setAiHighlights] = useState<string[]>([]);
  const [aiHighlightsLoading, setAiHighlightsLoading] = useState(false);

  // Ref to read current text from FooterInput without it being a render dep
  const getTextRef = useRef<() => string>(() => '');
  const setTextRef = useCallback((fn: () => string) => { getTextRef.current = fn; }, []);

  // Sync followingIds if prop updates (e.g. user follows someone while sheet is open)
  useEffect(() => {
    if (followingIdsProp) setFollowingIds(followingIdsProp);
  }, [followingIdsProp]);

  // Always-current refs for parent callbacks — never trigger useEffect re-runs
  const onCountSyncRef = useRef(onCountSync);
  onCountSyncRef.current = onCountSync;
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const snapPoints = useMemo(() => ['65%', '92%'], []);

  // Used for error-recovery reloads from handleLongPress
  const loadRequestId = useRef(0);
  const loadComments = useCallback(async (pageNum = 0, append = false) => {
    if (!targetId) return;
    const reqId = ++loadRequestId.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const result = targetType === 'post'
        ? await getPostComments(targetId, currentUserId, pageNum)
        : targetType === 'ad'
        ? await getAdComments(targetId, currentUserId, pageNum)
        : await getReelComments(targetId, currentUserId, pageNum);
      if (reqId !== loadRequestId.current) return;
      const { items, hasMore: more, total } = result;
      setComments(prev => append ? [...prev, ...items] : items);
      setHasMore(more);
      setPage(pageNum);
      if (!append) {
        setTotalCount(total);
        onCountSyncRef.current?.(total);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (reqId === loadRequestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [targetId, targetType, currentUserId]);

  // Main open/close effect — deps are all stable primitives, no function deps
  // so this never re-fires after data loads. requestId prevents stale writes.
  useEffect(() => {
    if (!visible) {
      bottomSheetModalRef.current?.dismiss();
      setReplyingTo(null);
      setAiHighlights([]);
      setAiHighlightsLoading(false);
      setPage(0);
      setHasMore(false);
      setTotalCount(0);
      return;
    }
    if (!targetId) return;

    const reqId = ++loadRequestId.current;
    setComments([]);
    setPage(0);
    setHasMore(false);
    setLoading(true);
    bottomSheetModalRef.current?.present();

    (targetType === 'post'
      ? getPostComments(targetId, currentUserId, 0)
      : targetType === 'ad'
      ? getAdComments(targetId, currentUserId, 0)
      : getReelComments(targetId, currentUserId, 0)
    ).then(({ items, hasMore: more, total }) => {
      if (reqId !== loadRequestId.current) return;
      setComments(items);
      setHasMore(more);
      setTotalCount(total);
      onCountSyncRef.current?.(total);

      // Fetch AI highlights for this comment thread (fire-and-forget, needs ≥3 comments)
      if (items.length >= 3) {
        setAiHighlightsLoading(true);
        setAiHighlights([]);
        const input = items
          .filter((c: any) => !c.parent_id) // top-level only for cleaner summary
          .slice(0, 40)
          .map((c: any) => ({ username: c.profiles?.username ?? 'user', text: c.text }));
        getCommentHighlights(input)
          .then(h => { setAiHighlights(h); })
          .catch(() => {})
          .finally(() => setAiHighlightsLoading(false));
      } else {
        setAiHighlights([]);
      }
    }).catch(console.error).finally(() => {
      if (reqId === loadRequestId.current) setLoading(false);
    });

    // Cleanup cancels any in-flight result (handles React StrictMode double-invoke)
    return () => { ++loadRequestId.current; };
  }, [visible, targetId, targetType, currentUserId]); // ← all stable primitives, no function deps

  // Load next page when user scrolls to the bottom
  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    loadComments(page + 1, true);
  }, [loadingMore, hasMore, page, loadComments]);

  const toggleExpand = useCallback((parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId); else next.add(parentId);
      return next;
    });
  }, []);

  const handleLike = useCallback(async (comment: any) => {
    const isLiked = !!comment.isLiked;
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
  }, [currentUserId, targetType]);

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
      setTotalCount(prev => Math.max(0, prev - 1));
      onCountChangeRef.current?.(-1);
      const del = targetType === 'post'
        ? deletePostComment(comment.id, currentUserId)
        : targetType === 'ad'
        ? deleteAdComment(comment.id, currentUserId)
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
            message: friendlyError(e, 'Could not report.'),
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
  const handleSend = useCallback(async (text: string, attached?: { uri: string; mime: string; type: 'image' | 'gif' } | null) => {
    const t = text.trim();
    if (!t && !attached) return;
    const parentId = replyingTo?.id;
    const repliedToAi = replyingTo?.profiles?.username === 'hashtag';
    setReplyingTo(null);

    const tempId = 'temp-' + Date.now();
    const tempComment = {
      id: tempId, text: t, user_id: currentUserId,
      parent_id: parentId,
      created_at: new Date().toISOString(),
      likes_count: 0, isLiked: false,
      media_url: attached?.uri ?? null, media_type: attached?.type ?? null,
      profiles: { username: 'You', avatar_url: null },
    };

    setComments(prev => [...prev, tempComment]);
    setTotalCount(prev => prev + 1);
    onCountChangeRef.current?.(1);
    if (parentId) {
      setExpandedParents(prev => new Set([...prev, parentId]));
    }
    // Scroll so the new comment is always visible above the input
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      let media: { url: string; type: 'image' | 'gif' } | undefined;
      if (attached && targetType !== 'ad') {
        const ext = attached.mime === 'image/gif' ? 'gif' : (attached.mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const url = await uploadFile('post-media', `${currentUserId}/comments/${Date.now()}.${ext}`, attached.uri, attached.mime);
        media = { url, type: attached.type };
      }
      const newComment = targetType === 'post'
        ? await addPostComment(targetId, currentUserId, t, parentId, media)
        : targetType === 'ad'
        ? await addAdComment(targetId, currentUserId, t)
        : await addReelComment(targetId, currentUserId, t, parentId, media);
      setComments(prev => prev.map(c => c.id === tempId ? { ...newComment, isLiked: false } : c));
      hapticSuccess();

      // @hashtag (or a reply to one of its answers) → the AI answers in the thread.
      if (targetType !== 'ad' && (/@hashtag\b/i.test(t) || repliedToAi)) {
        const aiRowId = 'ai-' + Date.now();
        const threadParent = parentId ?? newComment.id;
        const aiRow = (text: string) => ({
          id: aiRowId, text, user_id: 'ai', parent_id: threadParent, created_at: new Date().toISOString(),
          likes_count: 0, isLiked: false, profiles: { username: 'hashtag', avatar_url: null },
        });
        setExpandedParents(prev => new Set([...prev, threadParent]));
        setComments(prev => [...prev, aiRow('Thinking…')]);
        callEdgeFunction('ai-mention-reply', { target: targetType, comment_id: newComment.id }, { timeoutMs: 120000 })
          .then(() => loadComments())
          .catch((e: any) => {
            setComments(prev => prev.map(c => c.id === aiRowId ? { ...c, text: friendlyError(e, 'Hashtag could not answer right now. Try again.') } : c));
            setTimeout(() => setComments(prev => prev.filter(c => c.id !== aiRowId)), 5000);
          });
      }
    } catch (e: any) {
      setComments(prev => prev.filter(c => c.id !== tempId));
      setTotalCount(prev => Math.max(0, prev - 1));
      onCountChangeRef.current?.(-1);
      if (attached) { try { require('react-native').Alert.alert('Could not send', friendlyError(e, 'Your picture could not be sent. Try again.')); } catch {} }
    }
  }, [replyingTo, currentUserId, targetId, targetType, hapticSuccess, loadComments]); // onCountChange accessed via ref

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
    const commentIds = new Set(comments.map(c => c.id));

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

    // Check for orphaned replies (parent was deleted)
    for (const parentId of Object.keys(map)) {
      if (!commentIds.has(parentId)) {
        // Create a dummy deleted comment so the replies still render
        roots.push({
          id: parentId,
          text: null,
          created_at: map[parentId][0]?.created_at ?? new Date().toISOString(),
          isDeleted: true,
          profiles: null,
        });
      }
    }

    roots.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return { roots, childrenMap: map };
  }, [comments]);

  // Scroll to and highlight a specific comment once the tree is built and loading is done
  useEffect(() => {
    if (!initialCommentId || loading || !visible) return;
    const { roots, childrenMap: cmap } = commentTree;

    const rootIdx = roots.findIndex((c: any) => c.id === initialCommentId);
    if (rootIdx >= 0) {
      setHighlightedCommentId(initialCommentId);
      setTimeout(() => {
        try { flatListRef.current?.scrollToIndex({ index: rootIdx, animated: true, viewOffset: 60 }); }
        catch { /* list not yet laid out */ }
      }, 450);
      return;
    }

    // It's a reply — expand its parent root and scroll to that
    for (const [parentId, children] of Object.entries(cmap)) {
      if ((children as any[]).some((c: any) => c.id === initialCommentId)) {
        const parentIdx = roots.findIndex((c: any) => c.id === parentId);
        if (parentIdx >= 0) {
          setExpandedParents(prev => new Set([...prev, parentId]));
          setHighlightedCommentId(initialCommentId);
          setTimeout(() => {
            try { flatListRef.current?.scrollToIndex({ index: parentIdx, animated: true, viewOffset: 60 }); }
            catch { /* list not yet laid out */ }
          }, 450);
        }
        return;
      }
    }
  }, [initialCommentId, loading, visible, commentTree]);

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
      highlightedId={highlightedCommentId}
    />
  ), [currentUserId, authorId, colors, expandedParents, commentTree.childrenMap,
    handleLike, handleReply, handleLongPress, toggleExpand, highlightedCommentId]);

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
          followingIds={followingIds}
        />
      </BottomSheetFooter>
    ),
    // text/sending live inside FooterInput — NOT listed here
    [replyingTo, colors, insets.bottom, handleSend, handleCancelReply, setTextRef, followingIds]
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
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustPan"
    >
      <View style={{ flex: 1 }}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border, justifyContent: 'space-between' }]}>
          <View style={{ width: 32 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.title, { color: colors.text }]}>Comments</Text>
            {!loading && totalCount > 0 && (
              <Text style={[styles.countLabel, { color: colors.textMuted }]}>{totalCount}</Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close comments" accessibilityRole="button">
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
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
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <CommentsLoadMoreSkeleton /> : undefined}
          ListHeaderComponent={
            // Only show the panel if loading OR we have actual highlights
            (aiHighlightsLoading || aiHighlights.length > 0) ? (
              <View style={[styles.aiHighlight, { backgroundColor: colors.bg2, borderColor: colors.accent + '30' }]}>
                <View style={styles.aiHeader}>
                  <Ionicons name="sparkles" size={14} color={colors.accent} />
                  <Text style={[styles.aiTitle, { color: colors.accent }]}>AI Highlights</Text>
                  {aiHighlightsLoading && (
                    <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 4 }} />
                  )}
                </View>
                {aiHighlightsLoading ? (
                  <Text style={[styles.aiText, { color: colors.textMuted }]}>
                    Analysing conversation…
                  </Text>
                ) : (
                  aiHighlights.map((h, i) => (
                    <View key={`ai-h-${i}`} style={styles.aiHighlightRow}>
                      <View style={[styles.aiDot, { backgroundColor: colors.accent }]} />
                      <Text style={[styles.aiText, { color: colors.textSub, fontStyle: 'normal' }]}>{h}</Text>
                    </View>
                  ))
                )}
              </View>
            ) : undefined
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
  deletedCommentBox: { 
    flexDirection: 'row', alignItems: 'center', 
    padding: 10, borderRadius: 8, borderWidth: 1, 
    marginTop: 4, marginBottom: 8 
  },
  deletedCommentText: { fontSize: 13, fontStyle: 'italic', marginLeft: 8 },

  aiHighlight: { marginBottom: 16, padding: 12, borderRadius: 14, borderWidth: 1 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  aiHighlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  aiDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  aiText: { fontSize: 13, lineHeight: 18, flex: 1 },

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
