import React, { useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Animated, 
  Modal, Dimensions, ScrollView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PostOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  post: any;
  currentUserId: string;
  onDelete?: (postId: string) => void;
  onShare?: () => void;
  onCopyLink?: () => void;
  onSave?: () => void;
  isSaved?: boolean;
}

export const PostOptionsSheet: React.FC<PostOptionsSheetProps> = ({ 
  visible, onClose, post, currentUserId, onDelete, onShare, onCopyLink, onSave, isSaved 
}) => {
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const isOwner = post.user_id === currentUserId;

  const ActionIcon = ({ name, label, onPress, color = colors.text }: any) => (
    <TouchableOpacity style={styles.actionIconBtn} onPress={onPress}>
      <View style={[styles.iconCircle, { borderColor: colors.border }]}>
        <Ionicons name={name} size={22} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  const ListItem = ({ name, label, onPress, destructive = false }: any) => (
    <TouchableOpacity style={styles.listItem} onPress={onPress}>
      <Ionicons name={name} size={22} color={destructive ? '#ef4444' : colors.text} />
      <Text style={[styles.listItemText, { color: colors.text }, destructive && { color: '#ef4444' }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent onRequestClose={onClose} animationType="none">
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        
        <Animated.View style={[styles.sheet, { backgroundColor: colors.bg, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.handle} />
          
          <View style={[styles.quickActions, { borderBottomColor: colors.border }]}>
            <ActionIcon name="paper-plane-outline" label="Share" onPress={onShare} />
            <ActionIcon name="link-outline" label="Link" onPress={onCopyLink} />
            <ActionIcon 
                name={isSaved ? "bookmark" : "bookmark-outline"} 
                label={isSaved ? "Saved" : "Save"} 
                onPress={onSave} 
                color={isSaved ? "#fbbf24" : colors.text}
            />
          </View>

          <View style={styles.list}>
            <ListItem name="star-outline" label="Add to favorites" />
            <ListItem name="person-remove-outline" label="Unfollow" />
            <ListItem name="information-circle-outline" label="Why you're seeing this post" />
            <ListItem name="eye-off-outline" label="Hide" />
            <ListItem name="alert-circle-outline" label="Report" destructive />
            
            {isOwner && (
              <ListItem 
                name="trash-outline" 
                label="Delete" 
                destructive 
                onPress={() => {
                  onClose();
                  onDelete?.(post.id);
                }} 
              />
            )}
            <View style={{ height: 40 }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 400,
    maxHeight: '80%',
    paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, backgroundColor: 'rgba(128,128,128,0.3)',
    borderRadius: 2, alignSelf: 'center', marginBottom: 20
  },
  quickActions: {
    flexDirection: 'row', justifyContent: 'space-around', 
    paddingHorizontal: 20, marginBottom: 20,
    borderBottomWidth: 1,
    paddingBottom: 20
  },
  actionIconBtn: { alignItems: 'center', gap: 8 },
  iconCircle: {
    width: 54, height: 54, borderRadius: 27, 
    borderWidth: 1, 
    alignItems: 'center', justifyContent: 'center'
  },
  actionLabel: { fontSize: 11, fontWeight: '500' },
  list: { paddingHorizontal: 16 },
  listItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 15,
  },
  listItemText: { fontSize: 15, fontWeight: '500' },
});
