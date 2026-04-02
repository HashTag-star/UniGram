
import React, { useState } from 'react';
import { Search, TrendingUp, Hash, Users, Image, X } from 'lucide-react';
import { MOCK_POSTS, MOCK_USERS, TRENDING_HASHTAGS, SUGGESTED_USERS } from '../constants';
import { VerifiedBadge } from './VerifiedBadge';
import { User } from '../types';

type Tab = 'top' | 'people' | 'tags' | 'media';

interface SearchPageProps {
  onUserClick?: (user: User) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({ onUserClick }) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('top');
  const [isSearching, setIsSearching] = useState(false);

  const allUsers = [
    ...MOCK_USERS,
  ];

  const filteredUsers = allUsers.filter(u =>
    u.username.toLowerCase().includes(query.toLowerCase()) ||
    u.fullName.toLowerCase().includes(query.toLowerCase()) ||
    u.major.toLowerCase().includes(query.toLowerCase())
  );

  const filteredPosts = MOCK_POSTS.filter(p =>
    p.caption.toLowerCase().includes(query.toLowerCase()) ||
    p.hashtags?.some(h => h.toLowerCase().includes(query.toLowerCase()))
  );

  const filteredTags = TRENDING_HASHTAGS.filter(t =>
    t.tag.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="max-w-xl mx-auto px-4 pt-2 pb-24">
      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setIsSearching(!!e.target.value); }}
          placeholder="Search UniGram..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-10 pr-10 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          autoFocus
        />
        {query && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
            onClick={() => { setQuery(''); setIsSearching(false); }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isSearching ? (
        <>
          {/* Search tabs */}
          <div className="flex gap-1 mb-4 border-b border-white/10">
            {(['top', 'people', 'tags', 'media'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-[2px] ${activeTab === tab ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-white/50 hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {(activeTab === 'top' || activeTab === 'people') && filteredUsers.length > 0 && (
            <div className="mb-6">
              {activeTab === 'top' && <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">People</p>}
              <div className="space-y-3">
                {filteredUsers.map(user => (
                  <button
                    key={user.id}
                    onClick={() => onUserClick?.(user)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-2xl transition-colors text-left"
                  >
                    <img src={user.avatar} className="w-11 h-11 rounded-full object-cover" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-sm">{user.username}</span>
                        {user.verified && <VerifiedBadge type={user.verificationType} size="sm" />}
                      </div>
                      <p className="text-xs text-white/50">{user.fullName} • {user.major}</p>
                      <p className="text-xs text-white/30">{user.followers.toLocaleString()} followers</p>
                    </div>
                    <button className="border border-white/20 rounded-full px-3 py-1 text-xs text-white/70 hover:border-indigo-500 hover:text-indigo-400 transition-colors">
                      Follow
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(activeTab === 'top' || activeTab === 'tags') && filteredTags.length > 0 && (
            <div className="mb-6">
              {activeTab === 'top' && <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Hashtags</p>}
              <div className="space-y-2">
                {filteredTags.map(({ tag, posts }) => (
                  <button key={tag} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-2xl transition-colors text-left">
                    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <Hash className="w-5 h-5 text-white/50" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{tag}</p>
                      <p className="text-xs text-white/40">{posts} posts</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(activeTab === 'top' || activeTab === 'media') && filteredPosts.length > 0 && (
            <div>
              {activeTab === 'top' && <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Posts</p>}
              <div className="grid grid-cols-3 gap-0.5">
                {filteredPosts.filter(p => p.mediaUrl).map(post => (
                  <div key={post.id} className="aspect-square overflow-hidden bg-white/5 relative group cursor-pointer">
                    <img src={post.mediaUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="flex items-center gap-3 text-white text-xs font-bold">
                        <span>❤️ {post.likes}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredUsers.length === 0 && filteredPosts.length === 0 && filteredTags.length === 0 && (
            <div className="text-center py-16 text-white/30">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No results for "{query}"</p>
              <p className="text-sm mt-1">Try a different search</p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Suggested Users */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Suggested for You</p>
              <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">See All</button>
            </div>
            <div className="space-y-3">
              {SUGGESTED_USERS.map(user => (
                <div key={user.id} className="flex items-center gap-3">
                  <button onClick={() => onUserClick?.(user)}>
                    <img src={user.avatar} className="w-11 h-11 rounded-full object-cover" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <button onClick={() => onUserClick?.(user)} className="font-bold text-sm hover:underline">{user.username}</button>
                      {user.verified && <VerifiedBadge type={user.verificationType} size="sm" />}
                    </div>
                    <p className="text-xs text-white/50 truncate">{user.major} • {user.followers.toLocaleString()} followers</p>
                  </div>
                  <button className="bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 rounded-full px-3 py-1 text-xs font-semibold transition-all">
                    Follow
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Trending */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Trending at Stanford</p>
            </div>
            <div className="space-y-1">
              {TRENDING_HASHTAGS.map(({ tag, posts }, i) => (
                <button key={tag} className="w-full flex items-center gap-3 p-2.5 hover:bg-white/5 rounded-xl transition-colors text-left group">
                  <span className="text-white/20 text-xs font-bold w-4 text-right">{i + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                    <Hash className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{tag}</p>
                    <p className="text-[10px] text-white/40">{posts} posts</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div>
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Explore</p>
            <div className="grid grid-cols-3 gap-0.5">
              {MOCK_POSTS.filter(p => p.mediaUrl).concat(MOCK_POSTS.filter(p => p.mediaUrl)).map((post, i) => (
                <div key={`${post.id}-${i}`} className={`overflow-hidden bg-white/5 relative group cursor-pointer ${i === 0 || i === 4 ? 'row-span-2' : ''} aspect-square`}>
                  <img src={`https://picsum.photos/seed/explore${i}/400/400`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex items-center gap-3 text-white text-xs font-bold drop-shadow">
                      <span>❤️ {Math.floor(Math.random() * 5000)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
