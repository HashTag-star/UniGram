
import React, { useState } from 'react';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Repeat2, TrendingUp } from 'lucide-react';
import { Post } from '../types';
import { VerifiedBadge } from './VerifiedBadge';
import { CommentsModal } from './CommentsModal';

interface FeedItemProps {
  post: Post;
  onUserClick?: (userId: string) => void;
}

export const FeedItem: React.FC<FeedItemProps> = ({ post, onUserClick }) => {
  const [isLiked, setIsLiked] = useState(post.isLiked || false);
  const [likesCount, setLikesCount] = useState(post.likes);
  const [isSaved, setIsSaved] = useState(post.isSaved || false);
  const [isReposted, setIsReposted] = useState(post.isReposted || false);
  const [repostCount, setRepostCount] = useState(post.reposts);
  const [showComments, setShowComments] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const toggleLike = () => {
    if (!isLiked) {
      setShowHeartAnim(true);
      setTimeout(() => setShowHeartAnim(false), 600);
    }
    setIsLiked(prev => !prev);
    setLikesCount(prev => isLiked ? prev - 1 : prev + 1);
  };

  const toggleRepost = () => {
    setIsReposted(prev => !prev);
    setRepostCount(prev => isReposted ? prev - 1 : prev + 1);
  };

  const isThread = post.type === 'thread';
  const captionShort = post.caption.length > 120 ? post.caption.slice(0, 120) + '...' : post.caption;

  return (
    <>
      <div className="bg-black border border-white/8 rounded-2xl overflow-hidden mb-4 hover:border-white/15 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between p-3.5">
          <button
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
            onClick={() => onUserClick?.(post.userId)}
          >
            <div className="w-10 h-10 rounded-full overflow-hidden p-[2px] bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600">
              <img src={post.user.avatar} className="w-full h-full rounded-full border-2 border-black object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold">{post.user.username}</span>
                {post.user.verified && (
                  <VerifiedBadge type={post.user.verificationType} size="sm" />
                )}
                {post.user.isClub && (
                  <span className="text-[9px] bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded px-1">ORG</span>
                )}
              </div>
              <div className="text-[10px] text-white/40 flex items-center gap-1">
                <span>{post.user.major !== 'Club' ? `${post.user.major} • ` : ''}{post.timestamp}</span>
                {post.universityTag && (
                  <>
                    <span>•</span>
                    <span className="text-indigo-400">{post.universityTag}</span>
                  </>
                )}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-2">
            {!post.user.verified && (
              <button className="text-xs bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-full px-2.5 py-1 hover:bg-indigo-600/30 transition-colors">
                Follow
              </button>
            )}
            <button className="text-white/40 hover:text-white p-1 rounded-full hover:bg-white/5 transition-colors">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Media (not for threads) */}
        {!isThread && post.mediaUrl && (
          <div className="relative bg-white/3">
            <img
              src={post.mediaUrl}
              className="w-full object-cover max-h-[500px]"
              loading="lazy"
              onDoubleClick={toggleLike}
            />
            {/* Double-tap heart animation */}
            {showHeartAnim && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Heart className="w-20 h-20 text-white fill-white animate-ping opacity-80" />
              </div>
            )}
          </div>
        )}

        {/* Thread indicator */}
        {isThread && (
          <div className="px-4 py-1 flex items-center gap-1.5">
            <div className="w-0.5 h-full bg-white/10 self-stretch" />
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Thread</span>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 pt-2 pb-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={toggleLike}
                className="flex items-center gap-1 p-1.5 rounded-full hover:bg-red-500/10 transition-all active:scale-125 group"
              >
                <Heart className={`w-6 h-6 transition-colors ${isLiked ? 'fill-red-500 text-red-500' : 'text-white/70 group-hover:text-red-400'}`} />
              </button>
              <button
                onClick={() => setShowComments(true)}
                className="flex items-center gap-1 p-1.5 rounded-full hover:bg-white/10 transition-all"
              >
                <MessageCircle className="w-6 h-6 text-white/70" />
              </button>
              <button
                onClick={toggleRepost}
                className={`flex items-center gap-1 p-1.5 rounded-full hover:bg-green-500/10 transition-all ${isReposted ? 'text-green-400' : 'text-white/70'}`}
              >
                <Repeat2 className="w-6 h-6" />
              </button>
              <button className="flex items-center gap-1 p-1.5 rounded-full hover:bg-white/10 transition-all text-white/70">
                <Send className="w-6 h-6" />
              </button>
            </div>
            <button
              onClick={() => setIsSaved(!isSaved)}
              className={`p-1.5 rounded-full hover:bg-white/10 transition-all ${isSaved ? 'text-yellow-400' : 'text-white/70'}`}
            >
              <Bookmark className={`w-6 h-6 ${isSaved ? 'fill-yellow-400' : ''}`} />
            </button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 mt-1.5 mb-2">
            <button onClick={toggleLike} className="text-sm font-bold hover:underline">
              {likesCount.toLocaleString()} likes
            </button>
            {repostCount > 0 && (
              <span className={`text-xs flex items-center gap-1 ${isReposted ? 'text-green-400' : 'text-white/40'}`}>
                <Repeat2 className="w-3 h-3" />
                {repostCount.toLocaleString()}
              </span>
            )}
            {post.views && (
              <span className="text-xs text-white/30 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {(post.views / 1000).toFixed(0)}K views
              </span>
            )}
          </div>

          {/* Caption */}
          <p className="text-sm leading-relaxed mb-1">
            <button
              className="font-bold mr-1.5 hover:underline"
              onClick={() => onUserClick?.(post.userId)}
            >
              {post.user.username}
            </button>
            {showMore ? post.caption : captionShort}
            {post.caption.length > 120 && (
              <button
                onClick={() => setShowMore(!showMore)}
                className="ml-1 text-white/40 hover:text-white text-xs transition-colors"
              >
                {showMore ? ' less' : ' more'}
              </button>
            )}
          </p>

          {/* Hashtags */}
          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {post.hashtags.map(tag => (
                <span key={tag} className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors">{tag}</span>
              ))}
            </div>
          )}

          {/* Comments preview */}
          {post.comments > 0 && (
            <button
              onClick={() => setShowComments(true)}
              className="text-xs text-white/40 hover:text-white transition-colors block mb-1"
            >
              View all {post.comments.toLocaleString()} comments
            </button>
          )}

          {/* First comment preview */}
          {post.commentList?.[0] && (
            <p className="text-xs text-white/60 truncate mb-1">
              <span className="font-bold">{post.commentList[0].user.username}</span>{' '}
              {post.commentList[0].text}
            </p>
          )}

          <p className="text-[10px] uppercase tracking-wider text-white/25">{post.timestamp}</p>
        </div>
      </div>

      {showComments && (
        <CommentsModal post={post} onClose={() => setShowComments(false)} />
      )}
    </>
  );
};
