
import React, { useState, useRef, useEffect } from 'react';
import { Search, Edit, ArrowLeft, Send, Image, Smile, Phone, Video, Info, Circle } from 'lucide-react';
import { Conversation, Message, User } from '../types';
import { CURRENT_USER } from '../constants';
import { VerifiedBadge } from './VerifiedBadge';

interface MessagesTabProps {
  conversations: Conversation[];
}

const MOCK_THREAD: Record<string, Message[]> = {
  conv1: [
    { id: 'm1', senderId: 'u2', text: 'Hey!! 👋', timestamp: '2:45 PM', read: true },
    { id: 'm2', senderId: 'u1', text: 'Hey Sarah! What\'s up?', timestamp: '2:46 PM', read: true },
    { id: 'm3', senderId: 'u2', text: 'Did you see the hackathon results? 🎉', timestamp: '2:47 PM', read: true },
    { id: 'm4', senderId: 'u2', text: 'Team Apollo won!!', timestamp: '2:47 PM', read: true },
    { id: 'm5', senderId: 'u1', text: 'WAIT no way!! That\'s insane 🔥', timestamp: '2:48 PM', read: true },
    { id: 'm6', senderId: 'u2', text: 'I know right!!! We should go celebrate tonight', timestamp: '2:49 PM', read: false },
    { id: 'm7', senderId: 'u2', text: 'Are you free? 😊', timestamp: '2m ago', read: false },
  ],
  conv2: [
    { id: 'c1', senderId: 'u3', text: 'CS Club meeting tomorrow at 6pm, don\'t forget!', timestamp: '1h ago', read: false },
  ],
  conv3: [
    { id: 'c1', senderId: 'u1', text: 'Sure, 7am works for me!', timestamp: '3h ago', read: true },
    { id: 'c2', senderId: 'u5', text: 'Gym at 7am? 💪', timestamp: '3h ago', read: true },
  ],
};

const getParticipantName = (conv: Conversation): string => {
  if (conv.isGroup) return conv.groupName || 'Group';
  return conv.participants[0]?.fullName || 'Unknown';
};

const getParticipantAvatar = (conv: Conversation): string => {
  if (conv.isGroup) return conv.groupAvatar || 'https://picsum.photos/seed/group/200';
  return conv.participants[0]?.avatar || '';
};

export const MessagesTab: React.FC<MessagesTabProps> = ({ conversations }) => {
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeConv) {
      setMessages(MOCK_THREAD[activeConv.id] || [activeConv.lastMessage]);
    }
  }, [activeConv]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    const msg: Message = {
      id: `msg_${Date.now()}`,
      senderId: CURRENT_USER.id,
      text: newMessage.trim(),
      timestamp: 'Just now',
      read: false,
    };
    setMessages(prev => [...prev, msg]);
    setNewMessage('');
  };

  const filteredConvs = conversations.filter(c =>
    getParticipantName(c).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  if (activeConv) {
    const participant = activeConv.participants[0];
    return (
      <div className="flex flex-col h-[calc(100vh-128px)]">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-black flex-shrink-0">
          <button onClick={() => setActiveConv(null)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            <img src={getParticipantAvatar(activeConv)} className="w-9 h-9 rounded-full object-cover" />
            {!activeConv.isGroup && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-black" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-bold text-sm">{getParticipantName(activeConv)}</span>
              {participant?.verified && <VerifiedBadge type={participant.verificationType} size="sm" />}
            </div>
            <span className="text-[10px] text-green-400">{activeConv.isGroup ? `${activeConv.participants.length + 1} members` : 'Active now'}</span>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Phone className="w-5 h-5 text-white/60" /></button>
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Video className="w-5 h-5 text-white/60" /></button>
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Info className="w-5 h-5 text-white/60" /></button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2">
              <img src={getParticipantAvatar(activeConv)} className="w-14 h-14 rounded-full object-cover" />
            </div>
          </div>
          <div className="text-center mb-6">
            <p className="font-bold">{getParticipantName(activeConv)}</p>
            {participant?.verified && (
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <VerifiedBadge type={participant.verificationType} size="sm" />
                <span className="text-xs text-white/40">Verified account</span>
              </div>
            )}
            <p className="text-xs text-white/40 mt-1">{participant?.university}</p>
          </div>

          {messages.map((msg, i) => {
            const isMe = msg.senderId === CURRENT_USER.id;
            const showAvatar = !isMe && (i === 0 || messages[i - 1].senderId !== msg.senderId);
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isMe && (
                  <div className="w-6 h-6 flex-shrink-0">
                    {showAvatar && <img src={getParticipantAvatar(activeConv)} className="w-6 h-6 rounded-full object-cover" />}
                  </div>
                )}
                <div className={`max-w-[70%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}`}>
                  {msg.text}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 p-3 border-t border-white/10 flex-shrink-0 bg-black">
          <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <Image className="w-5 h-5 text-white/50" />
          </button>
          <div className="flex-1 flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2 gap-2 focus-within:border-indigo-500 transition-colors">
            <input
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Message..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            <button className="text-white/40 hover:text-white transition-colors">
              <Smile className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={sendMessage}
            className={`p-2 rounded-full transition-all ${newMessage.trim() ? 'bg-indigo-600 text-white' : 'text-white/30'}`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">{CURRENT_USER.username}</h2>
          {CURRENT_USER.verified && <VerifiedBadge type={CURRENT_USER.verificationType} />}
        </div>
        <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <Edit className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full bg-white/5 border border-white/10 rounded-full py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Online friends */}
      <div className="px-4 mb-4">
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Active Now</p>
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
          {conversations.slice(0, 4).map(conv => (
            <button
              key={conv.id}
              onClick={() => setActiveConv(conv)}
              className="flex flex-col items-center gap-1 flex-shrink-0"
            >
              <div className="relative">
                <img src={getParticipantAvatar(conv)} className="w-12 h-12 rounded-full object-cover" />
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-black" />
              </div>
              <span className="text-[10px] text-white/60 max-w-[48px] truncate">{conv.participants[0]?.username}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Conversations */}
      <div className="px-4">
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">
          Messages {totalUnread > 0 && <span className="text-indigo-400">({totalUnread} new)</span>}
        </p>
        <div className="space-y-1">
          {filteredConvs.map(conv => (
            <button
              key={conv.id}
              onClick={() => setActiveConv(conv)}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-2xl transition-colors text-left"
            >
              <div className="relative flex-shrink-0">
                <img src={getParticipantAvatar(conv)} className="w-12 h-12 rounded-full object-cover" />
                {conv.unreadCount > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center border-2 border-black">
                    <span className="text-[8px] text-white font-bold">{conv.unreadCount}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className={`text-sm ${conv.unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}>
                      {getParticipantName(conv)}
                    </span>
                    {conv.participants[0]?.verified && (
                      <VerifiedBadge type={conv.participants[0].verificationType} size="sm" />
                    )}
                  </div>
                  <span className="text-[10px] text-white/30">{conv.lastMessage.timestamp}</span>
                </div>
                <p className={`text-xs truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-white font-medium' : 'text-white/50'}`}>
                  {conv.lastMessage.senderId === CURRENT_USER.id ? 'You: ' : ''}
                  {conv.lastMessage.text}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
