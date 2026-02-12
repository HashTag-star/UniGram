
import React from 'react';
import { 
  Home, Search, PlusSquare, ShoppingBag, 
  Calendar, MessageCircle, User, Bell, 
  Globe, BookOpen, Heart
} from 'lucide-react';
import { AppTab } from '../types';

interface NavProps {
  currentTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export const TopNav: React.FC<NavProps> = ({ currentTab, onTabChange }) => {
  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-black border-b border-white/10 z-50 px-4 flex items-center justify-between">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => onTabChange(AppTab.FEED)}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-xl">U</div>
        <span className="text-xl font-bold tracking-tight hidden sm:block">UniGram</span>
      </div>

      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Search campus, courses, events..." 
            className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-white/5 rounded-full relative">
          <Bell className="w-6 h-6" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        <button className="p-2 hover:bg-white/5 rounded-full">
          <MessageCircle className="w-6 h-6" />
        </button>
      </div>
    </nav>
  );
};

export const BottomNav: React.FC<NavProps> = ({ currentTab, onTabChange }) => {
  const tabs = [
    { id: AppTab.FEED, icon: Home, label: 'Feed' },
    { id: AppTab.EXPLORE, icon: Globe, label: 'Explore' },
    { id: AppTab.COURSES, icon: BookOpen, label: 'Courses' },
    { id: AppTab.MARKET, icon: ShoppingBag, label: 'Market' },
    { id: AppTab.EVENTS, icon: Calendar, label: 'Events' },
    { id: AppTab.CONFESSIONS, icon: Heart, label: 'Confessions' },
    { id: AppTab.PROFILE, icon: User, label: 'Profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-black border-t border-white/10 z-50 flex items-center justify-around px-2">
      {tabs.map((tab) => (
        <button 
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${currentTab === tab.id ? 'text-indigo-400' : 'text-white/60 hover:text-white'}`}
        >
          <tab.icon className={`w-6 h-6 ${currentTab === tab.id ? 'stroke-[2.5px]' : 'stroke-2'}`} />
          <span className="text-[10px] font-medium">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};
