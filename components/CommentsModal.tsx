
import React, { useState } from 'react';
import { X, Heart, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { Post, Comment } from '../types';
import { CURRENT_USER } from '../constants';
import { VerifiedBadge } from './VerifiedBadge';

interface CommentsModalProps {
  post: Post;
  onClose: () => void;
}

const CommentItem: React.FC<{ comment: Comment; depth?: number }> = ({ comment, depth = 0 }) => {
  const [isLiked, setIsLiked] = useState(comment.isLiked || false);
  const [likes, setLikes] = useState(comment.likes);
  const [showReplies, setShowReplies] = useState(false);

  return (
    <div className={`${depth > 0 ? 'ml-10 mt-2' : 'mt-4'}`}>
      <div className="flex items-start gap-3">
        <img src={comment.user.avatar} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="bg-white/5 rounded-2xl px-3 py-2">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs font-bold">{comment.user.username}</span>
              {comment.user.verified && <VerifiedBadge type={comment.user.verificationType} size="sm" />}
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{comment.text}</p>
          </div>
          <div className="flex items-center gap-4 mt-1 px-1">
            <span className="text-[10px] text-white/40">{comment.timestamp}</span>
            <button className="text-[10px] text-white/50 font-semibold hover:text-white transition-colors">Reply</button>
            {likes > 0 && <span className="text-[10px] text-white/40">{likes} likes</span>}
          </div>
        </div>
        <button
          className="mt-2 flex-shrink-0"
          onClick={() => { setIsLiked(!isLiked); setLikes(prev => isLiked ? prev - 1 : prev + 1); }}
        >
          <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white/40'}`} />
        </button>
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-10 mt-1">
          <button
            className="text-[11px] text-indigo-400 font-semibold flex items-center gap-1"
            onClick={() => setShowReplies(!showReplies)}
          >
            {showReplies ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showReplies ? 'Hide' : `View ${comment.replies.length}`} {comment.replies.length === 1 ? 'reply' : 'replies'}
          </button>
          {showReplies && comment.replies.map(reply => (
            <CommentItem key={reply.id} comment={reply} depth={1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const CommentsModal: React.FC<CommentsModalProps> = ({ post, onClose }) => {
  const [newComment, setNewComment] = useState('');
  const [localComments, setLocalComments] = useState<Comment[]>(post.commentList || []);

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    const comment: Comment = {
      id: `cm_${Date.now()}`,
      userId: CURRENT_USER.id,
      user: CURRENT_USER,
      text: newComment.trim(),
      likes: 0,
      timestamp: 'Just now',
    };
    setLocalComments(prev => [comment, ...prev]);
    setNewComment('');
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#111] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
          <h3 className="font-bold text-base">Comments</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Post preview */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-white/2 flex-shrink-0">
          {post.mediaUrl && (
            <img src={post.mediaUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold">{post.user.username}</span>
              {post.user.verified && <VerifiedBadge type={post.user.verificationType} size="sm" />}
            </div>
            <p className="text-xs text-white/60 truncate">{post.caption}</p>
          </div>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {localComments.length === 0 ? (
            <div className="text-center py-12 text-white/30 text-sm">
              No comments yet. Be the first!
            </div>
          ) : (
            localComments.map(comment => (
              <CommentItem key={comment.id} comment={comment} />
            ))
          )}
        </div>

        {/* Comment input */}
        <div className="flex items-center gap-3 p-3 border-t border-white/10 flex-shrink-0">
          <img src={CURRENT_USER.avatar} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          <div className="flex-1 flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2 gap-2 focus-within:border-indigo-500 transition-colors">
            <input
              type="text"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Add a comment..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim()}
            className="text-indigo-400 disabled:text-white/20 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
