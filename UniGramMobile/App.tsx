import './global.css';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Animated, ActivityIndicator,
} from 'react-native';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, AntDesign, MaterialIcons, FontAwesome } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { FeedScreen } from './screens/FeedScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { ReelsScreen } from './screens/ReelsScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { MarketScreen } from './screens/MarketScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { VerificationScreen } from './screens/VerificationScreen';
import { CreatePostModal } from './screens/CreatePostModal';
import LoginScreen from './screens/auth/LoginScreen';
import SignupScreen from './screens/auth/SignupScreen';
import ResetPasswordScreen from './screens/auth/ResetPasswordScreen';
import { OnboardingNavigator } from './screens/onboarding/OnboardingNavigator';
import { isOnboardingComplete } from './services/onboarding';
import { getUnreadNotificationCount } from './services/notifications';
import { registerForPushNotifications } from './services/pushNotifications';
import { supabase } from './lib/supabase';
import { ThemeProvider, useTheme } from './context/ThemeContext';

type Tab = 'feed' | 'explore' | 'reels' | 'market' | 'messages' | 'profile';
type AuthScreen = 'login' | 'signup';

const TABS: Array<{ id: Tab; icon: string; activeIcon: string; label: string }> = [
  { id: 'feed',     icon: 'home-outline',        activeIcon: 'home',        label: 'Home'     },
  { id: 'explore',  icon: 'search-outline',       activeIcon: 'search',      label: 'Explore'  },
  { id: 'reels',    icon: 'film-outline',          activeIcon: 'film',        label: 'Reels'    },
  { id: 'market',   icon: 'bag-outline',           activeIcon: 'bag',         label: 'Market'   },
  { id: 'messages', icon: 'chatbubble-outline',    activeIcon: 'chatbubble',  label: 'Messages' },
  { id: 'profile',  icon: 'person-outline',        activeIcon: 'person',      label: 'Profile'  },
];

