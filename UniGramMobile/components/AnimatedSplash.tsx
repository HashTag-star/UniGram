import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';

const { width: W, height: H } = Dimensions.get('window');
const MARK = 96;                         // matches the native splash image (192dp * 50%)
const MIN_MS = 2300;                     // the intro always gets to play
const BRAND = ['#6366f1', '#8b5cf6', '#d946ef'] as const;
const WORD = 'UniGram'.split('');

// Orbiting "campus" glyphs: icon, orbit radius, start angle (turns), speed multiplier
const ORBITERS = [
  { icon: 'images', r: 96, a: 0.00, k: 1, color: '#a5b4fc' },
  { icon: 'chatbubble-ellipses', r: 118, a: 0.25, k: -1, color: '#f0abfc' },
  { icon: 'bag-handle', r: 96, a: 0.50, k: 1, color: '#c4b5fd' },
  { icon: 'play-circle', r: 118, a: 0.75, k: -1, color: '#fda4af' },
] as const;

interface Props {
  /** True once the app knows what to show next (session + fonts resolved). */
  ready: boolean;
  /** Called after the exit animation completes — unmount the splash. */
  onDone: () => void;
}

/**
 * Immersive launch animation: shockwave rings, orbiting campus glyphs, a twinkling
 * star field, an elastic logo pop and a staggered wordmark reveal. It keeps playing
 * until the app is ready, then zooms through to whatever comes next.
 */
