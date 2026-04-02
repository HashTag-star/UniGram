
import React, { useState } from 'react';
import { X, Heart, UserPlus, MessageCircle, Repeat2, AtSign, CalendarDays, ShieldCheck, Bell } from 'lucide-react';
import { Notification, NotificationType } from '../types';
import { VerifiedBadge } from './VerifiedBadge';

interface NotificationsPanelProps {
  notifications: Notification[];
  onClose: () => void;
}

const notifIcon: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
  like: { icon: <Heart className="w-3.5 h-3.5" />, color: 'bg-red-500/20 text-red-400' },
  follow: { icon: <UserPlus className="w-3.5 h-3.5" />, color: 'bg-indigo-500/20 text-indigo-400' },
  comment: { icon: <MessageCircle className="w-3.5 h-3.5" />, color: 'bg-blue-500/20 text-blue-400' },
  repost: { icon: <Repeat2 className="w-3.5 h-3.5" />, color: 'bg-green-500/20 text-green-400' },
  mention: { icon: <AtSign className="w-3.5 h-3.5" />, color: 'bg-yellow-500/20 text-yellow-400' },
  event: { icon: <CalendarDays className="w-3.5 h-3.5" />, color: 'bg-purple-500/20 text-purple-400' },
  verification: { icon: <ShieldCheck className="w-3.5 h-3.5" />, color: 'bg-green-500/20 text-green-400' },
  dm: { icon: <MessageCircle className="w-3.5 h-3.5" />, color: 'bg-pink-500/20 text-pink-400' },
};

type Filter = 'all' | 'unread' | 'follows' | 'likes';

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({ notifications, onClose }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [localNotifs, setLocalNotifs] = useState(notifications);

  const filtered = localNotifs.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'follows') return n.type === 'follow';
    if (filter === 'likes') return n.type === 'like';
    return true;
  });

  const markAllRead = () => setLocalNotifs(prev => prev.map(n => ({ ...n, read: true })));
  const unreadCount = localNotifs.filter(n => !n.read).length;

  return (
    <div className="fixed inset-0 z-[140] flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-sm h-full bg-[#0d0d0d] border-l border-white/10 flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base">Notifications</h3>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                Mark all read
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-2 border-b border-white/5">
          {(['all', 'unread', 'follows', 'likes'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all capitalize ${filter === f ? 'bg-indigo-600 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Notifications list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-white/30 text-sm">
              <Bell className="w-10 h-10 mb-2 opacity-20" />
              No notifications here
            </div>
          ) : (
            <div>
              {filtered.some(n => !n.read) && (
                <div className="px-4 py-2 bg-white/2">
                  <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">New</p>
                </div>
              )}
              {filtered.map(notif => {
                const cfg = notifIcon[notif.type];
                return (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-white/3 transition-colors border-b border-white/5 cursor-pointer ${!notif.read ? 'bg-indigo-500/5' : ''}`}
                    onClick={() => setLocalNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))}
                  >
                    {/* Avatar + icon overlay */}
                    <div className="relative flex-shrink-0">
                      <img src={notif.user.avatar} className="w-10 h-10 rounded-full object-cover" />
                      <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center ${cfg.color}`}>
                        {cfg.icon}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm leading-snug">
                          <span className="font-bold">{notif.user.username}</span>
                          {notif.user.verified && (
                            <span className="inline-flex ml-0.5 align-middle">
                              <VerifiedBadge type={notif.user.verificationType} size="sm" />
                            </span>
                          )}{' '}
                          <span className="text-white/70">{notif.text}</span>
                        </p>
                        {notif.postImage && (
                          <img src={notif.postImage} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-white/30 mt-0.5">{notif.timestamp}</p>
                    </div>

                    {/* Unread dot */}
                    {!notif.read && <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-2" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
