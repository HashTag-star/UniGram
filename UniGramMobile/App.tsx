import './global.css';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Animated, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FeedScreen } from './screens/FeedScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { ReelsScreen } from './screens/ReelsScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { MarketScreen } from './screens/MarketScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { VerificationScreen } from './screens/VerificationScreen';
import { MOCK_NOTIFICATIONS, MOCK_CONVERSATIONS, CURRENT_USER } from './data/mockData';
import { User } from './data/types';

type Tab = 'feed' | 'explore' | 'reels' | 'market' | 'messages' | 'profile';

const TABS: Array<{ id: Tab; icon: string; activeIcon: string; label: string }> = [
  { id: 'feed', icon: 'home-outline', activeIcon: 'home', label: 'Home' },
  { id: 'explore', icon: 'search-outline', activeIcon: 'search', label: 'Search' },
  { id: 'reels', icon: 'film-outline', activeIcon: 'film', label: 'Reels' },
  { id: 'market', icon: 'bag-outline', activeIcon: 'bag', label: 'Market' },
  { id: 'messages', icon: 'chatbubble-outline', activeIcon: 'chatbubble', label: 'Messages' },
  { id: 'profile', icon: 'person-outline', activeIcon: 'person', label: 'Profile' },
];

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

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [showVerification, setShowVerification] = useState(false);
  const [viewedProfile, setViewedProfile] = useState<User | null>(null);

  const unreadMessages = MOCK_CONVERSATIONS.reduce((a, c) => a + c.unreadCount, 0);
  const unreadNotifs = MOCK_NOTIFICATIONS.filter(n => !n.read).length;

  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 1800);
    return () => clearTimeout(t);
  }, []);

  if (isLoading) return <LoadingScreen />;

  const handleTabChange = (tab: Tab) => {
    if (tab !== 'profile') setViewedProfile(null);
    setActiveTab(tab);
  };

  const isReels = activeTab === 'reels';

  const renderScreen = () => {
    switch (activeTab) {
      case 'feed':
        return <FeedScreen />;
      case 'explore':
        return (
          <ExploreScreen
            onUserPress={user => {
              setViewedProfile(user);
              setActiveTab('profile');
            }}
          />
        );
      case 'reels':
        return <ReelsScreen />;
      case 'market':
        return <MarketScreen />;
      case 'messages':
        return <MessagesScreen />;
      case 'profile':
        return (
          <ProfileScreen
            user={viewedProfile || CURRENT_USER}
            isOwn={!viewedProfile}
            onVerifyPress={() => setShowVerification(true)}
            onBack={viewedProfile ? () => { setViewedProfile(null); setActiveTab('explore'); } : undefined}
          />
        );
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent={false} />

      {/* Top nav */}
      {!isReels && (
        <SafeAreaView style={styles.topNav}>
          <View style={styles.topNavInner}>
            <TouchableOpacity onPress={() => handleTabChange('feed')} style={styles.logoRow}>
              <View style={styles.logoBox}>
                <Text style={styles.logoLetter}>U</Text>
              </View>
              <Text style={styles.logoText}>UniGram</Text>
            </TouchableOpacity>

            <View style={styles.topActions}>
              <TouchableOpacity style={styles.topBtn}>
                <Ionicons name="notifications-outline" size={24} color={unreadNotifs > 0 ? '#fff' : 'rgba(255,255,255,0.7)'} />
                {unreadNotifs > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.topBtn} onPress={() => handleTabChange('messages')}>
                <Ionicons name="chatbubble-outline" size={24} color={unreadMessages > 0 ? '#fff' : 'rgba(255,255,255,0.7)'} />
                {unreadMessages > 0 && (
                  <View style={[styles.badge, { backgroundColor: '#4f46e5' }]}>
                    <Text style={styles.badgeText}>{unreadMessages}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* Main content */}
      <View style={styles.content}>
        {renderScreen()}
      </View>

      {/* Bottom tab bar */}
      <SafeAreaView style={[styles.bottomNav, isReels && styles.bottomNavReels]}>
        <View style={styles.bottomNavInner}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === 'messages' && unreadMessages > 0;
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
                  {showBadge && <View style={styles.tabDot} />}
                </View>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      <VerificationScreen visible={showVerification} onClose={() => setShowVerification(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topNav: { backgroundColor: '#000', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  topNavInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontSize: 18, fontWeight: '900', color: '#fff' },
  logoText: { fontSize: 18, fontWeight: 'bold', color: '#fff', letterSpacing: -0.5 },
  topActions: { flexDirection: 'row', gap: 4 },
  topBtn: { padding: 6, position: 'relative' },
  badge: { position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#000', paddingHorizontal: 2 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  content: { flex: 1 },
  bottomNav: { backgroundColor: '#000', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  bottomNavReels: { backgroundColor: 'rgba(0,0,0,0.8)' },
  bottomNavInner: { flexDirection: 'row', paddingVertical: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2, position: 'relative' },
  tabIndicator: { position: 'absolute', top: 0, left: '25%', right: '25%', height: 2, backgroundColor: '#818cf8', borderRadius: 1 },
  tabIconWrap: { padding: 4, borderRadius: 10, position: 'relative' },
  tabIconActive: { backgroundColor: 'rgba(99,102,241,0.1)' },
  tabDot: { position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: 4, backgroundColor: '#4f46e5', borderWidth: 1.5, borderColor: '#000' },
  tabLabel: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: '500' },
  tabLabelActive: { color: '#818cf8' },
});
