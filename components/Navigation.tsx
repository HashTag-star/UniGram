
import React from 'react';
import {
  Home, Search, ShoppingBag,
  Calendar, MessageCircle, User, Bell,
  BookOpen, Heart, Film, GraduationCap, Plus
} from 'lucide-react';
import { AppTab } from '../types';

interface NavProps {
  currentTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onNotificationsClick?: () => void;
  onMessagesClick?: () => void;
  onCreateClick?: () => void;
  unreadMessages?: number;
  unreadNotifs?: number;
}

export const TopNav: React.FC<NavProps> = ({
  currentTab,
  onTabChange,
  onNotificationsClick,
  onMessagesClick,
  onCreateClick,
  unreadMessages = 0,
  unreadNotifs = 0,
}) => {
  const isReels = currentTab === AppTab.REELS;

  return (
    <nav className={`fixed top-0 left-0 right-0 h-14 ${isReels ? 'bg-transparent' : 'bg-black border-b border-white/10'} z-50 px-4 flex items-center justify-between transition-all`}>
      {/* Logo */}
      <button
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => onTabChange(AppTab.FEED)}
      >
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-black text-lg shadow-lg shadow-indigo-500/20">U</div>
        {!isReels && (
          <span className="text-lg font-black tracking-tight hidden sm:block bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            UniGram
          </span>
        )}
      </button>

      {/* Search — only show on feed/explore */}
      {(currentTab === AppTab.FEED || currentTab === AppTab.EXPLORE) && !isReels && (
        <button
          className="flex-1 max-w-xs mx-4 hidden md:flex items-center"
          onClick={() => onTabChange(AppTab.EXPLORE)}
        >
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4" />
            <div className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white/30 cursor-text hover:border-white/20 transition-colors">
              Search campus, courses, events...
            </div>
          </div>
        </button>
      )}

      {/* Title for other tabs */}
      {currentTab !== AppTab.FEED && currentTab !== AppTab.EXPLORE && !isReels && (
        <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
          <span className="font-bold text-sm capitalize">
            {currentTab === AppTab.COURSES ? 'Courses' :
              currentTab === AppTab.MARKET ? 'Marketplace' :
              currentTab === AppTab.EVENTS ? 'Events' :
              currentTab === AppTab.CONFESSIONS ? 'Confessions' :
              currentTab === AppTab.PROFILE ? 'Profile' :
              currentTab === AppTab.MESSAGES ? 'Messages' : ''}
          </span>
        </div>
      )}

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {currentTab === AppTab.FEED && (
          <button
            onClick={onCreateClick}
            className="p-2 hover:bg-white/5 rounded-full transition-colors hidden sm:flex"
          >
            <Plus className="w-5 h-5 text-white/70" />
          </button>
        )}
        <button
          className="p-2 hover:bg-white/5 rounded-full relative transition-colors"
          onClick={onNotificationsClick}
        >
          <Bell className={`w-5 h-5 ${unreadNotifs > 0 ? 'text-white' : 'text-white/70'}`} />
          {unreadNotifs > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white border border-black">
              {unreadNotifs > 9 ? '9+' : unreadNotifs}
            </span>
          )}
        </button>
        <button
          className="p-2 hover:bg-white/5 rounded-full relative transition-colors"
          onClick={onMessagesClick}
        >
          <MessageCircle className={`w-5 h-5 ${unreadMessages > 0 ? 'text-white' : 'text-white/70'}`} />
          {unreadMessages > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white border border-black">
              {unreadMessages > 9 ? '9+' : unreadMessages}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
};

export const BottomNav: React.FC<NavProps> = ({ currentTab, onTabChange, onCreateClick }) => {
  const tabs = [
    { id: AppTab.FEED, icon: Home, label: 'Home' },
    { id: AppTab.EXPLORE, icon: Search, label: 'Search' },
    { id: AppTab.REELS, icon: Film, label: 'Reels' },
    { id: AppTab.COURSES, icon: GraduationCap, label: 'Courses' },
    { id: AppTab.EVENTS, icon: Calendar, label: 'Events' },
    { id: AppTab.MARKET, icon: ShoppingBag, label: 'Market' },
    { id: AppTab.CONFESSIONS, icon: Heart, label: 'Vibes' },
    { id: AppTab.PROFILE, icon: User, label: 'Profile' },
  ];

  const isReels = currentTab === AppTab.REELS;

  return (
    <nav className={`fixed bottom-0 left-0 right-0 h-16 ${isReels ? 'bg-black/80 backdrop-blur-md' : 'bg-black border-t border-white/10'} z-50 flex items-center justify-around px-1`}>
      {tabs.map((tab) => {
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors relative ${isActive ? 'text-indigo-400' : 'text-white/40 hover:text-white/70'}`}
          >
            <div className={`relative p-1 rounded-xl transition-all ${isActive ? 'bg-indigo-500/10' : ''}`}>
              <tab.icon className={`w-5 h-5 transition-all ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
            </div>
            <span className={`text-[9px] font-medium transition-all ${isActive ? 'text-indigo-400' : ''}`}>{tab.label}</span>
            {isActive && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-500 rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
};
