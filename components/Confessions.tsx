
import React, { useState } from 'react';
import { Heart, Ghost, Send } from 'lucide-react';
import { Confession } from '../types';

interface ConfessionsProps {
  confessions: Confession[];
}

export const Confessions: React.FC<ConfessionsProps> = ({ confessions }) => {
  const [newConfession, setNewConfession] = useState('');

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-white/10 rounded-2xl">
          <Ghost className="w-8 h-8 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Confessions</h1>
          <p className="text-sm text-white/50">Post anonymously to your campus feed</p>
        </div>
      </div>

      <div className="mb-8 p-4 bg-white/5 rounded-2xl border border-white/10">
        <textarea 
          placeholder="I have a confession..."
          className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none h-24"
          value={newConfession}
          onChange={(e) => setNewConfession(e.target.value)}
        />
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
          <span className="text-[10px] text-white/30 uppercase tracking-widest">Anonymous Post</span>
          <button 
            disabled={!newConfession.trim()}
            className="flex items-center gap-2 bg-indigo-600 px-4 py-1.5 rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-indigo-500 transition-colors"
          >
            <Send className="w-4 h-4" /> Post
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {confessions.map(c => (
          <div key={c.id} className="p-5 bg-gradient-to-br from-white/5 to-white/[0.02] rounded-2xl border border-white/10">
            <p className="text-base leading-relaxed mb-4 italic text-white/90">"{c.text}"</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40 uppercase tracking-widest">{c.timestamp}</span>
              <button className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full hover:bg-white/10 transition-colors group">
                <Heart className="w-4 h-4 text-red-500 group-hover:scale-125 transition-transform" />
                <span className="text-xs font-medium">{c.likes}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
