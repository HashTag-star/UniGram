import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

interface RepostSheetProps {
  visible: boolean;
  onClose: () => void;
  post: any;
  isReposted: boolean;
  hasMedia: boolean;
  onRepost: () => Promise<void>;
  onQuote: (caption: string) => Promise<void>;
  onRepostToStory: () => Promise<void>;
}

export const RepostSheet: React.FC<RepostSheetProps> = ({
  visible, onClose, post, isReposted, hasMedia,
  onRepost, onQuote, onRepostToStory,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(500)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [mode, setMode] = useState<'menu' | 'quote'>('menu');
  const [quoteText, setQuoteText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setMode('menu');
      setQuoteText('');
      setLoading(false);
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 500, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const wrap = async (fn: () => Promise<void>) => {
    setLoading(true);
    try { await fn(); } finally { setLoading(false); onClose(); }
  };

  const profile = post?.profiles;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityAnim, backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[
          styles.sheet,
          {
            backgroundColor: colors.bg ?? colors.background,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateY: slideAnim }],
          },
        ]}>
          <View style={styles.handle} />

          {mode === 'menu' ? (
            <>
              {/* ── Repost ───────────────────────────────────────────────── */}
              <TouchableOpacity style={styles.row} onPress={() => wrap(onRepost)} disabled={loading}>
                <View style={[styles.iconWrap, isReposted && { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                  <Ionicons name="repeat" size={22} color={isReposted ? '#22c55e' : colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: isReposted ? '#22c55e' : colors.text }]}>
                    {isReposted ? 'Undo Repost' : 'Repost'}
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    {isReposted
                      ? 'Remove from your profile and followers’ feeds'
                      : 'Share instantly to your followers’ feeds'}
                  </Text>
                </View>
                {loading && <ActivityIndicator size="small" color={colors.textMuted} />}
              </TouchableOpacity>

              {/* ── Quote Post ───────────────────────────────────────────── */}
              <TouchableOpacity style={styles.row} onPress={() => setMode('quote')} disabled={loading}>
                <View style={styles.iconWrap}>
                  <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Quote Post</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>Add your take to the debate</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              {/* ── Repost to Story (image / video only) ─────────────────── */}
              {hasMedia && (
                <TouchableOpacity style={styles.row} onPress={() => wrap(onRepostToStory)} disabled={loading}>
                  <View style={styles.iconWrap}>
                    <Ionicons name="add-circle-outline" size={22} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>Add to Story</Text>
                    <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                      Share this post to your story for 24 hours
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
          ) : (
            /* ── Quote input mode ──────────────────────────────────────── */
            <>
              <View style={styles.quoteHeader}>
                <TouchableOpacity onPress={() => setMode('menu')} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={20} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.quoteTitle, { color: colors.text }]}>Quote Post</Text>
                <TouchableOpacity
                  style={[styles.postBtn, { opacity: quoteText.trim() && !loading ? 1 : 0.4 }]}
                  onPress={() => wrap(() => onQuote(quoteText.trim()))}
                  disabled={!quoteText.trim() || loading}
                >
                  {loading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.postBtnText}>Post</Text>}
                </TouchableOpacity>
              </View>

              {/* Quoted original preview */}
              <View style={[styles.quotedPreview, { borderColor: colors.border }]}>
                <Text style={[styles.quotedAuthor, { color: colors.textSub ?? colors.textMuted }]}>
                  @{profile?.username ?? 'user'}
                </Text>
                {post?.caption ? (
                  <Text style={[styles.quotedCaption, { color: colors.textMuted }]} numberOfLines={2}>
                    {post.caption}
                  </Text>
                ) : (
                  <Text style={[styles.quotedCaption, { color: colors.textMuted }]}>
                    {hasMedia ? 'Photo / video post' : 'Thread post'}
                  </Text>
                )}
              </View>

              <TextInput
                style={[styles.quoteInput, { color: colors.text, borderColor: colors.border }]}
                placeholder={`Add your thoughts…`}
                placeholderTextColor={colors.textMuted}
                multiline
                autoFocus
                value={quoteText}
                onChangeText={setQuoteText}
                maxLength={500}
              />
              <Text style={[styles.charCount, { color: colors.textMuted }]}>
                {500 - quoteText.length}
              </Text>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 12,
  },
  handle: {
    width: 36, height: 4,
    backgroundColor: 'rgba(128,128,128,0.3)',
    borderRadius: 2, alignSelf: 'center', marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(128,128,128,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  rowSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  quoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  backBtn: { padding: 4 },
  quoteTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  postBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  postBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  quotedPreview: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  quotedAuthor: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  quotedCaption: {
    fontSize: 13,
    lineHeight: 18,
  },
  quoteInput: {
    marginHorizontal: 16,
    minHeight: 90,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  charCount: {
    textAlign: 'right',
    marginRight: 16,
    marginTop: 6,
    fontSize: 12,
  },
});
