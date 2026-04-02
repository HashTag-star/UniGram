
import React, { useState, useEffect } from 'react';
import { AppTab, User } from './types';
import {
  CURRENT_USER,
  MOCK_POSTS,
  MOCK_STORIES,
  MOCK_EVENTS,
  MOCK_MARKET,
  MOCK_CONFESSIONS,
  MOCK_CONVERSATIONS,
  MOCK_NOTIFICATIONS,
  MOCK_COURSES,
  MOCK_STUDY_GROUPS,
  MOCK_REELS,
} from './constants';
import { TopNav, BottomNav } from './components/Navigation';
import { StoryBar } from './components/StoryBar';
import { FeedItem } from './components/FeedItem';
import { Marketplace } from './components/Marketplace';
import { Confessions } from './components/Confessions';
import { EventsTab } from './components/EventsTab';
import { RecommendationSection } from './components/RecommendationSection';
import { ProfilePage } from './components/ProfilePage';
import { ReelsTab } from './components/ReelsTab';
import { MessagesTab } from './components/MessagesTab';
import { NotificationsPanel } from './components/NotificationsPanel';
import { CreatePostModal } from './components/CreatePostModal';
import { StoryViewer } from './components/StoryViewer';
import { VerificationModal } from './components/VerificationModal';
import { SearchPage } from './components/SearchPage';
import { CoursesCommunity } from './components/CoursesCommunity';
import { GraduationCap, Sparkles } from 'lucide-react';
import { Post } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.FEED);
  const [isLoading, setIsLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState<number | null>(null);
  const [viewedProfile, setViewedProfile] = useState<User | null>(null);
  const [feedPosts, setFeedPosts] = useState(MOCK_POSTS);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const unreadNotifs = notifications.filter(n => !n.read).length;
  const unreadMessages = MOCK_CONVERSATIONS.reduce((sum, c) => sum + c.unreadCount, 0);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1400);
    return () => clearTimeout(timer);
  }, []);

  const handleTabChange = (tab: AppTab) => {
    setViewedProfile(null);
    setActiveTab(tab);
  };

  const handleUserClick = (userId: string) => {
    const user = [...MOCK_CONVERSATIONS.flatMap(c => c.participants), ...MOCK_POSTS.map(p => p.user)].find(u => u.id === userId);
    if (user) {
      setViewedProfile(user);
      setActiveTab(AppTab.PROFILE);
    }
  };

  const handlePostCreated = (caption: string, type: string, mediaUrl?: string) => {
    const newPost: Post = {
      id: `p_${Date.now()}`,
      userId: CURRENT_USER.id,
      user: CURRENT_USER,
      type: type as 'image' | 'thread',
      mediaUrl,
      caption,
      likes: 0,
      comments: 0,
      reposts: 0,
      saves: 0,
      timestamp: 'Just now',
      universityTag: CURRENT_USER.university,
    };
    setFeedPosts(prev => [newPost, ...prev]);
  };

  const handleMessagesClick = () => {
    setActiveTab(AppTab.MESSAGES);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-[100]">
        <div className="relative mb-8">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 flex items-center justify-center font-black text-5xl shadow-2xl shadow-indigo-500/40 animate-[pulse_2s_ease-in-out_infinite]">
            U
          </div>
          <div className="absolute -inset-2 rounded-3xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 opacity-20 blur-xl animate-pulse" />
        </div>
        <p className="text-white font-bold text-xl mb-1">UniGram</p>
        <p className="text-white/40 text-xs mb-8">Your campus, connected.</p>
        <div className="w-48 h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 animate-[loading_1.5s_ease-in-out_infinite]" />
        </div>
        <style>{`
          @keyframes loading {
            0% { width: 0%; transform: translateX(-100%); }
            50% { width: 100%; transform: translateX(0%); }
            100% { width: 0%; transform: translateX(100%); }
          }
        `}</style>
      </div>
    );
  }

  const renderContent = () => {
    // Profile view (can be triggered from anywhere)
    if (activeTab === AppTab.PROFILE) {
      return (
        <ProfilePage
          user={viewedProfile || CURRENT_USER}
          isOwn={!viewedProfile}
          onVerificationClick={() => setShowVerification(true)}
          onSettingsClick={() => {}}
          posts={feedPosts}
        />
      );
    }

    switch (activeTab) {
      case AppTab.FEED:
        return (
          <div className="max-w-xl mx-auto px-3 pt-2 pb-24">
            <StoryBar
              stories={MOCK_STORIES}
              currentUser={CURRENT_USER}
              onStoryClick={(i) => setStoryViewerIndex(i)}
              onAddStory={() => setShowCreatePost(true)}
            />
            <div className="mt-2">
              <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                <div className="flex items-center gap-2 text-indigo-400">
                  <GraduationCap className="w-4 h-4" />
                  <span className="text-xs font-bold">{CURRENT_USER.university} Feed</span>
                </div>
                <button className="text-[10px] text-white/40 hover:text-white transition-colors">Following • For You</button>
              </div>
              {feedPosts.map(post => (
                <FeedItem key={post.id} post={post} onUserClick={handleUserClick} />
              ))}
            </div>
          </div>
        );

      case AppTab.EXPLORE:
        return (
          <SearchPage onUserClick={(user) => {
            setViewedProfile(user);
            setActiveTab(AppTab.PROFILE);
          }} />
        );

      case AppTab.REELS:
        return <ReelsTab reels={MOCK_REELS} />;

      case AppTab.MARKET:
        return <Marketplace items={MOCK_MARKET} />;

      case AppTab.CONFESSIONS:
        return <Confessions confessions={MOCK_CONFESSIONS} />;

      case AppTab.EVENTS:
        return <EventsTab events={MOCK_EVENTS} />;

      case AppTab.COURSES:
        return (
          <CoursesCommunity
            courses={MOCK_COURSES}
            studyGroups={MOCK_STUDY_GROUPS}
          />
        );

      case AppTab.MESSAGES:
        return <MessagesTab conversations={MOCK_CONVERSATIONS} />;

      default:
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <Sparkles className="w-12 h-12 text-indigo-500 mb-4 animate-pulse" />
            <h2 className="text-xl font-bold">Coming Soon</h2>
            <p className="text-white/50 text-sm">We're building something great!</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Top nav - hidden on reels */}
      {activeTab !== AppTab.REELS && (
        <TopNav
          currentTab={activeTab}
          onTabChange={handleTabChange}
          onNotificationsClick={() => setShowNotifications(true)}
          onMessagesClick={handleMessagesClick}
          onCreateClick={() => setShowCreatePost(true)}
          unreadMessages={unreadMessages}
          unreadNotifs={unreadNotifs}
        />
      )}

      <main className={`${activeTab !== AppTab.REELS ? 'pt-14' : ''}`}>
        {renderContent()}
      </main>

      <BottomNav
        currentTab={activeTab}
        onTabChange={handleTabChange}
        onCreateClick={() => setShowCreatePost(true)}
      />

      {/* Mobile FAB create button */}
      {(activeTab === AppTab.FEED || activeTab === AppTab.EXPLORE) && (
        <button
          onClick={() => setShowCreatePost(true)}
          className="fixed bottom-20 right-4 w-13 h-13 w-[52px] h-[52px] rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 shadow-xl shadow-indigo-600/40 flex items-center justify-center transition-transform hover:scale-110 active:scale-90 z-40 sm:hidden"
        >
          <span className="text-white font-black text-2xl leading-none">+</span>
        </button>
      )}

      {/* Modals & Overlays */}
      {showNotifications && (
        <NotificationsPanel
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
        />
      )}

      {showCreatePost && (
        <CreatePostModal
          onClose={() => setShowCreatePost(false)}
          onPost={handlePostCreated}
        />
      )}

      {showVerification && (
        <VerificationModal onClose={() => setShowVerification(false)} />
      )}

      {storyViewerIndex !== null && (
        <StoryViewer
          stories={MOCK_STORIES}
          initialIndex={storyViewerIndex}
          onClose={() => setStoryViewerIndex(null)}
        />
      )}
    </div>
  );
};

export default App;
