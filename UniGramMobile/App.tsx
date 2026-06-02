import './global.css';
import React, { useState, useEffect, useRef, useTransition, useCallback, memo, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet,
  StatusBar, Animated, ActivityIndicator, DeviceEventEmitter, Modal,
  InteractionManager, BackHandler, Platform, ToastAndroid,
} from 'react-native';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, AntDesign, MaterialIcons, FontAwesome } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { FeedScreen } from './screens/FeedScreen';
import { PostDetailModal } from './components/PostDetailModal';
import { ExploreScreen } from './screens/ExploreScreen';
import { ReelsScreen } from './screens/ReelsScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { MarketScreen } from './screens/MarketScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { NotificationsScreen, NotificationsScreenProps } from './screens/NotificationsScreen';
import { VerificationScreen } from './screens/VerificationScreen';
import { DiscoverPeopleScreen } from './screens/DiscoverPeopleScreen';
import { TrendingScreen } from './screens/TrendingScreen';
import { CreatePostModal } from './screens/CreatePostModal';
import LoginScreen from './screens/auth/LoginScreen';
import SignupScreen from './screens/auth/SignupScreen';
import ResetPasswordScreen from './screens/auth/ResetPasswordScreen';
import { OnboardingNavigator } from './screens/onboarding/OnboardingNavigator';
import { QuickCaptureScreen } from './screens/QuickCaptureScreen';
import PrivacyPolicyScreen from './screens/legal/PrivacyPolicyScreen';
import TermsOfServiceScreen from './screens/legal/TermsOfServiceScreen';
import CommunityGuidelinesScreen from './screens/legal/CommunityGuidelinesScreen';
import PagerView from 'react-native-pager-view';
import { isOnboardingComplete } from './services/onboarding';
import { getUnreadNotificationCount } from './services/notifications';
import { registerForPushNotifications, onNotificationResponseReceived } from './services/pushNotifications';
import { supabase, SupabaseTimeoutError } from './lib/supabase';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { PopupProvider } from './context/PopupContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { createStory } from './services/stories';
import { getConversations } from './services/messages';
import { AccountService } from './services/accounts';
import { useHaptics as useAppHaptics } from './hooks/useHaptics';
import { useLastSeen } from './hooks/useLastSeen';
import { setAudioModeAsync } from 'expo-audio';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, FadeIn } from 'react-native-reanimated';

type Tab = 'feed' | 'explore' | 'reels' | 'market' | 'messages' | 'profile';
type AuthScreen = 'login' | 'signup';
type LegalOverlay = 'privacy' | 'terms' | 'guidelines' | null;

// ─── Context for volatile app state ─────────────────────────────────────────

interface AppStateContextType {
  feedRefreshKey: number;
  setFeedRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  profileRefreshKey: number;
  setProfileRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  messageBadge: number;
  setMessageBadge: React.Dispatch<React.SetStateAction<number>>;
  notifBadge: number;
  setNotifBadge: React.Dispatch<React.SetStateAction<number>>;
}

const AppStateContext = React.createContext<AppStateContextType | undefined>(undefined);

const useAppState = () => {
  const ctx = React.useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};

