
import React, { useState } from 'react';
import { Grid, BookmarkIcon, Film, Link2, MapPin, Settings, UserPlus, MessageCircle, Shield, Edit3, MoreHorizontal } from 'lucide-react';
import { User, Post, Highlight } from '../types';
import { MOCK_POSTS, CURRENT_USER } from '../constants';
import { VerifiedBadge } from './VerifiedBadge';

interface ProfilePageProps {
  user?: User;
  isOwn?: boolean;
  onVerificationClick?: () => void;
  onSettingsClick?: () => void;
  posts?: Post[];
}

type ProfileTab = 'posts' | 'reels' | 'saved' | 'tagged';

const MOCK_HIGHLIGHTS: Highlight[] = [
  { id: 'h1', title: 'Campus', coverImage: 'https://picsum.photos/seed/hl1/200', stories: [] },
  { id: 'h2', title: 'Hackathon', coverImage: 'https://picsum.photos/seed/hl2/200', stories: [] },
  { id: 'h3', title: 'Code', coverImage: 'https://picsum.photos/seed/hl3/200', stories: [] },
  { id: 'h4', title: 'Travel', coverImage: 'https://picsum.photos/seed/hl4/200', stories: [] },
];

export const ProfilePage: React.FC<ProfilePageProps> = ({
  user = CURRENT_USER,
  isOwn = true,
  onVerificationClick,
  onSettingsClick,
  posts = MOCK_POSTS,
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(user.followers);
  const [showFollowersModal, setShowFollowersModal] = useState<'followers' | 'following' | null>(null);

  const userPosts = posts.filter(p => p.userId === user.id || isOwn);
  const imagePosts = userPosts.filter(p => p.mediaUrl);

  const handleFollow = () => {
    setIsFollowing(prev => !prev);
    setFollowersCount(prev => isFollowing ? prev - 1 : prev + 1);
  };

  const verificationLabel: Record<string, string> = {
    student: 'Verified Student',
    professor: 'Verified Faculty',
    club: 'Verified Organization',
    influencer: 'Notable Account',
    staff: 'Verified Staff',
  };

  return (
    <div className="max-w-xl mx-auto pb-24 overflow-y-auto">
      {/* Cover image */}
      <div className="relative h-28 bg-gradient-to-br from-indigo-900 to-purple-900">
        {user.coverImage && (
          <img src={user.coverImage} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/20" />
        {isOwn && (
          <button
            onClick={onSettingsClick}
            className="absolute top-3 right-3 bg-black/40 backdrop-blur-sm p-2 rounded-full hover:bg-black/60 transition-colors"
          >
            <Settings className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Avatar + actions row */}
      <div className="px-4 -mt-12 mb-3 flex items-end justify-between">
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-4 border-black overflow-hidden">
            <img src={user.avatar} className="w-full h-full object-cover" />
          </div>
          {user.verified && (
            <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full border-2 border-black">
              <VerifiedBadge type={user.verificationType} size="md" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pb-1">
          {isOwn ? (
            <>
              <button className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-full px-4 py-2 text-sm font-semibold transition-all">
                <Edit3 className="w-3.5 h-3.5" />
                Edit Profile
              </button>
              {!user.verified && (
                <button
                  onClick={onVerificationClick}
                  className="flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-400 rounded-full px-3 py-2 text-sm font-semibold transition-all"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Get Verified
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={handleFollow}
                className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${isFollowing ? 'bg-white/10 border border-white/20 hover:border-red-500/40 hover:text-red-400' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
              <button className="bg-white/10 border border-white/10 rounded-full p-2 hover:bg-white/15 transition-all">
                <MessageCircle className="w-5 h-5" />
              </button>
              <button className="bg-white/10 border border-white/10 rounded-full p-2 hover:bg-white/15 transition-all">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* User info */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-bold">{user.fullName}</h2>
          {user.verified && (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
              <VerifiedBadge type={user.verificationType} size="sm" />
              <span className="text-[10px] text-white/60">{verificationLabel[user.verificationType || 'student']}</span>
            </div>
          )}
        </div>
        <p className="text-sm text-white/60 font-medium">@{user.username}</p>
        {user.pronouns && <p className="text-xs text-white/40 mt-0.5">{user.pronouns}</p>}
        <p className="text-sm text-white/80 mt-2 leading-relaxed">{user.bio}</p>

        {/* Meta */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-white/40">
            <MapPin className="w-3.5 h-3.5" />
            <span>{user.university} • Class of {user.year}</span>
          </div>
          {user.website && (
            <div className="flex items-center gap-1 text-xs text-indigo-400">
              <Link2 className="w-3.5 h-3.5" />
              <a href={`https://${user.website}`} className="hover:underline">{user.website}</a>
            </div>
          )}
        </div>

        {/* Major tag */}
        <div className="mt-2">
          <span className="inline-block text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full px-2.5 py-1">
            {user.major} {user.year > 2000 ? `• Year ${5 - (user.year - new Date().getFullYear())}` : ''}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 mt-4">
          <div className="text-center">
            <p className="font-bold text-base">{user.posts}</p>
            <p className="text-xs text-white/40">Posts</p>
          </div>
          <button className="text-center hover:opacity-80 transition-opacity" onClick={() => setShowFollowersModal('followers')}>
            <p className="font-bold text-base">{followersCount.toLocaleString()}</p>
            <p className="text-xs text-white/40">Followers</p>
          </button>
          <button className="text-center hover:opacity-80 transition-opacity" onClick={() => setShowFollowersModal('following')}>
            <p className="font-bold text-base">{user.following.toLocaleString()}</p>
            <p className="text-xs text-white/40">Following</p>
          </button>
        </div>
      </div>

      {/* Highlights */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-1">
          {isOwn && (
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                <span className="text-2xl text-white/30">+</span>
              </div>
              <span className="text-[10px] text-white/40">New</span>
            </div>
          )}
          {MOCK_HIGHLIGHTS.map(h => (
            <div key={h.id} className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer group">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/20 group-hover:border-indigo-400 transition-colors">
                <img src={h.coverImage} className="w-full h-full object-cover" />
              </div>
              <span className="text-[10px] text-white/60">{h.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-t border-white/10 flex">
        {[
          { id: 'posts' as ProfileTab, icon: <Grid className="w-5 h-5" /> },
          { id: 'reels' as ProfileTab, icon: <Film className="w-5 h-5" /> },
          { id: 'saved' as ProfileTab, icon: <BookmarkIcon className="w-5 h-5" /> },
          { id: 'tagged' as ProfileTab, icon: <UserPlus className="w-5 h-5" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center py-3 border-b-2 transition-colors ${activeTab === tab.id ? 'border-white text-white' : 'border-transparent text-white/30 hover:text-white/60'}`}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Grid */}
      {activeTab === 'posts' && (
        <div className="grid grid-cols-3 gap-0.5">
          {imagePosts.length > 0 ? imagePosts.map(post => (
            <div key={post.id} className="aspect-square overflow-hidden bg-white/5 relative group cursor-pointer">
              <img src={post.mediaUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="flex items-center gap-4 text-white text-sm font-bold drop-shadow">
                  <span>❤️ {post.likes}</span>
                  <span>💬 {post.comments}</span>
                </div>
              </div>
              {post.type === 'video' || post.type === 'reel' ? (
                <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1">
                  <Film className="w-3 h-3 text-white" />
                </div>
              ) : null}
            </div>
          )) : (
            <div className="col-span-3 py-16 text-center text-white/30">
              <Grid className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p>No posts yet</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reels' && (
        <div className="grid grid-cols-3 gap-0.5">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[9/16] overflow-hidden bg-white/5 relative group cursor-pointer">
              <img src={`https://picsum.photos/seed/reel${i}p/300/500`} className="w-full h-full object-cover" />
              <div className="absolute bottom-1 left-1 flex items-center gap-1">
                <Film className="w-3 h-3 text-white drop-shadow" />
                <span className="text-white text-[10px] drop-shadow">{(Math.random() * 50 + 1).toFixed(0)}K</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {(activeTab === 'saved' || activeTab === 'tagged') && (
        <div className="py-16 text-center text-white/30">
          <BookmarkIcon className="w-10 h-10 mx-auto mb-2 opacity-20" />
          <p>{activeTab === 'saved' ? 'No saved posts' : 'No tagged posts'}</p>
        </div>
      )}

      {/* Followers/Following Modal */}
      {showFollowersModal && (
        <div
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/80"
          onClick={() => setShowFollowersModal(null)}
        >
          <div
            className="w-full max-w-sm bg-[#111] border border-white/10 rounded-t-3xl sm:rounded-3xl p-4"
            style={{ maxHeight: '60vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold capitalize">{showFollowersModal}</h3>
              <button onClick={() => setShowFollowersModal(null)}>✕</button>
            </div>
            {[CURRENT_USER, ...MOCK_USERS.slice(0, 3)].map(u => (
              <div key={u.id} className="flex items-center gap-3 py-2">
                <img src={u.avatar} className="w-10 h-10 rounded-full object-cover" />
                <div className="flex-1">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-sm">{u.username}</span>
                    {u.verified && <VerifiedBadge type={u.verificationType} size="sm" />}
                  </div>
                  <p className="text-xs text-white/50">{u.fullName}</p>
                </div>
                <button className="text-xs bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-full px-3 py-1">Follow</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
