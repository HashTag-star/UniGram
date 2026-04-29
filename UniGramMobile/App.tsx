import './global.css';
import React, { useState, useEffect, useRef, useTransition } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet,
  StatusBar, Animated, ActivityIndicator, DeviceEventEmitter, Modal, ScrollView,
} from 'react-native';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, AntDesign, MaterialIcons, FontAwesome } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { FeedScreen, FeedPost } from './screens/FeedScreen';
import { CommentSheet } from './components/CommentSheet';
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
import { supabase } from './lib/supabase';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { PopupProvider } from './context/PopupContext';
import { ToastProvider } from './context/ToastContext';
// Screens will be loaded dynamically if safe
// import { LiveScreen } from './screens/LiveScreen';
// import { MediaEditScreen } from './screens/MediaEditScreen';
import { createStory } from './services/stories';
import { getConversations } from './services/messages';
import { AccountService } from './services/accounts';
import { runOnJS } from 'react-native-worklets';
import { useHaptics as useAppHaptics } from './hooks/useHaptics';
import { useLastSeen } from './hooks/useLastSeen';
import { setAudioModeAsync } from 'expo-audio';

type Tab = 'feed' | 'explore' | 'reels' | 'market' | 'messages' | 'profile';
type AuthScreen = 'login' | 'signup';
type LegalOverlay = 'privacy' | 'terms' | 'guidelines' | null;

