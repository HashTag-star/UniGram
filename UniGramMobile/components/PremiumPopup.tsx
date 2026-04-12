import React, { useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, Animated, Modal, 
  TouchableOpacity, Dimensions, Platform 
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

export interface PopupButton {
  text: string;
  onPress: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface PremiumPopupProps {
  visible: boolean;
  title?: string;
  message?: string;
  buttons: PopupButton[];
  onClose: () => void;
  icon?: string;
  iconColor?: string;
}

export const PremiumPopup: React.FC<PremiumPopupProps> = ({ 
  visible, title, message, buttons, onClose, icon, iconColor 
}) => {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 150, friction: 12, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible && (opacityAnim as any)._value === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity 
          style={StyleSheet.absoluteFill} 
          activeOpacity={1} 
          onPress={onClose} 
        >
          <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]} />
        </TouchableOpacity>

        <Animated.View 
          style={[
            styles.card, 
            { 
              backgroundColor: Platform.OS === 'ios' ? 'rgba(20,20,20,0.7)' : colors.bg,
              borderColor: colors.border,
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
              // Add a slight shadow for depth
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 20 },
              shadowOpacity: 0.6,
              shadowRadius: 24,
              elevation: 24,
            }
          ]}
        >
          {Platform.OS === 'ios' && (
            <BlurView 
              intensity={95} 
              tint={colors.statusBar === 'light-content' ? 'dark' : 'light'} 
              style={StyleSheet.absoluteFill} 
            />
          )}
          {icon && (
            <View style={[styles.iconWrap, { backgroundColor: (iconColor || colors.accent) + '15' }]}>
              <Ionicons name={icon as any} size={32} color={iconColor || colors.accent} />
            </View>
          )}

          <View style={styles.content}>
            {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
            {message && <Text style={[styles.message, { color: colors.textSub }]}>{message}</Text>}
          </View>

          <View style={styles.buttonContainer}>
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const isLast = i === buttons.length - 1;

              return (
                <TouchableOpacity 
                  key={i} 
                  style={[
                    styles.button, 
                    !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    isDestructive && { backgroundColor: 'rgba(239, 68, 68, 0.08)' }
                  ]}
                  onPress={() => {
                    btn.onPress();
                    onClose();
                  }}
                >
                  <Text 
                    style={[
                      styles.buttonText, 
                      { color: isCancel ? colors.textSub : colors.text },
                      isDestructive && { color: '#ef4444', fontWeight: '800' },
                      !isCancel && !isDestructive && { color: colors.accent, fontWeight: '700' }
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  button: {
    width: '100%',
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
