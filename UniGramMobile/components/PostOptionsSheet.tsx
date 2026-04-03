import React, { useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Animated, 
  Modal, Dimensions, ScrollView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

  const ActionIcon = ({ name, label, onPress, color = '#fff' }: any) => (
    <TouchableOpacity style={styles.actionIconBtn} onPress={onPress}>
      <View style={styles.iconCircle}>
        <Ionicons name={name} size={22} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );

  const ListItem = ({ name, label, onPress, destructive = false }: any) => (
    <TouchableOpacity style={styles.listItem} onPress={onPress}>
      <Ionicons name={name} size={22} color={destructive ? '#ef4444' : '#fff'} />
      <Text style={[styles.listItemText, destructive && { color: '#ef4444' }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent onRequestClose={onClose} animationType="none">
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.handle} />
          
          <View style={styles.quickActions}>
            <ActionIcon name="paper-plane-outline" label="Share" onPress={onShare} />
            <ActionIcon name="link-outline" label="Link" onPress={onCopyLink} />
            <ActionIcon 
                name={isSaved ? "bookmark" : "bookmark-outline"} 
                label={isSaved ? "Saved" : "Save"} 
                onPress={onSave} 
                color={isSaved ? "#fbbf24" : "#fff"}
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
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 400,
    maxHeight: '80%',
    paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2, alignSelf: 'center', marginBottom: 20
  },
  quickActions: {
    flexDirection: 'row', justifyContent: 'space-around', 
    paddingHorizontal: 20, marginBottom: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 20
  },
  actionIconBtn: { alignItems: 'center', gap: 8 },
  iconCircle: {
    width: 54, height: 54, borderRadius: 27, 
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center'
  },
  actionLabel: { color: '#fff', fontSize: 11, fontWeight: '500' },
  list: { paddingHorizontal: 16 },
  listItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 15,
  },
  listItemText: { color: '#fff', fontSize: 15, fontWeight: '500' },
});
