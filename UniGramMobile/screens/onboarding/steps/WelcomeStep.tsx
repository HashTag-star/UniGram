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
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#09090b', '#000']} style={StyleSheet.absoluteFill} />

      {/* Hero Graphic / Badge */}
      <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoScale }] }]}>
        <View style={styles.logoBadgeContainer}>
          <LinearGradient colors={['#a855f7', '#8b5cf6', '#4338ca']} style={styles.logoGradient}>
            <Ionicons name="sparkles" size={48} color="#fff" />
          </LinearGradient>
        </View>
        <View style={styles.logoGlow} />
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'flex-start', width: '100%' }}>
        <Text style={styles.title}>Welcome{'\n'}to UniGram</Text>
        <Text style={styles.subtitle}>The social network built exclusively for your campus community.</Text>

        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <Animated.View key={f.icon} style={[styles.featureRow, { opacity: fadeAnim }]}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon as any} size={22} color="#c084fc" />
              </View>
              <Text style={styles.featureText}>{f.label}</Text>
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={[styles.bottom, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.btn} onPress={onNext} activeOpacity={0.85}>
          <LinearGradient colors={['#8b5cf6', '#6366f1']} start={{x:0, y:0}} end={{x:1, y:1}} style={styles.btnGradient}>
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
  container: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 56, paddingHorizontal: 28, minHeight: height - 55 },
  logoWrap: { alignItems: 'center', marginTop: 30, position: 'relative' },
  logoBadgeContainer: { padding: 12, borderRadius: 40, backgroundColor: 'rgba(139,92,246,0.1)' },
  logoGradient: { width: 100, height: 100, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontSize: 56, fontWeight: '900', color: '#fff' },
  logoGlow: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: '#8b5cf6', opacity: 0.25, top: 4, left: 4 },
  title: { fontSize: 44, fontWeight: '900', color: '#fff', textAlign: 'left', marginTop: 32, letterSpacing: -1, lineHeight: 48 },
  subtitle: { fontSize: 16, color: 'rgba(255,255,255,0.4)', textAlign: 'left', marginTop: 12, lineHeight: 24, paddingRight: 40, fontWeight: '500' },
  features: { marginTop: 40, gap: 20, width: '100%' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  featureIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(139,92,246,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)' },
  featureText: { fontSize: 17, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  bottom: { width: '100%', gap: 16 },
  btn: { borderRadius: 20, overflow: 'hidden', shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  btnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  terms: { color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
