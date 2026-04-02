
import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Send, Heart, MoreHorizontal } from 'lucide-react';
import { Story } from '../types';
import { VerifiedBadge } from './VerifiedBadge';

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
}

export const StoryViewer: React.FC<StoryViewerProps> = ({ stories, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reply, setReply] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const STORY_DURATION = 5000;

  const current = stories[currentIndex];

  useEffect(() => {
    setProgress(0);
    setIsLiked(false);
    if (isPaused) return;
    intervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          goNext();
          return 0;
        }
        return prev + (100 / (STORY_DURATION / 50));
      });
    }, 50);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [currentIndex, isPaused]);

  const goNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center" onClick={onClose}>
      <div
        className="relative w-full max-w-sm h-full max-h-[calc(100vh)] bg-black overflow-hidden"
        onClick={e => e.stopPropagation()}
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 flex gap-1 z-20">
          {stories.map((_, idx) => (
            <div key={idx} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{
                  width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-8 left-3 right-3 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white">
              <img src={current.user.avatar} className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-white text-sm font-bold">{current.user.username}</span>
                {current.user.verified && <VerifiedBadge type={current.user.verificationType} size="sm" />}
              </div>
              <span className="text-white/70 text-xs">{current.timestamp}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-white/80"><MoreHorizontal className="w-5 h-5" /></button>
            <button className="text-white" onClick={onClose}><X className="w-6 h-6" /></button>
          </div>
        </div>

        {/* Story Image */}
        <img
          src={current.mediaUrl}
          className="w-full h-full object-cover"
          draggable={false}
        />

        {/* Caption */}
        {current.caption && (
          <div className="absolute bottom-20 left-0 right-0 px-4">
            <p className="text-white text-sm font-medium text-shadow bg-black/20 px-3 py-1 rounded-xl backdrop-blur-sm">
              {current.caption}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="absolute bottom-4 left-3 right-3 flex items-center gap-2 z-20">
          <input
            type="text"
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder={`Reply to ${current.user.username}...`}
            className="flex-1 bg-white/10 border border-white/30 rounded-full px-4 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:border-white/70"
            onClick={e => { e.stopPropagation(); setIsPaused(true); }}
            onBlur={() => setIsPaused(false)}
          />
          {reply ? (
            <button className="bg-white text-black rounded-full p-2">
              <Send className="w-4 h-4" />
            </button>
          ) : (
            <button
              className="text-white transition-transform active:scale-125"
              onClick={() => setIsLiked(!isLiked)}
            >
              <Heart className={`w-7 h-7 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
            </button>
          )}
        </div>

        {/* Navigation taps */}
        <div className="absolute inset-0 flex z-10 pointer-events-none">
          <div className="w-1/3 h-full pointer-events-auto" onClick={goPrev} />
          <div className="w-2/3 h-full pointer-events-auto" onClick={goNext} />
        </div>

        {/* Arrow buttons on larger screens */}
        {currentIndex > 0 && (
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 bg-black/40 rounded-full p-1 hidden sm:flex"
            onClick={goPrev}
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        )}
        {currentIndex < stories.length - 1 && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 z-30 bg-black/40 rounded-full p-1 hidden sm:flex"
            onClick={goNext}
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        )}
      </div>
    </div>
  );
};
