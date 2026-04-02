
import React, { useState, useRef } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Music, MoreHorizontal, Volume2, VolumeX, Repeat2 } from 'lucide-react';
import { Reel } from '../types';
import { VerifiedBadge } from './VerifiedBadge';

interface ReelsTabProps {
  reels: Reel[];
}

const ReelCard: React.FC<{ reel: Reel; isActive: boolean }> = ({ reel, isActive }) => {
  const [isLiked, setIsLiked] = useState(reel.isLiked || false);
  const [likes, setLikes] = useState(reel.likes);
  const [isSaved, setIsSaved] = useState(reel.isSaved || false);
  const [isMuted, setIsMuted] = useState(true);
  const [showFullCaption, setShowFullCaption] = useState(false);
  const [lastTap, setLastTap] = useState(0);
  const [showHeartAnim, setShowHeartAnim] = useState(false);

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap < 300) {
      if (!isLiked) {
        setIsLiked(true);
        setLikes(prev => prev + 1);
        setShowHeartAnim(true);
        setTimeout(() => setShowHeartAnim(false), 800);
      }
    }
    setLastTap(now);
  };

  const toggleLike = () => {
    setIsLiked(prev => !prev);
    setLikes(prev => isLiked ? prev - 1 : prev + 1);
  };

  const shortCaption = reel.caption.length > 80 ? reel.caption.slice(0, 80) + '...' : reel.caption;

  return (
    <div className="relative w-full h-[calc(100vh-64px)] flex-shrink-0 snap-start bg-black overflow-hidden" onClick={handleDoubleTap}>
      {/* Background / Thumbnail */}
      <img src={reel.thumbnail} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />

      {/* Double tap heart animation */}
      {showHeartAnim && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <Heart className="w-24 h-24 fill-white text-white animate-ping opacity-80" />
        </div>
      )}

      {/* Right actions */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-6 z-10">
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); toggleLike(); }}
            className="p-2 transition-transform active:scale-125"
          >
            <Heart className={`w-7 h-7 drop-shadow-lg ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
          </button>
          <span className="text-white text-xs font-semibold drop-shadow">{(likes / 1000).toFixed(1)}K</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button onClick={e => e.stopPropagation()} className="p-2">
            <MessageCircle className="w-7 h-7 text-white drop-shadow-lg" />
          </button>
          <span className="text-white text-xs font-semibold drop-shadow">{reel.comments}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button onClick={e => e.stopPropagation()} className="p-2">
            <Repeat2 className="w-7 h-7 text-white drop-shadow-lg" />
          </button>
          <span className="text-white text-xs font-semibold drop-shadow">{reel.shares}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); setIsSaved(!isSaved); }}
            className="p-2"
          >
            <Bookmark className={`w-7 h-7 drop-shadow-lg ${isSaved ? 'fill-white text-white' : 'text-white'}`} />
          </button>
        </div>
        <button onClick={e => e.stopPropagation()} className="p-2">
          <MoreHorizontal className="w-7 h-7 text-white drop-shadow-lg" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); setIsMuted(!isMuted); }}
          className="p-1"
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-white/70" /> : <Volume2 className="w-5 h-5 text-white/70" />}
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-4 right-16 z-10">
        {/* User */}
        <div className="flex items-center gap-2 mb-2">
          <img src={reel.user.avatar} className="w-9 h-9 rounded-full object-cover border-2 border-white" />
          <div className="flex items-center gap-1">
            <span className="text-white font-bold text-sm drop-shadow">{reel.user.username}</span>
            {reel.user.verified && <VerifiedBadge type={reel.user.verificationType} size="sm" />}
          </div>
          <button
            className="ml-1 border border-white/60 text-white text-xs px-3 py-0.5 rounded-full hover:bg-white/10 transition-colors"
            onClick={e => e.stopPropagation()}
          >
            Follow
          </button>
        </div>

        {/* Caption */}
        <p className="text-white text-sm leading-relaxed drop-shadow">
          {showFullCaption ? reel.caption : shortCaption}
          {reel.caption.length > 80 && (
            <button
              onClick={e => { e.stopPropagation(); setShowFullCaption(!showFullCaption); }}
              className="ml-1 text-white/60 font-semibold"
            >
              {showFullCaption ? 'less' : 'more'}
            </button>
          )}
        </p>

        {/* Song */}
        {reel.song && (
          <div className="flex items-center gap-2 mt-2">
            <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center animate-spin" style={{ animationDuration: '3s' }}>
              <Music className="w-2 h-2 text-white" />
            </div>
            <span className="text-white/80 text-xs">{reel.song}</span>
          </div>
        )}

        {/* Views */}
        <p className="text-white/50 text-[10px] mt-1">{(reel.views / 1000).toFixed(0)}K views • {reel.timestamp}</p>
      </div>

      {/* Share button */}
      <button className="absolute top-4 right-3 z-10 p-2 bg-black/30 rounded-full backdrop-blur-sm" onClick={e => e.stopPropagation()}>
        <Share2 className="w-5 h-5 text-white" />
      </button>
    </div>
  );
};

export const ReelsTab: React.FC<ReelsTabProps> = ({ reels }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const height = containerRef.current.clientHeight;
    const idx = Math.round(scrollTop / height);
    setActiveIndex(idx);
  };

  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-64px)] overflow-y-scroll snap-y snap-mandatory no-scrollbar"
      onScroll={handleScroll}
    >
      {reels.map((reel, i) => (
        <ReelCard key={reel.id} reel={reel} isActive={i === activeIndex} />
      ))}
    </div>
  );
};
