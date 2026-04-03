import './global.css';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Animated,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FeedScreen } from './screens/FeedScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { ReelsScreen } from './screens/ReelsScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { MarketScreen } from './screens/MarketScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { VerificationScreen } from './screens/VerificationScreen';
import { CreatePostModal } from './screens/CreatePostModal';
import LoginScreen from './screens/auth/LoginScreen';
import SignupScreen from './screens/auth/SignupScreen';
import { OnboardingNavigator } from './screens/onboarding/OnboardingNavigator';
import { isOnboardingComplete } from './services/onboarding';
import { supabase } from './lib/supabase';

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
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <View style={loadStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Animated.View style={[loadStyles.logoWrap, { transform: [{ scale }], opacity }]}>
        <View style={loadStyles.logo}>
          <Text style={loadStyles.logoText}>U</Text>
        </View>
      </Animated.View>
      <Animated.View style={{ opacity, alignItems: 'center' }}>
        <Text style={loadStyles.appName}>UniGram</Text>
        <Text style={loadStyles.tagline}>Your campus, connected.</Text>
      </Animated.View>
    </View>
  );
};

const loadStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  logoWrap: { marginBottom: 20 },
  logo: { width: 80, height: 80, borderRadius: 22, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 20 },
  logoText: { fontSize: 48, fontWeight: '900', color: '#fff' },
  appName: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 4 },
});

// ─── App shell ────────────────────────────────────────────────────────────────
function AppShell() {
  const insets = useSafeAreaInsets();
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setOnboardingDone(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    isOnboardingComplete(session.user.id)
      .then(setOnboardingDone)
      .catch(() => setOnboardingDone(true));
  }, [session?.user?.id]);

  if (session === undefined || (session && onboardingDone === null)) return <LoadingScreen />;
  if (!session) {
    if (authScreen === 'signup') return <SignupScreen onNavigateLogin={() => setAuthScreen('login')} />;
    return <LoginScreen onNavigateSignup={() => setAuthScreen('signup')} />;
  }
  if (!onboardingDone) {
    return <OnboardingNavigator userId={session.user.id} onComplete={() => setOnboardingDone(true)} />;
  }

  const handleTabChange = (tab: Tab) => {
    if (tab === 'reels') setPrevTab(activeTab);
    if (tab !== 'profile') setViewedUserId(null);
    setActiveTab(tab);
    setHideTabBar(false);
  };

  const isReels = activeTab === 'reels';
  // Tab bar hidden for: full-screen reels, or when in a chat
  const showTabBar = !isReels && !hideTabBar;

  const TAB_BAR_HEIGHT = 58;

  const renderScreen = () => {
    switch (activeTab) {
      case 'feed':
        return (
          <FeedScreen
            refreshKey={feedRefreshKey}
            onCreateStory={() => setShowCreate(true)}
          />
        );
      case 'explore':
        return (
          <ExploreScreen
            onUserPress={(profile: any) => { setViewedUserId(profile.id); setActiveTab('profile'); }}
          />
        );
      case 'reels':
        return (
          <ReelsScreen
            onBack={() => setActiveTab(prevTab)}
          />
        );
      case 'market':  return <MarketScreen />;
      case 'messages':
        return (
          <MessagesScreen
            onChatStateChange={setHideTabBar}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            userId={viewedUserId ?? session.user.id}
            isOwn={!viewedUserId}
            onVerifyPress={() => setShowVerification(true)}
            onBack={viewedUserId ? () => { setViewedUserId(null); setActiveTab('explore'); } : undefined}
          />
        );
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent={false} />

      <View style={styles.content}>{renderScreen()}</View>

      {/* Floating "+" create button — only when tab bar is visible */}
      {showTabBar && (
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
        <SafeAreaView edges={['bottom']} style={styles.bottomNav}>
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
                  <View style={[styles.tabIconWrap, isActive && styles.tabIconActive]}>
                    <Ionicons
                      name={(isActive ? tab.activeIcon : tab.icon) as any}
                      size={22}
                      color={isActive ? '#818cf8' : 'rgba(255,255,255,0.4)'}
                    />
                  </View>
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SafeAreaView>
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
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1 },
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
});