const AppStateProvider = ({ children }: { children: React.ReactNode }) => {
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [messageBadge, setMessageBadge] = useState(0);
  const [notifBadge, setNotifBadge] = useState(0);

  const value = useMemo(() => ({
    feedRefreshKey, setFeedRefreshKey,
    profileRefreshKey, setProfileRefreshKey,
    messageBadge, setMessageBadge,
    notifBadge, setNotifBadge,
  }), [feedRefreshKey, profileRefreshKey, messageBadge, notifBadge]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

const TABS: Array<{ id: Tab; icon: string; activeIcon: string; label: string }> = [
  { id: 'feed',     icon: 'home-outline',          activeIcon: 'home-sharp',      label: 'Home'     },
  { id: 'explore',  icon: 'search-outline',         activeIcon: 'search',          label: 'Explore'  },
  { id: 'reels',    icon: 'play-circle-outline',    activeIcon: 'play-circle',     label: 'Reels'    },
  { id: 'market',   icon: 'bag-outline',            activeIcon: 'bag',             label: 'Market'   },
  { id: 'profile',  icon: 'person-outline',         activeIcon: 'person',          label: 'Profile'  },
];

const LoadingScreen: React.FC = () => {
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const ring1Scale = useRef(new Animated.Value(0.4)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(0.4)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;
  const ring3Scale = useRef(new Animated.Value(0.4)).current;
  const ring3Opacity = useRef(new Animated.Value(0)).current;
  const textSlide = useRef(new Animated.Value(20)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;
  const bgOrbAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Phase 1 — logo pops in (300ms)
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 100, friction: 10, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(bgOrbAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      // Phase 2 — rings expand in quick succession (300ms)
      Animated.stagger(50, [
        Animated.parallel([
          Animated.spring(ring1Scale, { toValue: 1, tension: 90, friction: 12, useNativeDriver: true }),
          Animated.timing(ring1Opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(ring2Scale, { toValue: 1, tension: 85, friction: 12, useNativeDriver: true }),
          Animated.timing(ring2Opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(ring3Scale, { toValue: 1, tension: 80, friction: 12, useNativeDriver: true }),
          Animated.timing(ring3Opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]),
      ]),
      // Phase 3 — text slides up (200ms)
      Animated.parallel([
        Animated.spring(textSlide, { toValue: 0, tension: 130, friction: 14, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.timing(indicatorOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(ring3Scale, { toValue: 1.15, duration: 2000, useNativeDriver: true }),
          Animated.timing(ring3Scale, { toValue: 1, duration: 2000, useNativeDriver: true }),
        ])
      ).start();
    }, 700);

    Animated.loop(
      Animated.sequence([
        Animated.timing(bgOrbAnim, { toValue: 1.2, duration: 3000, useNativeDriver: true }),
        Animated.timing(bgOrbAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={loadStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />
      <Animated.View style={[loadStyles.orb1, { transform: [{ scale: bgOrbAnim }], opacity: bgOrbAnim.interpolate({ inputRange:[1, 1.2], outputRange:[0.15, 0.25] }) }]} />
      <Animated.View style={[loadStyles.orb2, { transform: [{ scale: bgOrbAnim }], opacity: bgOrbAnim.interpolate({ inputRange:[1, 1.2], outputRange:[0.1, 0.2] }) }]} />
      <LinearGradient colors={['rgba(139,92,246,0.15)', 'rgba(79,70,229,0.05)', 'transparent']} style={loadStyles.bgGrad} />
      <LinearGradient colors={['transparent', 'rgba(109,40,217,0.1)', 'rgba(76,29,149,0.15)']} style={loadStyles.bgGradBottom} />
      <Animated.View style={[loadStyles.ring, loadStyles.ring3, { transform: [{ scale: ring3Scale }], opacity: ring3Opacity }]} />
      <Animated.View style={[loadStyles.ring, loadStyles.ring2, { transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />
      <Animated.View style={[loadStyles.ring, loadStyles.ring1, { transform: [{ scale: ring1Scale }], opacity: ring1Opacity }]} />
      <Animated.View style={[loadStyles.logoWrap, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
        <View style={loadStyles.logoGlow} />
        <LinearGradient colors={['#a855f7', '#8b5cf6', '#4338ca']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={loadStyles.logo}>
          <Text style={loadStyles.logoText}>U</Text>
        </LinearGradient>
      </Animated.View>
      <Animated.View style={[loadStyles.textWrap, { opacity: textOpacity, transform: [{ translateY: textSlide }] }]}>
        <Text style={loadStyles.appName}>UniGram</Text>
        <Text style={loadStyles.tagline}>Your campus, connected.</Text>
      </Animated.View>
      <Animated.View style={[loadStyles.indicatorWrap, { opacity: indicatorOpacity }]}>
        <ActivityIndicator size="small" color="rgba(167,139,250,0.6)" />
      </Animated.View>
    </View>
  );
};

const BottomTabBar = memo(({ 
  activeTabVisual, 
  onTabChange, 
  colors 
}: { 
  activeTabVisual: Tab; 
  onTabChange: (tab: Tab) => void; 
  colors: any 
}) => {
  return (
    <SafeAreaView edges={['bottom']} style={[styles.bottomNav, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
      <View style={styles.bottomNavInner}>
        {TABS.map(tab => {
          const isActive = activeTabVisual === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onTabChange(tab.id)}
              onPressIn={() => {
                // Pre-emptive haptic for maximum snappiness
                DeviceEventEmitter.emit('haptic_selection');
              }}
              style={styles.tabBtn}
              android_ripple={{ color: colors.accent + '22', borderless: true, radius: 28 }}
              hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
            >
              {({ pressed }) => (
                <>
                  {isActive && (
                    <Reanimated.View 
                      entering={FadeIn.duration(100)}
                      style={[styles.tabIndicator, { backgroundColor: colors.accent }]} 
                    />
                  )}
                  <View style={[styles.tabIconWrap, isActive && { backgroundColor: colors.accent + '12' }, pressed && { opacity: 0.7 }]}>
                    <Ionicons name={(isActive ? tab.activeIcon : tab.icon) as any} size={25} color={isActive ? colors.accent : colors.textMuted} />
                  </View>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
});

// Screen wrapper for tab virtualization
const ScreenWrapper = memo(({ isActive, children }: { isActive: boolean; children: React.ReactNode }) => {
  return (
    <View style={[styles.screen, { display: isActive ? 'flex' : 'none', zIndex: isActive ? 10 : 0 }]} pointerEvents={isActive ? 'auto' : 'none'}>
      {children}
    </View>
  );
});

const AppScreens = memo(({
  activeTab,
  isMainVisible,
  mountedTabs,
  feedMuted,
  setFeedMuted,
  globalMuted,
  setGlobalMuted,
  initialReelId,
  initialReels,
  viewedUserId,
  initialConv,
  userProfile,
  session,
  onOpenNotifications,
  onNavigateToMessages,
  onReelPress,
  onUserPress,
  onChatStateChange,
  onVerifyPress,
  onProfileBack,
  onReelsBack,
  onShowPrivacy,
  onShowTerms,
  onShowGuidelines,
  onDiscoverPress,
  onTrendingPress,
  onCameraOpen,
}: any) => {
  
  const { feedRefreshKey, profileRefreshKey, messageBadge, notifBadge } = useAppState();

  const feedScreen = useMemo(() => (
    <FeedScreen
      refreshKey={feedRefreshKey}
      isVisible={activeTab === 'feed' && isMainVisible}
      onCameraPress={onCameraOpen}
      onNotifPress={onOpenNotifications}
      onMessagePress={() => onNavigateToMessages('messages', null)}
      messageBadge={messageBadge}
      notifBadge={notifBadge}
      onReelPress={onReelPress}
      onUserPress={onUserPress}
      isMuted={feedMuted}
      setIsMuted={setFeedMuted}
    />
  ), [activeTab === 'feed', isMainVisible, feedRefreshKey, messageBadge, notifBadge, feedMuted]);

  const exploreScreen = useMemo(() => (
    <ExploreScreen
      isVisible={activeTab === 'explore' && isMainVisible}
      onUserPress={onUserPress}
      onDiscoverPress={onDiscoverPress}
      onTrendingPress={onTrendingPress}
    />
  ), [activeTab === 'explore', isMainVisible]);

  const marketScreen = useMemo(() => (
    <MarketScreen
      isVisible={activeTab === 'market' && isMainVisible}
      onMessagePress={onNavigateToMessages}
      isSuspended={userProfile?.is_suspended}
    />
  ), [activeTab === 'market', isMainVisible]);

  const messagesScreen = useMemo(() => (
    <MessagesScreen
      isVisible={activeTab === 'messages' && isMainVisible}
      onChatStateChange={onChatStateChange}
      initialConv={initialConv}
    />
  ), [activeTab === 'messages', isMainVisible, initialConv]);

  const profileScreen = useMemo(() => (
    <ProfileScreen
      userId={viewedUserId ?? session.user.id}
      isOwn={!viewedUserId}
      refreshKey={profileRefreshKey}
      isVisible={activeTab === 'profile' && isMainVisible}
      onVerifyPress={onVerifyPress}
      onBack={viewedUserId ? onProfileBack : undefined}
      onMessagePress={onNavigateToMessages}
      onShowPrivacy={onShowPrivacy}
      onShowTerms={onShowTerms}
      onShowGuidelines={onShowGuidelines}
    />
  ), [activeTab === 'profile', isMainVisible, viewedUserId, profileRefreshKey]);

  return (
    <View style={styles.screensContainer}>
      <ScreenWrapper isActive={activeTab === 'feed'}>
        {feedScreen}
      </ScreenWrapper>

      <ScreenWrapper isActive={activeTab === 'explore'}>
        {exploreScreen}
      </ScreenWrapper>

      <ScreenWrapper isActive={activeTab === 'market'}>
        {marketScreen}
      </ScreenWrapper>

      <ScreenWrapper isActive={activeTab === 'messages'}>
        {messagesScreen}
      </ScreenWrapper>

      <ScreenWrapper isActive={activeTab === 'profile'}>
        {profileScreen}
      </ScreenWrapper>

      {activeTab === 'reels' && (
        <View style={styles.screen}>
          <ReelsScreen onBack={onReelsBack} isMuted={globalMuted} setIsMuted={setGlobalMuted} initialReelId={initialReelId} initialReels={initialReels} />
        </View>
      )}
    </View>
  );
});

function AppShell() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { setNotifBadge, setMessageBadge, setProfileRefreshKey, setFeedRefreshKey } = useAppState();
  const haptics = useAppHaptics();
  const { showToast } = useToast();
  const [session, setSession] = useState<any>(undefined);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [activeTabVisual, setActiveTabVisual] = useState<Tab>('feed');
  const [prevTab, setPrevTab] = useState<Tab>('feed');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [showDiscoverPeople, setShowDiscoverPeople] = useState(false);
  const [showTrending, setShowTrending] = useState(false);
  const [activeMedia, setActiveMedia] = useState<any>(null);
  const [isLive, setIsLive] = useState(false);
  const [viewerLiveSession, setViewerLiveSession] = useState<string | null>(null);
  const [feedMuted, setFeedMuted] = useState(true);
  const [globalMuted, setGlobalMuted] = useState(false);
  const [initialReelId, setInitialReelId] = useState<string | undefined>(undefined);
  const [initialReels, setInitialReels] = useState<any[] | undefined>(undefined);
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [minSplashDone, setMinSplashDone] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set(['feed'] as Tab[]));
  const [activeLegal, setActiveLegal] = useState<LegalOverlay>(null);
  const [initialConv, setInitialConv] = useState<any>(null);
  const [pagerPage, setPagerPage] = useState(1);
  const pagerRef = useRef<PagerView>(null);
  const [createInitialType, setCreateInitialType] = useState<'thread' | undefined>(undefined);
  const [hideTabBar, setHideTabBar] = useState(false);
  const [notifPost, setNotifPost] = useState<any>(null);
  const [notifPostComments, setNotifPostComments] = useState(false);
  const [notifCommentId, setNotifCommentId] = useState<string | undefined>(undefined);

  useLastSeen(session?.user?.id ?? null);

  // Tracks the currently authenticated user ID so auth-change events don't
  // reset onboardingDone on token refreshes for the same user.
  const activeUidRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // ── Fast startup: fonts + session + onboarding cache all in parallel ──
    const startup = async () => {
      // All three kick off simultaneously — none waits on the others. Use
      // Promise.allSettled to avoid one network timeout aborting the whole
      // startup sequence; show a friendly toast on timeout.
      const promises = [
        // Fonts: bundled assets, typically < 80ms
        Font.loadAsync({ ...Ionicons.font, ...AntDesign.font, ...MaterialIcons.font, ...FontAwesome.font })
          .then(() => { if (!cancelled) setFontsReady(true); })
          .catch(() => { if (!cancelled) setFontsReady(true); }), // never block on font errors
        // Session: reads from SecureStore, typically < 50ms
        supabase.auth.getSession(),
        // Audio pre-warm: fire-and-forget
        setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix', shouldRouteThroughEarpiece: false })
          .catch(() => {}),
      ];

      const settled = await Promise.allSettled(promises);
      if (cancelled) return;

      // Session result is the second promise
      const sessionResult = settled[1];
      let initialSession: any = undefined;
      if (sessionResult.status === 'fulfilled') {
        initialSession = sessionResult.value?.data?.session ?? sessionResult.value?.data?.session;
      } else {
        const reason = sessionResult.reason;
        if (reason instanceof SupabaseTimeoutError) {
          try { showToast(reason.userMessage, 'error'); } catch {}
          console.warn('Session fetch timed out — continuing without session.', reason.message);
        } else {
          console.warn('Session fetch failed — continuing without session.', reason);
        }
      }

      setSession(initialSession);
      const uid = initialSession?.user?.id ?? null;
      activeUidRef.current = uid;

      if (uid) {
        // Check local cache first — this is a sub-millisecond read vs a network round-trip
        try {
          const cached = await AsyncStorage.getItem(`ug_onboard:${uid}`);
          if (!cancelled && cached === 'true') {
            setOnboardingDone(true); // Show main app immediately for returning users
          }
        } catch {}
      }
    };

    startup();

    // Auth state changes: sign-in, sign-out, token refresh, etc.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      const newUid = sess?.user?.id ?? null;
      setSession(sess);
      // Only reset onboardingDone when the user actually changes, not on token refresh
      if (newUid !== activeUidRef.current) {
        activeUidRef.current = newUid;
        setOnboardingDone(null);
      }
    });

    // Splash shows briefly — 50ms to ensure a smooth transition
    const splashTimer = setTimeout(() => setMinSplashDone(true), 50);

    // Preload other tabs after the feed has had time to fully load (2 seconds)
    const preloadTimer = setTimeout(() => {
      setMountedTabs(prev => {
        const next = new Set(prev);
        ['explore', 'reels', 'market', 'messages', 'profile'].forEach(t => next.add(t as Tab));
        return next;
      });
    }, 2000);

    const hS = DeviceEventEmitter.addListener('haptic_selection', haptics.selection);
    const hM = DeviceEventEmitter.addListener('haptic_medium', haptics.medium);
    const hSu = DeviceEventEmitter.addListener('haptic_success', haptics.success);

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      clearTimeout(splashTimer);
      clearTimeout(preloadTimer);
      hS.remove();
      hM.remove();
      hSu.remove();
    };
  }, [haptics]);

  // Background profile fetch: runs after onboarding gate is already satisfied from cache.
  // Narrows select to only fields the shell needs — full profile data is fetched by ProfileScreen.
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, is_verified, verification_type, university, onboarding_completed, is_suspended, is_banned')
        .eq('id', uid)
        .single();
      if (data) {
        setUserProfile(data);
        const done = data.onboarding_completed ?? false;
        setOnboardingDone(done);
        // Cache onboarding status so next launch doesn't need a DB round-trip
        if (done) AsyncStorage.setItem(`ug_onboard:${uid}`, 'true').catch(() => {});
        AccountService.registerAccount(data, session).catch(() => {});
      } else {
        // [Ama Mensah - Lead Dev] No profile row found — treat as onboarding complete to avoid
        // an infinite loading gate, but do NOT leave userProfile as null.
        // Set a minimal stub so downstream null-checks on userProfile don't crash.
        setUserProfile({ id: uid });
        setOnboardingDone(true);
      }
    };
    fetchProfile();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    const initNotifs = async () => {
      try { const count = await getUnreadNotificationCount(uid); setNotifBadge(count); } catch {}
    };
    initNotifs();
    const channel = supabase.channel(`app-notifs-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
        setNotifBadge(b => b + 1);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    // [Ama Mensah - Lead Dev] Wrap in try/catch — getConversations can throw if network is down
    const refresh = async () => {
      try {
        const convs = await getConversations(uid);
        const total = convs.reduce((sum: number, c: any) => sum + (c.unread_count ?? 0), 0);
        setMessageBadge(total);
      } catch {}
    };
    refresh();
    // Subscribe to conversation_participants (filtered to this user) instead of the
    // unfiltered messages table — fires only when this user's unread_count changes.
    const msgChannel = supabase.channel(`app-msg-badge-${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${uid}` }, (payload: any) => {
        const delta = (payload.new.unread_count ?? 0) - (payload.old.unread_count ?? 0);
        if (delta !== 0) setMessageBadge((b: number) => Math.max(0, b + delta));
      })
      .subscribe();
    return () => { supabase.removeChannel(msgChannel); };
  }, [session?.user?.id]);

  const handleTabChange = useCallback((tab: Tab) => {
    haptics.selection(); // Immediate haptic feedback
    setActiveTabVisual(tab);
    setHideTabBar(false);
    setActiveTab(prev => { if (tab === 'reels') setPrevTab(prev); return tab; });
    if (tab !== 'profile') setViewedUserId(null);
    setMountedTabs(prev => prev.has(tab) ? prev : new Set([...prev, tab]));
  }, [haptics]);

  const navigateToMessages = useCallback((convId: string, otherProfile: any) => {
    setInitialConv({ convId, otherProfile });
    setActiveTabVisual('messages');
    setActiveTab('messages');
  }, []);

  const onOpenNotifications = useCallback(() => setShowNotifications(true), []);
  const onReelPress = useCallback((rid: any, pre: any) => {
    setInitialReelId(rid);
    setInitialReels(pre);
    setPrevTab(activeTab);
    setActiveTabVisual('reels');
    setActiveTab('reels');
  }, [activeTab]);

  const onUserPress = useCallback((u: any) => {
    setViewedUserId(u.id);
    setActiveTabVisual('profile');
    setActiveTab('profile');
  }, []);

  const onVerifyPress = useCallback(() => setShowVerification(true), []);
  const onProfileBack = useCallback(() => {
    setViewedUserId(null);
    setActiveTabVisual('explore');
    setActiveTab('explore');
  }, []);

  const onReelsBack = useCallback(() => {
    setActiveTabVisual(prevTab);
    setActiveTab(prevTab);
  }, [prevTab]);

  const onShowPrivacy = useCallback(() => setActiveLegal('privacy'), []);
  const onShowTerms = useCallback(() => setActiveLegal('terms'), []);
  const onShowGuidelines = useCallback(() => setActiveLegal('guidelines'), []);
  const onDiscoverPress = useCallback(() => setShowDiscoverPeople(true), []);
  const onTrendingPress = useCallback(() => setShowTrending(true), []);
  const onCameraOpen = useCallback(() => pagerRef.current?.setPage(0), []);

  // ─── Android hardware back button ────────────────────────────────────────
  // Without this, every back press bubbles to the OS and exits the app — a
  // brutal UX. We pop the topmost "thing" instead:
  //   1. open modals / overlays (close them)
  //   2. camera page in the pager (return to feed pager page)
  //   3. live / reels / non-feed tabs (back to feed)
  //   4. viewing someone else's profile (clear to own)
  //   5. otherwise: double-tap pattern — first press shows a toast,
  //      second press within 2s actually exits.
  const backExitArmedRef = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!session || !onboardingDone) return; // OS default while in auth/onboarding

    const onBack = () => {
      // Priority-ordered pop. First match wins.
      if (activeLegal) { setActiveLegal(null); return true; }
      if (notifPost)   { setNotifPost(null);   return true; }
      if (showCreate)  { setShowCreate(false); return true; }
      if (showVerification)  { setShowVerification(false);  return true; }
      if (showNotifications) { setShowNotifications(false); return true; }
      if (showTrending)      { setShowTrending(false);      return true; }
      if (showDiscoverPeople){ setShowDiscoverPeople(false);return true; }
      if (viewerLiveSession) { setViewerLiveSession(null);  return true; }
      if (isLive)            { setIsLive(false);            return true; }
      if (activeMedia)       { setActiveMedia(null);        return true; }

      // Pager off the main page (e.g. camera) → return to main
      if (pagerPage !== 1) { pagerRef.current?.setPage(1); return true; }

      // Reels has its own immersive screen — back goes to the tab the user
      // came from before opening reels.
      if (activeTab === 'reels') {
        const dest = prevTab && prevTab !== 'reels' ? prevTab : 'feed';
        setActiveTab(dest);
        setActiveTabVisual(dest);
        setInitialReelId(undefined);
        setInitialReels(undefined);
        return true;
      }

      // Viewing someone else's profile → back to own profile
      if (activeTab === 'profile' && viewedUserId) {
        setViewedUserId(null);
        return true;
      }

      // Any non-feed tab → back to feed
      if (activeTab !== 'feed') {
        setActiveTab('feed');
        setActiveTabVisual('feed');
        return true;
      }

      // On feed with nothing to pop → double-tap-to-exit
      if (backExitArmedRef.current) {
        backExitArmedRef.current = false;
        return false; // let the OS exit the app
      }
      backExitArmedRef.current = true;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      setTimeout(() => { backExitArmedRef.current = false; }, 2000);
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [
    session, onboardingDone,
    activeLegal, notifPost, showCreate, showVerification, showNotifications,
    showTrending, showDiscoverPeople, viewerLiveSession, isLive, activeMedia,
    pagerPage, activeTab, prevTab, viewedUserId,
  ]);

  if (!minSplashDone || !fontsReady || session === undefined || (session && onboardingDone === null)) return <LoadingScreen />;
  if (!session) {
    if (authScreen === 'signup') return (
      <View style={{ flex: 1 }}>
        <SignupScreen onNavigateLogin={() => setAuthScreen('login')} onShowPrivacy={() => setActiveLegal('privacy')} onShowTerms={() => setActiveLegal('terms')} onShowGuidelines={() => setActiveLegal('guidelines')} />
        {activeLegal === 'privacy' && <PrivacyPolicyScreen onClose={() => setActiveLegal(null)} />}
        {activeLegal === 'terms' && <TermsOfServiceScreen onClose={() => setActiveLegal(null)} />}
        {activeLegal === 'guidelines' && <CommunityGuidelinesScreen onClose={() => setActiveLegal(null)} />}
      </View>
    );
    return <LoginScreen onNavigateSignup={() => setAuthScreen('signup')} />;
  }
  if (!onboardingDone) return <OnboardingNavigator userId={session.user.id} onComplete={() => setOnboardingDone(true)} />;

  const isReels = activeTab === 'reels';
  const showTabBar = !hideTabBar && !isReels && pagerPage === 1;
  const isMainVisible = !showNotifications && !showCreate && !showVerification && pagerPage === 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} translucent={false} />
      <PagerView ref={pagerRef} style={{ flex: 1 }} initialPage={1} onPageSelected={(e) => setPagerPage(e.nativeEvent.position)} scrollEnabled={false}>
        <View key="0" style={{ flex: 1 }}>
          <QuickCaptureScreen isVisible={pagerPage === 0 && !activeMedia && !isLive} onClose={() => pagerRef.current?.setPage(1)} onCapture={setActiveMedia} onLiveStart={() => setIsLive(true)} onThreadStart={() => { pagerRef.current?.setPage(1); setCreateInitialType('thread'); setShowCreate(true); }} />
        </View>
        <View key="1" style={{ flex: 1 }}>
          <AppScreens
            activeTab={activeTab}
            isMainVisible={isMainVisible}
            mountedTabs={mountedTabs}
            feedMuted={feedMuted}
            setFeedMuted={setFeedMuted}
            globalMuted={globalMuted}
            setGlobalMuted={setGlobalMuted}
            initialReelId={initialReelId}
            initialReels={initialReels}
            viewedUserId={viewedUserId}
            initialConv={initialConv}
            userProfile={userProfile}
            session={session}
            onOpenNotifications={onOpenNotifications}
            onNavigateToMessages={navigateToMessages}
            onReelPress={onReelPress}
            onUserPress={onUserPress}
            onChatStateChange={setHideTabBar}
            onVerifyPress={onVerifyPress}
            onProfileBack={onProfileBack}
            onReelsBack={onReelsBack}
            onShowPrivacy={onShowPrivacy}
            onShowTerms={onShowTerms}
            onShowGuidelines={onShowGuidelines}
            onDiscoverPress={onDiscoverPress}
            onTrendingPress={onTrendingPress}
            onCameraOpen={onCameraOpen}
          />
          {showTabBar && (
            <TouchableOpacity
              style={styles.fab}
              onPress={() => pagerRef.current?.setPage(0)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </PagerView>
      {showTabBar && <BottomTabBar activeTabVisual={activeTabVisual} onTabChange={handleTabChange} colors={colors} />}
      {showNotifications && <View style={styles.notifOverlay}><NotificationsScreen userId={session.user.id} myAvatarUrl={userProfile?.avatar_url ?? null} onBadgeClear={() => setNotifBadge(0)} onBack={() => setShowNotifications(false)} onUserPress={(uid: string) => { setViewedUserId(uid); setActiveTabVisual('profile'); setActiveTab('profile'); setShowNotifications(false); }} onPostPress={(pid: any) => { supabase.from('posts').select('*, profiles(*)').eq('id', pid).single().then(({data}) => { setNotifPost(data); }); }} onMessagePress={navigateToMessages} onDiscoverPress={() => setShowDiscoverPeople(true)} /></View>}
      <CreatePostModal visible={showCreate} userId={session.user.id} initialType={createInitialType} onClose={() => setShowCreate(false)} onPosted={() => setFeedRefreshKey(k => k + 1)} preCapturedMedia={activeMedia} />
      <VerificationScreen visible={showVerification} onClose={() => setShowVerification(false)} />
      {showDiscoverPeople && <View style={styles.notifOverlay}><DiscoverPeopleScreen onClose={() => setShowDiscoverPeople(false)} onUserPress={(u: any) => { setViewedUserId(u.id); setActiveTabVisual('profile'); setActiveTab('profile'); setShowDiscoverPeople(false); }} /></View>}
      {showTrending && <View style={styles.notifOverlay}><TrendingScreen userId={session.user.id} university={userProfile?.university ?? ''} onBack={() => setShowTrending(false)} onUserPress={(u: any) => { setViewedUserId(u.id); setActiveTabVisual('profile'); setActiveTab('profile'); setShowTrending(false); }} /></View>}
      <Modal visible={!!notifPost} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setNotifPost(null)}>{notifPost && <PostDetailModal post={notifPost} currentUserId={session?.user?.id ?? ''} openComments={notifPostComments} initialCommentId={notifCommentId} onClose={() => setNotifPost(null)} />}</Modal>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <AppStateProvider>
            <PopupProvider>
              <ToastProvider>
                <BottomSheetModalProvider>
                  <AppShell />
                </BottomSheetModalProvider>
              </ToastProvider>
            </PopupProvider>
          </AppStateProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  screensContainer: { flex: 1, position: 'relative' },
  screen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fab: { position: 'absolute', right: 18, bottom: 14, width: 52, height: 52, borderRadius: 26, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', zIndex: 100, shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 12 },
  bottomNav: { backgroundColor: '#000', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  bottomNavInner: { flexDirection: 'row', paddingVertical: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2, position: 'relative' },
  tabIndicator: { position: 'absolute', top: 0, left: '25%', right: '25%', height: 2, backgroundColor: '#818cf8', borderRadius: 1 },
  tabIconWrap: { padding: 4, borderRadius: 10 },
  notifOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 200 },
});

const loadStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bgGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%' },
  bgGradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%' },
  orb1: { position: 'absolute', width: 400, height: 400, borderRadius: 200, backgroundColor: '#8b5cf6', top: -100, right: -150, opacity: 0.15 },
  orb2: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: '#c084fc', bottom: -50, left: -100, opacity: 0.1 },
  ring: { position: 'absolute', borderRadius: 9999, borderWidth: 1.5 },
  ring1: { width: 170, height: 170, borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.04)' },
  ring2: { width: 250, height: 250, borderColor: 'rgba(139,92,246,0.15)', backgroundColor: 'transparent' },
  ring3: { width: 350, height: 350, borderColor: 'rgba(139,92,246,0.06)', backgroundColor: 'transparent' },
  logoWrap: { zIndex: 10, marginBottom: 40, position: 'relative' },
  logoGlow: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: '#8b5cf6', top: -15, left: -15, opacity: 0.25 },
  logo: { width: 110, height: 110, borderRadius: 36, alignItems: 'center', justifyContent: 'center', shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.8, shadowRadius: 40, elevation: 30 },
  logoText: { fontSize: 64, fontWeight: '900', color: '#fff', letterSpacing: -3 },
  textWrap: { alignItems: 'center', gap: 8, marginTop: 10 },
  appName: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -1.5 },
  tagline: { fontSize: 15, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, fontWeight: '500' },
  indicatorWrap: { position: 'absolute', bottom: 64 },
});
