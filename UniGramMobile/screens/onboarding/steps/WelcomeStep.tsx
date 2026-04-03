import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

interface Props { onNext: () => void; }

const FEATURES = [
  { icon: 'people-outline', label: 'Connect with classmates' },
  { icon: 'bag-outline', label: 'Campus marketplace' },
  { icon: 'film-outline', label: 'Campus reels & stories' },
  { icon: 'shield-checkmark-outline', label: 'Verified community' },
];

export function WelcomeStep({ onNext }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f0f1a', '#000']} style={StyleSheet.absoluteFill} />

      {/* Logo */}
      <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoScale }] }]}>
        <LinearGradient colors={['#6366f1', '#4f46e5', '#3730a3']} style={styles.logoGradient}>
          <Text style={styles.logoLetter}>U</Text>
        </LinearGradient>
        <View style={styles.logoGlow} />
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center' }}>
        <Text style={styles.title}>Welcome to UniGram</Text>
        <Text style={styles.subtitle}>The social network built exclusively for your campus community.</Text>

        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <Animated.View
              key={f.icon}
              style={[styles.featureRow, { opacity: fadeAnim }]}
            >
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon as any} size={20} color="#818cf8" />
              </View>
              <Text style={styles.featureText}>{f.label}</Text>
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={[styles.bottom, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.btn} onPress={onNext} activeOpacity={0.85}>
          <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.btnGradient}>
            <Text style={styles.btnText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.terms}>By continuing you agree to our Terms & Privacy Policy</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 48, paddingHorizontal: 28, minHeight: height - 55 },
  logoWrap: { alignItems: 'center', marginTop: 20, position: 'relative' },
  logoGradient: { width: 96, height: 96, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontSize: 56, fontWeight: '900', color: '#fff' },
  logoGlow: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#4f46e5', opacity: 0.2, top: -12, left: -12 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'center', marginTop: 24, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 10, lineHeight: 22, paddingHorizontal: 10 },
  features: { marginTop: 36, gap: 16, width: '100%' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(99,102,241,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)' },
  featureText: { fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  bottom: { width: '100%', gap: 14 },
  btn: { borderRadius: 16, overflow: 'hidden' },
  btnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  terms: { color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
