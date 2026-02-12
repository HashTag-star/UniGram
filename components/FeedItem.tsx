
import React, { useState } from 'react';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from 'lucide-react';
import { Post } from '../types';

interface FeedItemProps {
  post: Post;
}

export const FeedItem: React.FC<FeedItemProps> = ({ post }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes);

  const toggleLike = () => {
    setIsLiked(!isLiked);
    setLikesCount(prev => isLiked ? prev - 1 : prev + 1);
  };

  return (
    <div className="bg-black border border-white/10 rounded-xl overflow-hidden mb-6">
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden p-[2px] bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600">
            <img src={post.user.avatar} className="w-full h-full rounded-full border-2 border-black object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold">{post.user.username}</span>
              {post.user.verified && (
                <div className="w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-[8px] text-white">✓</span>
                </div>
              )}
            </div>
            <div className="text-[10px] text-white/50 flex items-center gap-1">
              <span>{post.user.university}</span>
              {post.universityTag && (
                <>
                  <span>•</span>
                  <span className="text-indigo-400 font-medium">{post.universityTag}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button className="text-white/60 hover:text-white">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Media */}
      <div className="aspect-square relative bg-white/5">
        <img src={post.mediaUrl} className="w-full h-full object-cover" loading="lazy" />
      </div>

      {/* Actions */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <button onClick={toggleLike} className="transition-transform active:scale-125">
              <Heart className={`w-7 h-7 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
            </button>
            <button>
              <MessageCircle className="w-7 h-7" />
            </button>
            <button>
              <Send className="w-7 h-7" />
            </button>
          </div>
          <button>
            <Bookmark className="w-7 h-7" />
          </button>
        </div>

        {/* Info */}
        <div className="space-y-1">
          <p className="text-sm font-bold">{likesCount.toLocaleString()} likes</p>
          <p className="text-sm">
            <span className="font-bold mr-2">{post.user.username}</span>
            {post.caption}
          </p>
          <button className="text-sm text-white/50 block">View all {post.comments} comments</button>
          <p className="text-[10px] uppercase text-white/40 tracking-wider">{post.timestamp}</p>
        </div>
      </div>
    </div>
  );
};
