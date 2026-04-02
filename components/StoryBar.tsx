
import React from 'react';
import { Plus } from 'lucide-react';
import { Story, User } from '../types';
import { VerifiedBadge } from './VerifiedBadge';

interface StoryBarProps {
  stories: Story[];
  currentUser: User;
  onStoryClick?: (storyIndex: number) => void;
  onAddStory?: () => void;
}

export const StoryBar: React.FC<StoryBarProps> = ({ stories, currentUser, onStoryClick, onAddStory }) => {
  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-3 pt-1 no-scrollbar">
      {/* Current User Add Story */}
      <div
        className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer group"
        onClick={onAddStory}
      >
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-white/10 group-hover:border-white/30 transition-colors overflow-hidden">
            <img src={currentUser.avatar} className="w-full h-full object-cover" />
          </div>
          <div className="absolute bottom-0 right-0 bg-indigo-600 w-5 h-5 rounded-full flex items-center justify-center border-2 border-black shadow-lg shadow-indigo-500/30 group-hover:bg-indigo-500 transition-colors">
            <Plus className="w-3 h-3 text-white" />
          </div>
        </div>
        <span className="text-[10px] text-white/50 font-medium">Your Story</span>
      </div>

      {/* Other Stories */}
      {stories.map((story, i) => (
        <div
          key={story.id}
          className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer group"
          onClick={() => onStoryClick?.(i)}
        >
          <div className={`w-16 h-16 rounded-full p-[2.5px] transition-all group-active:scale-95 ${story.viewed ? 'bg-white/20' : 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600'}`}>
            <div className="w-full h-full rounded-full border-2 border-black overflow-hidden bg-black">
              <img src={story.user.avatar} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            </div>
          </div>
          <div className="flex items-center gap-0.5 max-w-[64px]">
            <span className={`text-[10px] truncate ${story.viewed ? 'text-white/30' : 'text-white/80'}`}>
              {story.user.username}
            </span>
            {story.user.verified && (
              <VerifiedBadge type={story.user.verificationType} size="sm" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