// ─── Splash screen ────────────────────────────────────────────────────────────
const LoadingScreen: React.FC = () => {
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  const ring1Scale = useRef(new Animated.Value(0.4)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(0.4)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;
  const ring3Scale = useRef(new Animated.Value(0.4)).current;
  const ring3Opacity = useRef(new Animated.Value(0)).current;

  const textSlide = useRef(new Animated.Value(16)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance sequence
    Animated.sequence([
      // Logo springs in
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 65, friction: 7, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]),
      // Rings cascade out
      Animated.stagger(80, [
        Animated.parallel([
          Animated.spring(ring1Scale, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true }),
          Animated.timing(ring1Opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(ring2Scale, { toValue: 1, tension: 45, friction: 9, useNativeDriver: true }),
          Animated.timing(ring2Opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(ring3Scale, { toValue: 1, tension: 40, friction: 9, useNativeDriver: true }),
          Animated.timing(ring3Opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]),
      ]),
      // Text slides up
      Animated.parallel([
        Animated.spring(textSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
      // Spinner
      Animated.timing(indicatorOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Outer ring breathes independently after entrance
    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(ring3Scale, { toValue: 1.12, duration: 1600, useNativeDriver: true }),
          Animated.timing(ring3Scale, { toValue: 1, duration: 1600, useNativeDriver: true }),
        ])
      ).start();
    }, 900);
  }, []);

  return (
    <View style={loadStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#05050a" />

      {/* Background gradient */}
      <LinearGradient
        colors={['rgba(99,102,241,0.22)', 'rgba(67,56,202,0.1)', 'transparent']}
        style={[loadStyles.bgGrad, { pointerEvents: 'none' }]}
      />
      <LinearGradient
        colors={['transparent', 'rgba(79,70,229,0.1)', 'rgba(109,40,217,0.06)']}
        style={[loadStyles.bgGradBottom, { pointerEvents: 'none' }]}
      />

      {/* Concentric rings */}
      <Animated.View style={[loadStyles.ring, loadStyles.ring3, {
        transform: [{ scale: ring3Scale }],
        opacity: ring3Opacity,
      }]} />
      <Animated.View style={[loadStyles.ring, loadStyles.ring2, {
        transform: [{ scale: ring2Scale }],
        opacity: ring2Opacity,
      }]} />
      <Animated.View style={[loadStyles.ring, loadStyles.ring1, {
        transform: [{ scale: ring1Scale }],
        opacity: ring1Opacity,
      }]} />

      {/* Logo */}
      <Animated.View style={[loadStyles.logoWrap, {
        transform: [{ scale: logoScale }],
        opacity: logoOpacity,
      }]}>
        <LinearGradient
          colors={['#818cf8', '#6366f1', '#4338ca']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={loadStyles.logo}
        >
          <Text style={loadStyles.logoText}>U</Text>
        </LinearGradient>
      </Animated.View>

      {/* Wordmark + tagline */}
      <Animated.View style={[loadStyles.textWrap, {
        opacity: textOpacity,
        transform: [{ translateY: textSlide }],
      }]}>
        <Text style={loadStyles.appName}>UniGram</Text>
        <Text style={loadStyles.tagline}>Your campus, connected.</Text>
      </Animated.View>

      {/* Spinner */}
      <Animated.View style={[loadStyles.indicatorWrap, { opacity: indicatorOpacity }]}>
        <ActivityIndicator size="small" color="rgba(129,140,248,0.55)" />
      </Animated.View>
    </View>
  );
};

const loadStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050a', alignItems: 'center', justifyContent: 'center' },

  bgGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%' },
  bgGradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%' },

  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
  },
  ring1: {
    width: 148, height: 148,
    borderColor: 'rgba(99,102,241,0.4)',
    backgroundColor: 'rgba(79,70,229,0.07)',
  },
  ring2: {
    width: 210, height: 210,
    borderColor: 'rgba(99,102,241,0.2)',
    backgroundColor: 'transparent',
  },
  ring3: {
    width: 284, height: 284,
    borderColor: 'rgba(99,102,241,0.1)',
    backgroundColor: 'transparent',
  },

  logoWrap: { zIndex: 10, marginBottom: 28 },
  logo: {
    width: 90, height: 90, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.75, shadowRadius: 30, elevation: 30,
  },
  logoText: { fontSize: 54, fontWeight: '900', color: '#fff', letterSpacing: -2 },

  textWrap: { alignItems: 'center', gap: 7 },
  appName: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.32)', letterSpacing: 0.3 },

  indicatorWrap: { position: 'absolute', bottom: 64 },
});