const TABS: Array<{ id: Tab; icon: string; activeIcon: string; label: string }> = [
  { id: 'feed',     icon: 'home-outline',          activeIcon: 'home-sharp',      label: 'Home'     },
  { id: 'explore',  icon: 'search-outline',         activeIcon: 'search',          label: 'Explore'  },
  { id: 'reels',    icon: 'play-circle-outline',    activeIcon: 'play-circle',     label: 'Reels'    },
  { id: 'market',   icon: 'bag-outline',            activeIcon: 'bag',             label: 'Market'   },
  { id: 'profile',  icon: 'person-outline',         activeIcon: 'person',          label: 'Profile'  },
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

  const textSlide = useRef(new Animated.Value(20)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;
  const bgOrbAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance sequence
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 55, friction: 8, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(bgOrbAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
      Animated.stagger(120, [
        Animated.parallel([
          Animated.spring(ring1Scale, { toValue: 1, tension: 40, friction: 10, useNativeDriver: true }),
          Animated.timing(ring1Opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(ring2Scale, { toValue: 1, tension: 35, friction: 10, useNativeDriver: true }),
          Animated.timing(ring2Opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(ring3Scale, { toValue: 1, tension: 30, friction: 10, useNativeDriver: true }),
          Animated.timing(ring3Opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
      ]),
      Animated.parallel([
        Animated.spring(textSlide, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(indicatorOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(ring3Scale, { toValue: 1.15, duration: 2000, useNativeDriver: true }),
          Animated.timing(ring3Scale, { toValue: 1, duration: 2000, useNativeDriver: true }),
        ])
      ).start();
    }, 1200);

    // Orb slow pulse
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

      {/* Abstract Glowing Aura Orbs */}
      <Animated.View style={[loadStyles.orb1, { transform: [{ scale: bgOrbAnim }], opacity: bgOrbAnim.interpolate({ inputRange:[1, 1.2], outputRange:[0.15, 0.25] }) }]} />
      <Animated.View style={[loadStyles.orb2, { transform: [{ scale: bgOrbAnim }], opacity: bgOrbAnim.interpolate({ inputRange:[1, 1.2], outputRange:[0.1, 0.2] }) }]} />

      {/* Background gradient */}
      <LinearGradient
        colors={['rgba(139,92,246,0.15)', 'rgba(79,70,229,0.05)', 'transparent']}
        style={[loadStyles.bgGrad, { pointerEvents: 'none' }]}
      />
      <LinearGradient
        colors={['transparent', 'rgba(109,40,217,0.1)', 'rgba(76,29,149,0.15)']}
        style={[loadStyles.bgGradBottom, { pointerEvents: 'none' }]}
      />

      {/* Concentric rings */}
      <Animated.View style={[loadStyles.ring, loadStyles.ring3, { transform: [{ scale: ring3Scale }], opacity: ring3Opacity }]} />
      <Animated.View style={[loadStyles.ring, loadStyles.ring2, { transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />
      <Animated.View style={[loadStyles.ring, loadStyles.ring1, { transform: [{ scale: ring1Scale }], opacity: ring1Opacity }]} />

      {/* Logo */}
      <Animated.View style={[loadStyles.logoWrap, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
        <View style={loadStyles.logoGlow} />
        <LinearGradient
          colors={['#a855f7', '#8b5cf6', '#4338ca']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={loadStyles.logo}
        >
          <Text style={loadStyles.logoText}>U</Text>
        </LinearGradient>
      </Animated.View>

      {/* Wordmark + tagline */}
      <Animated.View style={[loadStyles.textWrap, { opacity: textOpacity, transform: [{ translateY: textSlide }] }]}>
        <Text style={loadStyles.appName}>UniGram</Text>
        <Text style={loadStyles.tagline}>Your campus, connected.</Text>
      </Animated.View>

      {/* Spinner */}
      <Animated.View style={[loadStyles.indicatorWrap, { opacity: indicatorOpacity }]}>
        <ActivityIndicator size="small" color="rgba(167,139,250,0.6)" />
      </Animated.View>
    </View>
  );
};

const loadStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  bgGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%' },
  bgGradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%' },
  orb1: { position: 'absolute', width: 400, height: 400, borderRadius: 200, backgroundColor: '#8b5cf6', top: -100, right: -150, opacity: 0.15 },
  orb2: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: '#c084fc', bottom: -50, left: -100, opacity: 0.1 },

  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1.5,
  },
  ring1: {
    width: 170, height: 170,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(139,92,246,0.04)',
  },
  ring2: {
    width: 250, height: 250,
    borderColor: 'rgba(139,92,246,0.15)',
    backgroundColor: 'transparent',
  },
  ring3: {
    width: 350, height: 350,
    borderColor: 'rgba(139,92,246,0.06)',
    backgroundColor: 'transparent',
  },

  logoWrap: { zIndex: 10, marginBottom: 40, position: 'relative' },
  logoGlow: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: '#8b5cf6', top: -15, left: -15, opacity: 0.25 },
  logo: {
    width: 110, height: 110, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8, shadowRadius: 40, elevation: 30,
  },
  logoText: { fontSize: 64, fontWeight: '900', color: '#fff', letterSpacing: -3 },

  textWrap: { alignItems: 'center', gap: 8, marginTop: 10 },
  appName: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -1.5 },
  tagline: { fontSize: 15, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, fontWeight: '500' },

  indicatorWrap: { position: 'absolute', bottom: 64 },
});

const PremiumUploadToast = () => {
  const [data, setData] = useState<any>(null); // { status, type, progress, id }
  const [expanded, setExpanded] = useState(false);
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const haptics = useAppHaptics();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dismissTimer = useRef<any>(null);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('upload_status', (payload) => {
      setData(payload);
      
      if (payload.status === 'loading') {
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }).start();
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
      } else if (payload.status === 'success') {
        haptics.success();
        setExpanded(false);
        dismissTimer.current = setTimeout(dismiss, 4000);
      } else if (payload.status === 'error') {
        haptics.error();
        setExpanded(false);
        dismissTimer.current = setTimeout(dismiss, 5000);
      }
    });

    return () => {
      sub.remove();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const dismiss = () => {
    Animated.timing(slideAnim, { toValue: -120, duration: 400, useNativeDriver: true }).start(() => {
      setData(null);
      setExpanded(false);
    });
  };

  const handleCancel = () => {
    haptics.medium();
    DeviceEventEmitter.emit('cancel_upload');
    dismiss();
  };

  if (!data) return null;

  const isPosting = data.status === 'loading';
  const progressPercent = Math.round((data.progress || 0) * 100);

  return (
    <Animated.View style={[toastStyles.container, { top: insets.top + 10, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity 
        activeOpacity={0.9} 
        onPress={() => isPosting && setExpanded(!expanded)}
        style={[toastStyles.toast, { backgroundColor: colors.bg + 'F2', borderColor: colors.border }]}
      >
        <View style={toastStyles.header}>
          <View style={[toastStyles.iconWrap, { backgroundColor: isPosting ? '#6366f122' : data.status === 'success' ? '#10b98122' : '#ef444422' }]}>
            {isPosting ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <Ionicons 
                name={data.status === 'success' ? 'checkmark-circle' : 'alert-circle'} 
                size={22} 
                color={data.status === 'success' ? '#10b981' : '#ef4444'} 
              />
            )}
          </View>
          
          <View style={{ flex: 1 }}>
            <Text style={[toastStyles.title, { color: colors.text }]}>
              {isPosting ? `Sharing ${data.type}...` : data.status === 'success' ? 'Shared successfully!' : 'Upload failed'}
            </Text>
            {isPosting && !expanded && (
               <Text style={[toastStyles.sub, { color: colors.textMuted }]}>{progressPercent}% complete</Text>
            )}
            {!isPosting && (
               <Text style={[toastStyles.sub, { color: colors.textMuted }]}>
                 {data.status === 'success' ? 'Your post is now live' : data.message || 'Check your connection'}
               </Text>
            )}
          </View>

          {isPosting && (
            <Ionicons 
              name={expanded ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color={colors.textMuted} 
            />
          )}
        </View>

        {isPosting && expanded && (
          <View style={toastStyles.expandedContent}>
            <View style={[toastStyles.progressTrack, { backgroundColor: colors.border }]}>
               <Animated.View style={[toastStyles.progressFill, { width: `${progressPercent}%`, backgroundColor: '#6366f1' }]} />
            </View>
            <View style={toastStyles.actions}>
              <TouchableOpacity onPress={handleCancel} style={toastStyles.cancelBtn}>
                 <Text style={toastStyles.cancelText}>Cancel Upload</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const toastStyles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, zIndex: 10000 },
  toast: {
    padding: 12, borderRadius: 16, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 1 },
  expandedContent: { marginTop: 16, gap: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  cancelText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
});

// ─── Notification post modal ──────────────────────────────────────────────────
const NotifPostModal: React.FC<{
  post: any;
  currentUserId: string;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
  openComments: boolean;
  onClose: () => void;
}> = ({ post, currentUserId, isMuted, setIsMuted, openComments, onClose }) => {
  const { colors } = useTheme();
  const [showComments, setShowComments] = useState(openComments);
  const [commentCount, setCommentCount] = useState<number>(post.comments_count ?? 0);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 14, paddingBottom: 14, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginLeft: 10 }}>
            @{post.profiles?.username ?? 'Post'}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <FeedPost
            post={{ ...post, comments_count: commentCount }}
            currentUserId={currentUserId}
            isLiked={false}
            isSaved={false}
            isMuted={isMuted}
            isActive={true}
            setIsMuted={setIsMuted}
            onOpenComments={() => setShowComments(true)}
            onCommentCountChange={(_, delta) => setCommentCount(c => Math.max(0, c + delta))}
          />
        </ScrollView>
      </View>
      <CommentSheet
        visible={showComments}
        targetId={post.id}
        targetType="post"
        currentUserId={currentUserId}
        authorId={post.user_id}
        onClose={() => setShowComments(false)}
        onCountChange={delta => setCommentCount(c => Math.max(0, c + delta))}
        onCountSync={count => setCommentCount(count)}
      />
    </Modal>
  );
};

// ─── App shell ────────────────────────────────────────────────────────────────
function AppShell() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [session, setSession] = useState<any>(undefined);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [activeTabVisual, setActiveTabVisual] = useState<Tab>('feed');
  const [prevTab, setPrevTab] = useState<Tab>('feed');
  const [showVerification, setShowVerification] = useState(false);
  const [showDiscoverPeople, setShowDiscoverPeople] = useState(false);
  const [showTrending, setShowTrending] = useState(false);
  const [activeMedia, setActiveMedia] = useState<any>(null);
  const [isLive, setIsLive] = useState(false);
  const [feedMuted, setFeedMuted] = useState(true);   // feed videos always start muted
  const [globalMuted, setGlobalMuted] = useState(false); // reels auto-unmute
  const [initialReelId, setInitialReelId] = useState<string | undefined>(undefined);
  const [initialReels, setInitialReels] = useState<any[] | undefined>(undefined);

  const handleCapture = (items: any[]) => {
    setActiveMedia(items);
    // Stay on Page 0 (Camera side) but show the Edit full-screen overlay
  };

  const handleEditNext = (editedItems: any[]) => {
    // If it's a story, we can post it right away. 
    // If it's a post/reel, we move to the final CreatePostModal.
    const mode = activeMedia[0].mode;
    if (mode === 'STORY') {
      setActiveMedia(null);
      pagerRef.current?.setPage(1);
      // Post all as stories
      editedItems.forEach(item => {
        createStory(session.user.id, item.uri);
      });
      setFeedRefreshKey(k => k + 1);
    } else {
      // For POST/REEL, we merge edited info back
      setActiveMedia(editedItems.map((it, idx) => ({
        ...activeMedia[idx],
        ...it
      })));
      setShowCreate(true);
    }
  };
  const [showCreate, setShowCreate] = useState(false);
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [hideTabBar, setHideTabBar] = useState(false); // for messages chat & full-screen
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [initialConv, setInitialConv] = useState<{ convId: string; otherProfile: any } | null>(null);
  const [notifBadge, setNotifBadge] = useState(0);
  const [messageBadge, setMessageBadge] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifPost, setNotifPost] = useState<any>(null);
  const [notifPostComments, setNotifPostComments] = useState(false);
  // Lazy-mount tabs: a screen only mounts on first visit, then stays alive (display:none)
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set(['feed'] as Tab[]));
  const [activeLegal, setActiveLegal] = useState<LegalOverlay>(null);
  const [resetPasswordMode, setResetPasswordMode] = useState(false);
  const notifChannelRef = useRef<any>(null);
  const showNotifsRef = useRef(false);
  const pagerRef = useRef<PagerView>(null);
  const [pagerPage, setPagerPage] = useState(1);
  const [isEdgeSwiping, setIsEdgeSwiping] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [minSplashDone, setMinSplashDone] = useState(false);

  useLastSeen(session?.user?.id ?? null);

  // Configure audio session once on startup so UniGram never interrupts
  // background music when its own sounds are muted or idle.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      // iOS: mix with other audio so background music keeps playing at full volume.
      // Individual video players switch to 'duckOthers' only when the user unmutes.
      interruptionMode: 'mixWithOthers',
      // Android: same intent — don't steal focus from background music.
      interruptionModeAndroid: 'duckOthers',
      shouldPlayInBackground: false,
    }).catch(() => {});
  }, []);

  // Sync badge count with app icon (native)
  useEffect(() => {
    const { setBadgeCount } = require('./services/pushNotifications');
    setBadgeCount(notifBadge).catch(() => {});
  }, [notifBadge]);

  const [pagerScrollEnabled, setPagerScrollEnabled] = useState(true);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('setPagerScroll', (enabled: boolean) => {
      setPagerScrollEnabled(enabled);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    showNotifsRef.current = showNotifications;
  }, [showNotifications]);

  useEffect(() => {
    // 1. Initial session check
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // 2. Auth listener
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setOnboardingDone(null);
    });

    // 3. Minimum Splash Duration
    const splashTimer = setTimeout(() => {
      setMinSplashDone(true);
    }, 1800);

    // 4. Safety Fallback: Never stay on splash longer than 3.5s if session is known
    const fallbackTimer = setTimeout(() => {
      setOnboardingDone(prev => prev === null ? true : prev);
    }, 3500);

    const switchSub = DeviceEventEmitter.addListener('ACCOUNT_SWITCHED', (uid) => {
      setProfileRefreshKey(k => k + 1);
      setFeedRefreshKey(k => k + 1);
    });

    const logoutSub = DeviceEventEmitter.addListener('FORCE_LOGOUT', () => {
      setSession(null);
      setOnboardingDone(null);
      setAuthScreen('login');
    });

    const navProfileSub = DeviceEventEmitter.addListener('NAVIGATE_PROFILE', ({ userId }: { userId: string }) => {
      setViewedUserId(userId);
      setActiveTab('profile');
      setActiveTabVisual('profile');
    });

    return () => {
      listener.subscription.unsubscribe();
      switchSub.remove();
      logoutSub.remove();
      navProfileSub.remove();
      clearTimeout(splashTimer);
      clearTimeout(fallbackTimer);
    };
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
    if (!session?.user?.id) return;
    const uid = session.user.id;
    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .single();
        
        if (error) throw error;
        
        if (data) {
          setUserProfile(data);
          setOnboardingDone(data.onboarding_completed ?? false);
          // Register in multi-account service
          AccountService.registerAccount(data, session).catch(() => {});
        } else {
          setOnboardingDone(true);
        }
      } catch (e) {
        setOnboardingDone(true);
      }
    };
    fetchProfile();
  }, [session?.user?.id]);

  // Load unread count + subscribe to new notifications
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;

    const initNotifications = async () => {
      try {
        const count = await getUnreadNotificationCount(uid);
        setNotifBadge(count);
      } catch (e) { /* silent */ }

      try {
        await registerForPushNotifications(uid);
      } catch (e) { /* silent */ }
    };

    initNotifications();

    // Realtime: increment notif badge when not on notifications screen
    const channel = supabase
      .channel(`app-notifs-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload: any) => {
          if (!showNotifsRef.current) setNotifBadge(b => b + 1);
          if (payload.new?.type === 'verification_approved') setProfileRefreshKey(k => k + 1);
        }
      )
      .subscribe();
    notifChannelRef.current = channel;

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  // Unread message badge — recalculate when tab changes away from messages
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;

    const refresh = async () => {
      try {
        const convs = await getConversations(uid);
        const total = convs.reduce((sum: number, c: any) => sum + (c.unread_count ?? 0), 0);
        setMessageBadge(total);
      } catch { /* silent */ }
    };

    refresh();

    const msgChannel = supabase
      .channel(`app-msg-badge-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { if (activeTab !== 'messages') refresh(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(msgChannel); };
  }, [session?.user?.id, activeTab]);

  const handleNotificationAction = (data: any) => {
    if (!data) return;
    const { type, userId, postId, conversationId, otherProfile } = data;

    setShowNotifications(false);
    setShowVerification(false);
    setShowDiscoverPeople(false);
    setShowCreate(false);

    switch (type) {
      case 'follow':
      case 'verification_approved':
        if (userId) { setViewedUserId(userId); setActiveTab('profile'); }
        break;

      case 'like':
      case 'comment':
      case 'mention':
        // Open the specific post in a modal
        if (postId) {
          supabase
            .from('posts')
            .select('*, profiles(id, username, avatar_url, is_verified, verification_type)')
            .eq('id', postId)
            .single()
            .then(({ data: post }) => {
              if (post) {
                setNotifPost(post);
                setNotifPostComments(type === 'comment' || type === 'mention');
              } else if (userId) {
                setViewedUserId(userId); setActiveTab('profile');
              }
            });
        } else if (userId) {
          setViewedUserId(userId); setActiveTab('profile');
        }
        break;

      case 'new_post':
        // New post from someone you follow → open the post
        if (postId) {
          supabase
            .from('posts')
            .select('*, profiles(id, username, avatar_url, is_verified, verification_type)')
            .eq('id', postId)
            .single()
            .then(({ data: post }) => {
              if (post) {
                setNotifPost(post);
              } else {
                setActiveTab('feed');
              }
            });
        } else {
          setActiveTab('feed');
        }
        break;

      case 'new_story':
        // Story from someone you follow → go to feed (story bar is at top)
        setActiveTab('feed');
        break;

      case 'live_started': {
        // Someone you follow started a live → navigate to feed and open the live
        const sessionId = data.sessionId || postId;
        if (sessionId) {
          supabase
            .from('live_sessions')
            .select('*, profiles(id, username, avatar_url)')
            .eq('id', sessionId)
            .eq('status', 'live')
            .single()
            .then(({ data: ls }) => {
              setActiveTab('feed');
              if (ls) {
                setTimeout(() => DeviceEventEmitter.emit('JOIN_LIVE_SESSION', ls), 400);
              }
            });
        } else {
          setActiveTab('feed');
        }
        break;
      }

      case 'reel_like':
      case 'reel_comment':
        setActiveTab('reels');
        break;

      case 'message':
        if (conversationId && otherProfile) {
          navigateToMessages(conversationId, otherProfile);
        } else {
          setActiveTab('messages');
        }
        break;

      case 'announcement':
      case 'notifications':
      default:
        setShowNotifications(true);
        break;
    }
  };

  const tabMap: Record<string, string> = {
    'like': 'post',
    'comment': 'post',
    'mention': 'post',
    'reel_like': 'post',
    'reel_comment': 'post',
    'follow': 'profile',
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    
    let sub: any;
    onNotificationResponseReceived((response: any) => {
      const data = response.notification.request.content.data;
      if (data) handleNotificationAction(data);
    }).then(s => sub = s);

    return () => sub?.remove();
  }, [session?.user?.id]);

  if (!minSplashDone || session === undefined || (session && onboardingDone === null)) return <LoadingScreen />;
  if (!session) {
    if (authScreen === 'signup') return (
      <View style={{ flex: 1 }}>
        <SignupScreen 
          onNavigateLogin={() => setAuthScreen('login')} 
          onShowPrivacy={() => setActiveLegal('privacy')}
          onShowTerms={() => setActiveLegal('terms')}
          onShowGuidelines={() => setActiveLegal('guidelines')}
        />
        {activeLegal === 'privacy' && <PrivacyPolicyScreen onClose={() => setActiveLegal(null)} />}
        {activeLegal === 'terms' && <TermsOfServiceScreen onClose={() => setActiveLegal(null)} />}
        {activeLegal === 'guidelines' && <CommunityGuidelinesScreen onClose={() => setActiveLegal(null)} />}
      </View>
    );
    return <LoginScreen onNavigateSignup={() => setAuthScreen('signup')} />;
  }
  if (resetPasswordMode) {
    return <ResetPasswordScreen onDone={() => { setResetPasswordMode(false); supabase.auth.signOut(); }} />;
  }
  if (!onboardingDone) {
    return <OnboardingNavigator userId={session.user.id} onComplete={() => setOnboardingDone(true)} />;
  }

  const handleTabChange = (tab: Tab) => {
    // Immediate: icon, indicator, and screen visibility all switch in one render
    setActiveTabVisual(tab);
    setActiveTab(tab);
    setHideTabBar(false);
    // Deferred: pure bookkeeping that has no visible effect on the incoming screen
    startTransition(() => {
      if (tab === 'reels') {
        setPrevTab(activeTab);
        // Clear deep-link state when navigating to Reels via tab bar (not a reel tap)
        setInitialReelId(undefined);
        setInitialReels(undefined);
      }
      if (tab !== 'profile') setViewedUserId(null);
      if (tab !== 'messages') setInitialConv(null);
      if (tab === 'messages') setMessageBadge(0);
      setMountedTabs(prev => prev.has(tab) ? prev : new Set([...prev, tab]));
    });
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
  // Other tabs use lazy-mount + display:none: mount on first visit, keep alive after.
  const isReels = activeTab === 'reels';
  const showTabBar = !hideTabBar;
  const TAB_BAR_HEIGHT = 58;
  const hide = (tab: Tab) => activeTab !== tab ? styles.screenHidden : undefined;
  // Returns true if a screen should be rendered (first visit or already visited)
  const shouldMount = (tab: Tab) => mountedTabs.has(tab) || activeTab === tab;

  // Each screen should only be "active" (playing media) if its tab is active
  // AND no full-screen overlays (like Notifications) are currently visible.
  const isMainVisible = !showNotifications && !showCreate && !showVerification && pagerPage === 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} translucent={false} />

      <PagerView 
        ref={pagerRef}
        style={{ flex: 1 }} 
        initialPage={1}
        onPageSelected={(e) => {
          setPagerPage(e.nativeEvent.position);
          setIsEdgeSwiping(false);
        }}
        scrollEnabled={false} // Disable swiping to prevent conflicts
      >
        {/* Page 0: Side-Swipe Camera (IG Style) */}
        <View key="0" style={{ flex: 1 }}>
          <QuickCaptureScreen 
            isVisible={pagerPage === 0 && !activeMedia && !isLive} 
            onClose={() => pagerRef.current?.setPage(1)}
            onCapture={handleCapture}
            onLiveStart={() => setIsLive(true)}
          />
        </View>

        {/* Page 1: Main App Content */}
        <View key="1" style={{ flex: 1 }}>
          <View style={[styles.screensContainer]}>
            {/* Each screen uses absoluteFill inside the container so they overlap
                each other but NOT the tab bar. display:none hides without unmount. */}
            <View style={[styles.screen, hide('feed')]}>
                <FeedScreen
                  refreshKey={feedRefreshKey}
                  isVisible={activeTab === 'feed' && isMainVisible}
                  onCreateStory={undefined}
                  onCameraPress={() => pagerRef.current?.setPage(0)}
                  onNotifPress={openNotifications}
                  onMessagePress={() => { setMessageBadge(0); setActiveTab('messages'); }}
                  messageBadge={messageBadge}
                  notifBadge={notifBadge}
                  onReelPress={(reelId?, previewReels?) => {
                    if (reelId) {
                      setInitialReelId(reelId);
                      setInitialReels(previewReels);
                    } else {
                      setInitialReelId(undefined);
                      setInitialReels(undefined);
                    }
                    setPrevTab('feed');
                    setActiveTabVisual('reels');
                    setActiveTab('reels');
                  }}
                  onUserPress={(profile: any) => { setViewedUserId(profile.id); setActiveTab('profile'); }}
                  isMuted={feedMuted}
                  setIsMuted={setFeedMuted}
                />
            </View>
            {shouldMount('explore') && (
              <View style={[styles.screen, hide('explore')]}>
                <ExploreScreen
                  isVisible={activeTab === 'explore' && isMainVisible}
                  onUserPress={(profile: any) => { setViewedUserId(profile.id); setActiveTab('profile'); }}
                  onDiscoverPress={() => setShowDiscoverPeople(true)}
                  onTrendingPress={() => setShowTrending(true)}
                />
              </View>
            )}
            {shouldMount('market') && (
              <View style={[styles.screen, hide('market')]}>
                <MarketScreen
                  isVisible={activeTab === 'market' && isMainVisible}
                  onMessagePress={navigateToMessages}
                  isSuspended={userProfile?.is_suspended}
                />
              </View>
            )}
            {shouldMount('messages') && (
              <View style={[styles.screen, hide('messages')]}>
                <MessagesScreen
                  isVisible={activeTab === 'messages' && isMainVisible}
                  onChatStateChange={setHideTabBar}
                  initialConv={initialConv}
                />
              </View>
            )}
            {shouldMount('profile') && (
              <View style={[styles.screen, hide('profile')]}>
                <ProfileScreen
                  key={`${viewedUserId ?? session.user.id}-${profileRefreshKey}`}
                  userId={viewedUserId ?? session.user.id}
                  isOwn={!viewedUserId}
                  isVisible={activeTab === 'profile' && isMainVisible}
                  onVerifyPress={() => setShowVerification(true)}
                  onBack={viewedUserId ? () => { setViewedUserId(null); setActiveTab('explore'); } : undefined}
                  onMessagePress={navigateToMessages}
                  onShowPrivacy={() => setActiveLegal('privacy')}
                  onShowTerms={() => setActiveLegal('terms')}
                  onShowGuidelines={() => setActiveLegal('guidelines')}
                />
              </View>
            )}

            {/* Reels: full-screen video, only mount when active to free GPU memory */}
            {isReels && (
              <View style={styles.screen}>
                <ReelsScreen
                  onBack={() => setActiveTab(prevTab)}
                  isMuted={globalMuted}
                  setIsMuted={setGlobalMuted}
                  initialReelId={initialReelId}
                  initialReels={initialReels}
                />
              </View>
            )}
          </View>

          {/* Floating "+" create button — hide on Reels */}
          {showTabBar && !isReels && (
            <TouchableOpacity
              style={[styles.fab, { bottom: 14 }]}
              onPress={() => pagerRef.current?.setPage(0)}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </PagerView>

      {/* Tab bar: always outside PagerView so native video layers never cover it */}
      {showTabBar && (
        <SafeAreaView
          edges={['bottom']}
          style={[styles.bottomNav, { backgroundColor: colors.bg, borderTopColor: colors.border }]}
        >
          <View style={styles.bottomNavInner}>
            {TABS.map(tab => {
              const isActive = activeTabVisual === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => handleTabChange(tab.id)}
                  style={styles.tabBtn}
                  android_ripple={{ color: colors.accent + '22', borderless: true, radius: 28 }}
                  hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                >
                  {({ pressed }) => (
                    <>
                      {isActive && <View style={styles.tabIndicator} />}
                      <View style={[
                        styles.tabIconWrap,
                        isActive && { backgroundColor: colors.accent + '15' },
                        pressed && { opacity: 0.65 },
                      ]}>
                        <Ionicons
                          name={(isActive ? tab.activeIcon : tab.icon) as any}
                          size={26}
                          color={isActive ? colors.accent : colors.textMuted}
                        />
                      </View>
                    </>
                  )}
                </Pressable>
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
            onUserPress={(uid: string) => handleNotificationAction({ type: 'follow', userId: uid })}
            onPostPress={(pid: string, uid: string, notifType: string) => handleNotificationAction({ type: notifType, postId: pid, userId: uid })}
            onMessagePress={navigateToMessages}
          />
        </View>
      )}

      {/* Full-screen Media Edit Stage */}
      {activeMedia && (
        <View style={StyleSheet.absoluteFill}>
          {(() => {
            const { MediaEditScreen } = require('./screens/MediaEditScreen');
            return (
              <MediaEditScreen
                items={activeMedia}
                mode={activeMedia[0].mode}
                onNext={handleEditNext}
                onCancel={() => setActiveMedia(null)}
              />
            );
          })()}
        </View>
      )}

      {/* Live Mode simulation */}
      {isLive && (
        <View style={StyleSheet.absoluteFill}>
          {(() => {
            const { LiveScreen } = require('./screens/LiveScreen');
            return <LiveScreen onClose={() => setIsLive(false)} />;
          })()}
        </View>
      )}

      <VerificationScreen visible={showVerification} onClose={() => setShowVerification(false)} />

      <CreatePostModal
        visible={showCreate}
        userId={session.user.id}
        onClose={() => { setShowCreate(false); setActiveMedia(null); }}
        onPosted={() => { setFeedRefreshKey(k => k + 1); setActiveMedia(null); }}
        preCapturedMedia={activeMedia ? activeMedia.map((m: any) => ({ 
          uri: m.uri, 
          type: m.type, 
          mode: (m.mode === 'POST' ? 'post' : m.mode === 'REEL' ? 'reel' : 'story'),
          song: m.music ? `${m.music.trackName} — ${m.music.artistName}` : undefined,
          songPreviewUrl: m.music?.previewUrl
        })) : undefined}
      />

      {activeLegal === 'privacy' && (
        <View style={styles.notifOverlay}>
          <PrivacyPolicyScreen onClose={() => setActiveLegal(null)} />
        </View>
      )}
      {activeLegal === 'terms' && (
        <View style={styles.notifOverlay}>
          <TermsOfServiceScreen onClose={() => setActiveLegal(null)} />
        </View>
      )}
      {activeLegal === 'guidelines' && (
        <View style={styles.notifOverlay}>
          <CommunityGuidelinesScreen onClose={() => setActiveLegal(null)} />
        </View>
      )}

      {showDiscoverPeople && (
        <View style={styles.notifOverlay}>
          <DiscoverPeopleScreen
            onClose={() => setShowDiscoverPeople(false)}
            onUserPress={(u: any) => {
              setViewedUserId(u.id);
              setActiveTab('profile');
              setShowDiscoverPeople(false);
            }}
          />
        </View>
      )}

      {showTrending && (
        <View style={[styles.notifOverlay, { backgroundColor: 'transparent' }]}>
          <TrendingScreen
            userId={session.user.id}
            university={userProfile?.university ?? ''}
            onBack={() => setShowTrending(false)}
            onUserPress={(profile: any) => {
              setShowTrending(false);
              setViewedUserId(profile.id);
              setActiveTab('profile');
            }}
          />
        </View>
      )}

      {/* Post viewer opened from notification taps (like / comment / mention) */}
      {notifPost && (
        <NotifPostModal
          post={notifPost}
          currentUserId={session?.user?.id ?? ''}
          isMuted={feedMuted}
          setIsMuted={setFeedMuted}
          openComments={notifPostComments}
          onClose={() => { setNotifPost(null); setNotifPostComments(false); }}
        />
      )}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...AntDesign.font,
    ...MaterialIcons.font,
    ...FontAwesome.font,
  });

  if (!fontsLoaded) return <LoadingScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <PopupProvider>
            <ToastProvider>
              <BottomSheetModalProvider>
                <AppShell />
                <PremiumUploadToast />
              </BottomSheetModalProvider>
            </ToastProvider>
          </PopupProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
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
