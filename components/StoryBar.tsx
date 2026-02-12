
import React from 'react';
import { Plus } from 'lucide-react';
import { Story, User } from '../types';

interface StoryBarProps {
  stories: Story[];
  currentUser: User;
}

export const StoryBar: React.FC<StoryBarProps> = ({ stories, currentUser }) => {
  return (
    <div className="flex items-center gap-4 overflow-x-auto pb-4 pt-2 no-scrollbar">
      {/* Current User Add Story */}
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-white/10 p-0.5">
            <img src={currentUser.avatar} className="w-full h-full rounded-full object-cover" />
          </div>
          <div className="absolute bottom-0 right-0 bg-blue-500 w-5 h-5 rounded-full flex items-center justify-center border-2 border-black">
            <Plus className="w-3 h-3 text-white" />
          </div>
        </div>
        <span className="text-[10px] text-white/60">Your Story</span>
      </div>

      {/* Other Stories */}
      {stories.map((story) => (
        <div key={story.id} className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer group">
          <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 transition-transform group-active:scale-95">
            <div className="w-full h-full rounded-full border-2 border-black overflow-hidden bg-black">
              <img src={story.user.avatar} className="w-full h-full object-cover" />
            </div>
          </div>
          <span className="text-[10px] text-white/80 max-w-[64px] truncate">{story.user.username}</span>
        </div>
      ))}
    </div>
  );
};
