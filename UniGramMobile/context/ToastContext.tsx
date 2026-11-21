import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { status } from '../constants/design';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  key?: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, opts?: { replaceKey?: string }) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let _id = 0;
const MAX_VISIBLE = 3;
const VISIBLE_MS = 3200;

const META: Record<ToastType, { icon: string; color: string }> = {
  success: { icon: 'checkmark-circle', color: status.success },
  error: { icon: 'alert-circle', color: status.danger },
  info: { icon: 'information-circle', color: '#818cf8' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', opts?: { replaceKey?: string }) => {
    const id = ++_id;
    setToasts(prev => {
      let next = opts?.replaceKey ? prev.filter(t => t.key !== opts.replaceKey) : prev;
      // Same message already showing → don't stack duplicates.
      next = next.filter(t => !(t.message === message && t.type === type));
      return [...next, { id, message, type, key: opts?.replaceKey } as ToastItem].slice(-MAX_VISIBLE);
    });
  }, []);

  const value = React.useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Top-anchored: never collides with the keyboard, tab bar or composer. */}
      <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
        {toasts.map(t => (
          <ToastCard key={t.id} item={t} onDone={dismiss} />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

function ToastCard({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  const enter = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closing = useRef(false);
  const meta = META[item.type];

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(enter, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(() => onDone(item.id));
  }, [enter, item.id, onDone]);

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, tension: 90, friction: 11, useNativeDriver: true }).start();
    timer.current = setTimeout(close, VISIBLE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  // Swipe up to dismiss.
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { if (timer.current) clearTimeout(timer.current); },
    onPanResponderMove: (_, g) => dragY.setValue(Math.min(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy < -24 || g.vy < -0.5) {
        Animated.timing(dragY, { toValue: -120, duration: 160, useNativeDriver: true }).start(() => onDone(item.id));
      } else {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        timer.current = setTimeout(close, 1800);
      }
    },
  })).current;

  return (
    <Animated.View
      {...pan.panHandlers}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.card,
        {
          opacity: enter,
          transform: [
            { translateY: Animated.add(enter.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }), dragY) },
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: meta.color + '26' }]}>
        <Ionicons name={meta.icon as any} size={20} color={meta.color} />
      </View>
      <Text style={styles.text} numberOfLines={3}>{item.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', left: 14, right: 14,
    alignItems: 'center', zIndex: 9999, gap: 8,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    alignSelf: 'center', maxWidth: 520, minWidth: 180,
    backgroundColor: 'rgba(28,28,32,0.97)',
    borderRadius: 18, paddingVertical: 11, paddingLeft: 11, paddingRight: 18,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 14,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 19, flexShrink: 1, letterSpacing: -0.1 },
});

export const useToast = (): ToastContextType => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};