// ─── App shell ────────────────────────────────────────────────────────────────
function AppShell() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [session, setSession] = useState<any>(undefined);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [prevTab, setPrevTab] = useState<Tab>('feed');
  const [showVerification, setShowVerification] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [hideTabBar, setHideTabBar] = useState(false); // for messages chat & full-screen
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [initialConv, setInitialConv] = useState<{ convId: string; otherProfile: any } | null>(null);
  const [notifBadge, setNotifBadge] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [resetPasswordMode, setResetPasswordMode] = useState(false);
  const notifChannelRef = useRef<any>(null);
  const showNotifsRef = useRef(false);

  useEffect(() => {
    showNotifsRef.current = showNotifications;
  }, [showNotifications]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setOnboardingDone(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Handle deep links from auth emails (confirmation & password reset)
  useEffect(() => {
    const handleUrl = async (url: string) => {
      if (!url.includes('auth-callback')) return;

      // Tokens arrive in the hash fragment for the implicit flow
      const hash = url.split('#')[1];
      if (!hash) return;

      const params: Record<string, string> = {};
      hash.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
      });

      const { access_token, refresh_token, type } = params;
      if (!access_token || !refresh_token) return;

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) return;

      if (type === 'recovery') {
        setResetPasswordMode(true);
      }
    };

    Linking.getInitialURL().then(url => { if (url) handleUrl(url); });
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!session) return;
    isOnboardingComplete(session.user.id)
      .then(setOnboardingDone)
      .catch(() => setOnboardingDone(true));
  }, [session?.user?.id]);

  // Load unread count + subscribe to new notifications
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;

    // Initial unread count
    getUnreadNotificationCount(uid).then(setNotifBadge).catch(() => {});

    // Register for push notifications (no-op in Expo Go)
    registerForPushNotifications(uid).catch(() => {});

    // Realtime: increment badge when new notification arrives and screen is not active
    const channel = supabase
      .channel(`app-notifs-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload: any) => {
          if (!showNotifsRef.current) {
            setNotifBadge(b => b + 1);
          }
          // If this user was just verified, force-reload the profile screen
          if (payload.new?.type === 'verification_approved') {
            setProfileRefreshKey(k => k + 1);
          }
        }
      )
      .subscribe();
    notifChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  if (session === undefined || (session && onboardingDone === null)) return <LoadingScreen />;
  if (!session) {
    if (authScreen === 'signup') return <SignupScreen onNavigateLogin={() => setAuthScreen('login')} />;
    return <LoginScreen onNavigateSignup={() => setAuthScreen('signup')} />;
  }
  if (resetPasswordMode) {
    return <ResetPasswordScreen onDone={() => { setResetPasswordMode(false); supabase.auth.signOut(); }} />;
  }
  if (!onboardingDone) {
    return <OnboardingNavigator userId={session.user.id} onComplete={() => setOnboardingDone(true)} />;
  }

  const handleTabChange = (tab: Tab) => {
    if (tab === 'reels') setPrevTab(activeTab);
    if (tab !== 'profile') setViewedUserId(null);
    if (tab !== 'messages') setInitialConv(null);
    setActiveTab(tab);
    setHideTabBar(false);
  };

  const openNotifications = () => {
    setNotifBadge(0);
    setShowNotifications(true);
  };

  const navigateToMessages = (convId: string, otherProfile: any) => {
    setInitialConv({ convId, otherProfile });
    setActiveTab('messages');
  };

  // Reels is full-screen video — unmount when not active to free GPU/memory.
  // All other tabs stay permanently mounted so switching is instant (display:none trick).
  const isReels = activeTab === 'reels';
  const showTabBar = !hideTabBar; // navbar stays visible on Reels too
  const TAB_BAR_HEIGHT = 58;

  // Helper: style that hides a screen without unmounting it
  const hide = (tab: Tab) => activeTab !== tab ? styles.screenHidden : undefined;

  // Each screen should only be "active" (playing media) if its tab is active
  // AND no full-screen overlays (like Notifications) are currently visible.
  const isMainVisible = !showNotifications;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} translucent={false} />

      {/* ── Screens container (flex:1 → tab bar is pushed to bottom) ── */}
      <View style={styles.screensContainer}>
        {/* Each screen uses absoluteFill inside the container so they overlap
            each other but NOT the tab bar. display:none hides without unmount. */}
        <View style={[styles.screen, hide('feed')]}>
          <FeedScreen
            refreshKey={feedRefreshKey}
            isVisible={activeTab === 'feed' && isMainVisible}
            onCreateStory={() => setShowCreate(true)}
            onNotifPress={openNotifications}
            notifBadge={notifBadge}
            onReelPress={() => setActiveTab('reels')}
            onUserPress={(profile: any) => { setViewedUserId(profile.id); setActiveTab('profile'); }}
          />
        </View>
        <View style={[styles.screen, hide('explore')]}>
          <ExploreScreen
            isVisible={activeTab === 'explore' && isMainVisible}
            onUserPress={(profile: any) => { setViewedUserId(profile.id); setActiveTab('profile'); }}
          />
        </View>
        <View style={[styles.screen, hide('market')]}>
          <MarketScreen isVisible={activeTab === 'market' && isMainVisible} onMessagePress={navigateToMessages} />
        </View>
        <View style={[styles.screen, hide('messages')]}>
          <MessagesScreen
            isVisible={activeTab === 'messages' && isMainVisible}
            onChatStateChange={setHideTabBar}
            initialConv={initialConv}
          />
        </View>
        <View style={[styles.screen, hide('profile')]}>
          <ProfileScreen
            key={`${viewedUserId ?? session.user.id}-${profileRefreshKey}`}
            userId={viewedUserId ?? session.user.id}
            isOwn={!viewedUserId}
            isVisible={activeTab === 'profile' && isMainVisible}
            onVerifyPress={() => setShowVerification(true)}
            onBack={viewedUserId ? () => { setViewedUserId(null); setActiveTab('explore'); } : undefined}
            onMessagePress={navigateToMessages}
          />
        </View>

        {/* Reels: full-screen video, only mount when active to free GPU memory */}
        {isReels && (
          <View style={styles.screen}>
            <ReelsScreen onBack={() => setActiveTab(prevTab)} />
          </View>
        )}
      </View>

      {/* Floating "+" create button — hide on Reels */}
      {showTabBar && !isReels && (
        <TouchableOpacity
          style={[styles.fab, { bottom: TAB_BAR_HEIGHT + insets.bottom + 14 }]}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Bottom tab bar */}
      {showTabBar && (
        <SafeAreaView edges={['bottom']} style={[styles.bottomNav, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
          <View style={styles.bottomNavInner}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => handleTabChange(tab.id)}
                  style={styles.tabBtn}
                  activeOpacity={0.7}
                >
                  {isActive && <View style={styles.tabIndicator} />}
                  <View style={[styles.tabIconWrap, isActive && { backgroundColor: colors.accent + '15' }]}>
                    <Ionicons
                      name={(isActive ? tab.activeIcon : tab.icon) as any}
                      size={22}
                      color={isActive ? colors.accent : colors.textMuted}
                    />
                  </View>
                  <Text style={[styles.tabLabel, { color: colors.textMuted }, isActive && { color: colors.accent }]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SafeAreaView>
      )}

      {/* Notifications overlay — full-screen */}
      {showNotifications && (
        <View style={[styles.notifOverlay, { backgroundColor: colors.bg }]}>
          <NotificationsScreen
            userId={session.user.id}
            onBadgeClear={() => setNotifBadge(0)}
            onBack={() => setShowNotifications(false)}
          />
        </View>
      )}

      <VerificationScreen visible={showVerification} onClose={() => setShowVerification(false)} />

      <CreatePostModal
        visible={showCreate}
        userId={session.user.id}
        onClose={() => setShowCreate(false)}
        onPosted={() => setFeedRefreshKey(k => k + 1)}
      />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = Font.useFonts({
    ...Ionicons.font,
    ...AntDesign.font,
    ...MaterialIcons.font,
    ...FontAwesome.font,
  });

  if (!fontsLoaded) return <LoadingScreen />;

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  // screensContainer takes all space above the tab bar (flex:1 in a column root)
  screensContainer: { flex: 1, position: 'relative' },
  // each screen fills the container; display:none hides without unmounting
  screen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  screenHidden: { display: 'none' },
  fab: {
    position: 'absolute', right: 18,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#4f46e5',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
    shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 12,
  },
  bottomNav: { backgroundColor: '#000', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  bottomNavInner: { flexDirection: 'row', paddingVertical: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2, position: 'relative' },
  tabIndicator: { position: 'absolute', top: 0, left: '25%', right: '25%', height: 2, backgroundColor: '#818cf8', borderRadius: 1 },
  tabIconWrap: { padding: 4, borderRadius: 10 },
  tabIconActive: { backgroundColor: 'rgba(99,102,241,0.1)' },
  tabLabel: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: '500' },
  tabLabelActive: { color: '#818cf8' },
  notifOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
    zIndex: 200,
  },
});