export const AnimatedSplash: React.FC<Props> = ({ ready, onDone }) => {
  const startedAt = useRef(Date.now()).current;
  const exiting = useRef(false);

  // ── Animated values (all native-driver) ───────────────────────────────────
  const intro = useRef(new Animated.Value(0)).current;          // logo pop
  const glow = useRef(new Animated.Value(0)).current;           // glow breathing
  const orbit = useRef(new Animated.Value(0)).current;          // 0→1 loop
  const letters = useRef(WORD.map(() => new Animated.Value(0))).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;          // loader shimmer
  const orbIn = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;
  const waves = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  const stars = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    x: (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * W,
    y: (Math.sin(i * 78.233) * 12345.6789 % 1 + 1) % 1 * H,
    s: 1 + (i % 3),
    v: new Animated.Value(Math.random()),
    d: 1400 + (i % 5) * 500,
  })), []);

  useEffect(() => {
    // Hand over from the native splash the instant our first frame exists.
    SplashScreen.hideAsync().catch(() => {});

    const loops: Animated.CompositeAnimation[] = [];
    const loop = (a: Animated.CompositeAnimation) => { loops.push(a); a.start(); };

    Animated.timing(orbIn, { toValue: 1, duration: 900, useNativeDriver: true }).start();

    // Beat 1 — logo: elastic pop
    Animated.spring(intro, { toValue: 1, tension: 70, friction: 6.5, delay: 120, useNativeDriver: true }).start();

    // Beat 2 — shockwave rings, staggered and repeating
    waves.forEach((w, i) => loop(Animated.loop(Animated.sequence([
      Animated.delay(500 + i * 650),
      Animated.timing(w, { toValue: 1, duration: 1950, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(w, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]))));

    // Beat 3 — wordmark letters rise one after another
    Animated.stagger(70, letters.map(l =>
      Animated.spring(l, { toValue: 1, tension: 90, friction: 9, useNativeDriver: true }),
    )).start();
    Animated.timing(tagline, { toValue: 1, duration: 600, delay: 1100, useNativeDriver: true }).start();

    // Ambient motion
    loop(Animated.loop(Animated.timing(orbit, { toValue: 1, duration: 16000, easing: Easing.linear, useNativeDriver: true })));
    loop(Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])));
    loop(Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true })));
    stars.forEach(st => loop(Animated.loop(Animated.sequence([
      Animated.timing(st.v, { toValue: 1, duration: st.d, useNativeDriver: true }),
      Animated.timing(st.v, { toValue: 0.1, duration: st.d, useNativeDriver: true }),
    ]))));

    return () => loops.forEach(l => { try { l.stop(); } catch {} });
  }, []);

  // ── Exit: wait for readiness + minimum runtime, then fly through ──────────
  useEffect(() => {
    if (!ready || exiting.current) return;
    const wait = Math.max(0, MIN_MS - (Date.now() - startedAt));
    const t = setTimeout(() => {
      exiting.current = true;
      Animated.timing(exit, { toValue: 1, duration: 520, easing: Easing.in(Easing.cubic), useNativeDriver: true })
        .start(() => onDone());
    }, wait);
    return () => clearTimeout(t);
  }, [ready]);

  const spin = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const unspin = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const spinRev = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

  const containerStyle = {
    opacity: exit.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 0.9, 0] }),
    transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
  };
  const logoStyle = {
    opacity: intro.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
    transform: [
      { scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
      { rotate: intro.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] }) },
    ],
  };

  return (
    <View style={s.root} pointerEvents="auto">
      <Animated.View style={[StyleSheet.absoluteFill, containerStyle]}>
        {/* Deep-space backdrop */}
        <LinearGradient colors={['#05030d', '#000000', '#04020a']} style={StyleSheet.absoluteFill} />

        {/* Drifting colour fields */}
        <Animated.View style={[s.field, s.fieldA, { opacity: orbIn.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }), transform: [{ rotate: spin }] }]}>
          <LinearGradient colors={['rgba(99,102,241,0.42)', 'rgba(99,102,241,0)']} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={[s.field, s.fieldB, { opacity: orbIn.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }), transform: [{ rotate: spinRev }] }]}>
          <LinearGradient colors={['rgba(217,70,239,0.32)', 'rgba(217,70,239,0)']} style={StyleSheet.absoluteFill} />
        </Animated.View>

        {/* Star field */}
        {stars.map((st, i) => (
          <Animated.View
            key={i}
            style={{ position: 'absolute', left: st.x, top: st.y, width: st.s, height: st.s, borderRadius: st.s, backgroundColor: '#fff', opacity: Animated.multiply(st.v, 0.55) }}
          />
        ))}

        {/* Stage — centred on the same point as the native splash image */}
        <View style={s.stage}>
          {/* Shockwave rings */}
          {waves.map((w, i) => (
            <Animated.View
              key={i}
              style={[s.wave, {
                opacity: w.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
                transform: [{ scale: w.interpolate({ inputRange: [0, 1], outputRange: [0.7, 3.1] }) }],
              }]}
            />
          ))}

          {/* Orbit tracks */}
          <Animated.View style={[s.track, { width: 192, height: 192, opacity: orbIn }]} />
          <Animated.View style={[s.track, { width: 236, height: 236, opacity: orbIn }]} />

          {/* Orbiting glyphs (counter-rotated so icons stay upright) */}
          <Animated.View style={[s.orbitLayer, { opacity: intro, transform: [{ rotate: spin }] }]}>
            {ORBITERS.map((o, i) => {
              const ang = o.a * Math.PI * 2;
              return (
                <Animated.View
                  key={i}
                  style={[s.orbiter, {
                    left: 130 + Math.cos(ang) * o.r - 15,
                    top: 130 + Math.sin(ang) * o.r - 15,
                    transform: [{ rotate: unspin }],
                  }]}
                >
                  <Ionicons name={o.icon as any} size={15} color={o.color} />
                </Animated.View>
              );
            })}
          </Animated.View>

          {/* Glow */}
          <Animated.View style={[s.glow, {
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.95] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }],
          }]} />

          {/* Logo mark */}
          <Animated.View style={[s.mark, logoStyle]}>
            <LinearGradient colors={BRAND as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.markFill}>
              <Text style={s.markLetter}>U</Text>
            </LinearGradient>
          </Animated.View>
        </View>

        {/* Wordmark */}
        <View style={s.wordWrap}>
          <View style={s.wordRow}>
            {WORD.map((ch, i) => (
              <Animated.Text
                key={i}
                style={[s.letter, {
                  opacity: letters[i],
                  transform: [
                    { translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
                    { scale: letters[i].interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                  ],
                }]}
              >
                {ch}
              </Animated.Text>
            ))}
          </View>
          <Animated.Text style={[s.tagline, {
            opacity: tagline,
            transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          }]}>
            YOUR CAMPUS, CONNECTED
          </Animated.Text>
        </View>

        {/* Loader hairline */}
        <View style={s.loader}>
          <Animated.View style={[s.loaderBar, {
            transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-90, 140] }) }],
          }]}>
            <LinearGradient colors={['transparent', '#a78bfa', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: '#000', zIndex: 9999 },
  field: { position: 'absolute', borderRadius: 999, overflow: 'hidden' },
  fieldA: { width: 520, height: 520, top: -170, left: -150 },
  fieldB: { width: 460, height: 460, bottom: -150, right: -170 },

  // Matches the native splash: mark centred on the screen
  stage: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  wave: { position: 'absolute', width: MARK, height: MARK, borderRadius: 34, borderWidth: 1.5, borderColor: 'rgba(167,139,250,0.9)' },
  track: { position: 'absolute', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(167,139,250,0.28)' },
  orbitLayer: { position: 'absolute', width: 260, height: 260 },
  orbiter: {
    position: 'absolute', width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  glow: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(139,92,246,0.32)' },
  mark: { width: MARK, height: MARK, borderRadius: MARK * 0.32, overflow: 'hidden' },
  markFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  markLetter: { color: '#fff', fontSize: MARK * 0.6, fontWeight: '800', letterSpacing: -2, marginTop: -3 },

  wordWrap: { position: 'absolute', left: 0, right: 0, top: H / 2 + 118, alignItems: 'center' },
  wordRow: { flexDirection: 'row' },
  letter: { color: '#fff', fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  tagline: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, fontWeight: '600', letterSpacing: 3.2, marginTop: 10 },

  loader: { position: 'absolute', bottom: 64, alignSelf: 'center', width: 140, height: 2, borderRadius: 1, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
  loaderBar: { position: 'absolute', width: 90, height: 2 },
});
