import React, { useEffect, useRef, useState } from 'react';
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
  // [Abena Owusu - Frontend] Visibility gate now uses an Animated listener +
  // useState instead of reading the private `_value` field on opacityAnim,
  // which is an internal Animated API that breaks across RN versions.
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 150, friction: 12, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible]);

  if (!visible && !rendered) return null;

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
            <View style={[styles.iconWrap, { backgroundColor: (iconColor || colors.accent) + '1f' }]}>
              <Ionicons name={icon as any} size={32} color={iconColor || colors.accent} />
            </View>
          )}

          <View style={styles.content}>
            {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
            {message && <Text style={[styles.message, { color: colors.textSub }]}>{message}</Text>}
          </View>

          <View style={[styles.buttonContainer, buttons.length === 2 && { flexDirection: 'row' }]}>
            {(buttons.length === 2 ? [...buttons].sort((x, y) => (x.style === 'cancel' ? -1 : 0) - (y.style === 'cancel' ? -1 : 0)) : buttons).map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const bg = isDestructive
                ? 'rgba(255,48,64,0.14)'
                : isCancel
                  ? colors.card
                  : colors.accent;
              const fg = isDestructive ? '#ff3040' : isCancel ? colors.textSub : '#fff';
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.button, { backgroundColor: bg }, buttons.length === 2 && { flex: 1 }]}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={btn.text}
                  onPress={() => {
                    btn.onPress();
                    onClose();
                  }}
                >
                  <Text style={[styles.buttonText, { color: fg }]}>{btn.text}</Text>
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
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 26,
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
    paddingBottom: 22,
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
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  button: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
