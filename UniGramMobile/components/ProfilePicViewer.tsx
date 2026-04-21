import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Animated, TouchableWithoutFeedback,
  StyleSheet, Dimensions, TouchableOpacity, Text,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from './CachedImage';

const { width: W, height: H } = Dimensions.get('window');
const PIC_SIZE = W * 0.82;

interface Props {
  visible: boolean;
  uri?: string | null;
  username?: string;
  onClose: () => void;
  onViewProfile?: () => void;
  onViewStatus?: () => void;
}

export const ProfilePicViewer: React.FC<Props> = ({
  visible, uri, username, onClose, onViewProfile, onViewStatus,
}) => {
  const scale = useRef(new Animated.Value(0.72)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          tension: 70,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scale.setValue(0.72);
      opacity.setValue(0);
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 0.72, duration: 160, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        </View>
      </TouchableWithoutFeedback>

      <Animated.View
        style={[styles.content, { opacity, transform: [{ scale }] }]}
        pointerEvents="box-none"
      >
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={22} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>

        {/* Profile picture */}
        {uri ? (
          <CachedImage
            uri={uri}
            style={styles.pic}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.pic, styles.picFallback]}>
            <Ionicons name="person" size={PIC_SIZE * 0.4} color="rgba(255,255,255,0.3)" />
          </View>
        )}

        {/* Username label */}
        {!!username && (
          <Text style={styles.username} numberOfLines={1}>@{username}</Text>
        )}

        {/* Action buttons */}
        {(onViewProfile || onViewStatus) && (
          <View style={styles.actions}>
            {onViewStatus && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { handleClose(); setTimeout(onViewStatus, 200); }}
                activeOpacity={0.8}
              >
                <Ionicons name="radio-button-on-outline" size={15} color="#fff" />
                <Text style={styles.actionBtnText}>View Status</Text>
              </TouchableOpacity>
            )}
            {onViewProfile && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { handleClose(); setTimeout(onViewProfile, 200); }}
                activeOpacity={0.8}
              >
                <Ionicons name="person-outline" size={15} color="#fff" />
                <Text style={styles.actionBtnText}>View Profile</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  content: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 8,
  },
  pic: {
    width: PIC_SIZE,
    height: PIC_SIZE,
    borderRadius: PIC_SIZE / 2,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  picFallback: {
    backgroundColor: '#1e1e2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
