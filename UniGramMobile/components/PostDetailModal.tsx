import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { FeedPost } from '../screens/FeedScreen';
import { CommentSheet } from './CommentSheet';
import { useTheme } from '../context/ThemeContext';

interface PostDetailModalProps {
  post: any;
  currentUserId: string;
  isLiked?: boolean;
  isSaved?: boolean;
  openComments?: boolean;
  initialCommentId?: string;
  onClose: () => void;
  onUserPress?: (profile: any) => void;
  onCommentCountChange?: (id: string, delta: number) => void;
}

export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  post,
  currentUserId,
  isLiked = false,
  isSaved = false,
  openComments = false,
  initialCommentId,
  onClose,
  onUserPress,
  onCommentCountChange,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [commentCount, setCommentCount] = useState<number>(post.comments_count ?? 0);
  const [showComments, setShowComments] = useState(openComments);
  const [isMuted, setIsMuted] = useState(false);

  return (
    // Own BottomSheetModalProvider scoped to this native Modal layer —
    // the one in App.tsx can't reach through a React Native Modal boundary.
    <BottomSheetModalProvider>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {/* Header */}
        <View style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            paddingTop: insets.top > 0 ? insets.top : 14,
          },
        ]}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            @{post.profiles?.username ?? 'Post'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Post content */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <FeedPost
            post={{ ...post, comments_count: commentCount }}
            currentUserId={currentUserId}
            isLiked={isLiked}
            isSaved={isSaved}
            isMuted={isMuted}
            isActive
            setIsMuted={setIsMuted}
            onOpenComments={() => setShowComments(true)}
            onCommentCountChange={(id, delta) => {
              setCommentCount(c => Math.max(0, c + delta));
              onCommentCountChange?.(id, delta);
            }}
            onUserPress={onUserPress}
          />
        </ScrollView>

        {/* Comment sheet — works because BottomSheetModalProvider is in this layer */}
        <CommentSheet
          visible={showComments}
          targetId={post.id}
          targetType="post"
          currentUserId={currentUserId}
          authorId={post.user_id}
          initialCommentId={initialCommentId}
          onClose={() => setShowComments(false)}
          onCountChange={delta => setCommentCount(c => Math.max(0, c + delta))}
          onCountSync={count => setCommentCount(count)}
        />
      </View>
    </BottomSheetModalProvider>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  headerSpacer: { width: 32 },
  scrollContent: { paddingBottom: 40 },
});
