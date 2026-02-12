
import React, { useState, useEffect } from 'react';
import { AppTab } from './types';
import { CURRENT_USER, MOCK_POSTS, MOCK_STORIES, MOCK_EVENTS, MOCK_MARKET, MOCK_CONFESSIONS } from './constants';
import { TopNav, BottomNav } from './components/Navigation';
import { StoryBar } from './components/StoryBar';
import { FeedItem } from './components/FeedItem';
import { Marketplace } from './components/Marketplace';
import { Confessions } from './components/Confessions';
import { EventsTab } from './components/EventsTab';
import { RecommendationSection } from './components/RecommendationSection';
import { Sparkles, GraduationCap, Users, Search, Globe } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.FEED);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate initial loading
    const timer = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case AppTab.FEED:
        return (
          <div className="max-w-xl mx-auto px-4 pt-2 pb-24">
            <StoryBar stories={MOCK_STORIES} currentUser={CURRENT_USER} />
            <div className="mt-4">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                <div className="flex items-center gap-2 text-indigo-400">
                  <GraduationCap className="w-5 h-5" />
                  <span className="text-sm font-bold">{CURRENT_USER.university} Feed</span>
                </div>
                <button className="text-xs text-white/50 hover:text-white transition-colors">Switch Feed</button>
              </div>
              {MOCK_POSTS.map(post => (
                <FeedItem key={post.id} post={post} />
              ))}
            </div>
          </div>
        );
      case AppTab.EXPLORE:
        return (
          <div className="max-w-xl mx-auto px-4 pt-2 pb-24">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Search className="w-6 h-6 text-indigo-400" />
              Explore Campus
            </h1>
            
            <RecommendationSection currentUser={CURRENT_USER} />

            <div className="mt-8">
              <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest mb-4">Trending Tags</h3>
              <div className="flex flex-wrap gap-2">
                {['#CSFinals', '#Hackathon2024', '#CampusLife', '#StudyVibes', '#FreshersWeek'].map(tag => (
                  <button key={tag} className="px-3 py-1.5 bg-white/5 hover:bg-indigo-500/20 border border-white/10 rounded-xl text-xs font-medium transition-colors">
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-2">
               {MOCK_POSTS.map(p => (
                 <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10">
                   <img src={p.mediaUrl} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" />
                 </div>
               ))}
            </div>
          </div>
        );
      case AppTab.MARKET:
        return <Marketplace items={MOCK_MARKET} />;
      case AppTab.CONFESSIONS:
        return <Confessions confessions={MOCK_CONFESSIONS} />;
      case AppTab.EVENTS:
        return <EventsTab events={MOCK_EVENTS} />;
      case AppTab.COURSES:
        return (
          <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center max-w-sm mx-auto">
            <div className="w-20 h-20 rounded-full bg-indigo-500/20 flex items-center justify-center mb-6">
              <Users className="w-10 h-10 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Course Communities</h2>
            <p className="text-white/50 text-sm mb-8">Connect with peers in your specific courses. Share notes, discuss assignments, and study together.</p>
            <div className="w-full space-y-3">
              {['CS101: Intro to Programming', 'BIO240: Cell Biology', 'MATH300: Discrete Math'].map(course => (
                <button key={course} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group hover:border-indigo-500/50 transition-all">
                  <span className="font-semibold text-sm">{course}</span>
                  <div className="bg-indigo-600 px-3 py-1 rounded-lg text-[10px] font-bold group-hover:bg-indigo-500">Join</div>
                </button>
              ))}
            </div>
          </div>
        );
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

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-[100]">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-4xl mb-6 shadow-2xl shadow-indigo-500/20 animate-bounce">U</div>
        <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 animate-[loading_1.5s_ease-in-out_infinite]"></div>
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

  return (
    <div className="min-h-screen pb-20">
      <TopNav currentTab={activeTab} onTabChange={setActiveTab} />
      <main className="pt-16">
        {renderContent()}
      </main>
      <BottomNav currentTab={activeTab} onTabChange={setActiveTab} />
      
      {/* Mobile Create Button (floating) */}
      {activeTab === AppTab.FEED && (
        <button className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-indigo-600 shadow-xl shadow-indigo-600/40 flex items-center justify-center transition-transform hover:scale-110 active:scale-90 z-40 md:hidden">
          <div className="text-3xl text-white">+</div>
        </button>
      )}
    </div>
  );
};

export default App;
