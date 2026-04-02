
import React, { useState, useRef } from 'react';
import { X, Image, Film, Type, MapPin, Tag, Globe, Lock, Users, ChevronDown, Sparkles } from 'lucide-react';
import { CURRENT_USER } from '../constants';
import { VerifiedBadge } from './VerifiedBadge';

interface CreatePostModalProps {
  onClose: () => void;
  onPost: (caption: string, type: string, mediaUrl?: string) => void;
}

type PostType = 'image' | 'video' | 'thread';
type Audience = 'everyone' | 'followers' | 'university';

export const CreatePostModal: React.FC<CreatePostModalProps> = ({ onClose, onPost }) => {
  const [step, setStep] = useState<'type' | 'compose'>('type');
  const [postType, setPostType] = useState<PostType>('thread');
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>('everyone');
  const [location, setLocation] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const MAX_CHARS = postType === 'thread' ? 280 : 2200;
  const remaining = MAX_CHARS - caption.length;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStep('compose');
  };

  const handleTypeSelect = (type: PostType) => {
    setPostType(type);
    if (type === 'thread') {
      setStep('compose');
    } else {
      fileRef.current?.click();
    }
  };

  const handlePost = async () => {
    if (!caption.trim() && !previewUrl) return;
    setIsPosting(true);
    await new Promise(r => setTimeout(r, 800));
    onPost(caption, postType, previewUrl || undefined);
    setIsPosting(false);
    onClose();
  };

  const audienceConfig: Record<Audience, { icon: React.ReactNode; label: string }> = {
    everyone: { icon: <Globe className="w-3.5 h-3.5" />, label: 'Everyone' },
    followers: { icon: <Users className="w-3.5 h-3.5" />, label: 'Followers' },
    university: { icon: <Tag className="w-3.5 h-3.5" />, label: 'Stanford only' },
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <input ref={fileRef} type="file" accept={postType === 'video' ? 'video/*' : 'image/*'} className="hidden" onChange={handleFileSelect} />
      <div
        className="w-full max-w-lg bg-[#111] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <button onClick={step === 'compose' ? () => setStep('type') : onClose} className="p-1 hover:bg-white/10 rounded-full">
            <X className="w-5 h-5" />
          </button>
          <h3 className="font-bold text-base">
            {step === 'type' ? 'Create Post' : postType === 'thread' ? 'New Thread' : 'New Post'}
          </h3>
          <button
            onClick={handlePost}
            disabled={(!caption.trim() && !previewUrl) || isPosting || caption.length > MAX_CHARS}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 text-white font-bold px-4 py-1.5 rounded-full text-sm transition-all"
          >
            {isPosting ? 'Posting...' : 'Post'}
          </button>
        </div>

        {step === 'type' ? (
          <div className="p-6">
            <p className="text-white/50 text-sm mb-6 text-center">What do you want to share?</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { type: 'image' as PostType, icon: <Image className="w-8 h-8" />, label: 'Photo', color: 'from-pink-600 to-orange-600' },
                { type: 'video' as PostType, icon: <Film className="w-8 h-8" />, label: 'Reel', color: 'from-purple-600 to-blue-600' },
                { type: 'thread' as PostType, icon: <Type className="w-8 h-8" />, label: 'Thread', color: 'from-blue-600 to-cyan-600' },
              ].map(({ type, icon, label, color }) => (
                <button
                  key={type}
                  onClick={() => handleTypeSelect(type)}
                  className="flex flex-col items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/50 rounded-2xl transition-all group"
                >
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    {icon}
                  </div>
                  <span className="text-sm font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="relative">
                <img src={CURRENT_USER.avatar} className="w-10 h-10 rounded-full object-cover" />
                {CURRENT_USER.verified && (
                  <div className="absolute -bottom-0.5 -right-0.5">
                    <VerifiedBadge type={CURRENT_USER.verificationType} size="sm" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-sm">{CURRENT_USER.username}</span>
                  <button
                    onClick={() => setAudience(prev => prev === 'everyone' ? 'followers' : prev === 'followers' ? 'university' : 'everyone')}
                    className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-0.5 text-xs text-white/70 hover:bg-white/15 transition-colors"
                  >
                    {audienceConfig[audience].icon}
                    <span>{audienceConfig[audience].label}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                {postType !== 'thread' && previewUrl && (
                  <div className="relative mb-3 rounded-xl overflow-hidden bg-black">
                    <img src={previewUrl} className="max-h-64 w-full object-cover" />
                    <button
                      className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                      onClick={() => { setPreviewUrl(null); setStep('type'); }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <textarea
                  autoFocus
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  placeholder={postType === 'thread' ? "What's on your mind?" : "Write a caption..."}
                  className="w-full bg-transparent text-sm resize-none focus:outline-none leading-relaxed placeholder-white/30"
                  rows={postType === 'thread' ? 5 : 3}
                />

                {showLocationInput && (
                  <div className="flex items-center gap-2 mt-2 bg-white/5 rounded-xl px-3 py-2">
                    <MapPin className="w-4 h-4 text-indigo-400" />
                    <input
                      type="text"
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="Add location..."
                      className="bg-transparent text-sm flex-1 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer options */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
              <div className="flex items-center gap-3">
                {postType !== 'thread' && (
                  <button className="p-1.5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors" onClick={() => fileRef.current?.click()}>
                    <Image className="w-5 h-5" />
                  </button>
                )}
                <button
                  className="p-1.5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors"
                  onClick={() => setShowLocationInput(!showLocationInput)}
                >
                  <MapPin className="w-5 h-5" />
                </button>
                <button className="p-1.5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                  <Sparkles className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs ${remaining < 20 ? 'text-red-400' : 'text-white/30'}`}>
                  {remaining}
                </span>
                <div
                  className="w-6 h-6 rounded-full border-2 border-white/20"
                  style={{
                    background: `conic-gradient(${remaining < 20 ? '#ef4444' : '#6366f1'} ${((MAX_CHARS - remaining) / MAX_CHARS) * 360}deg, transparent 0deg)`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
