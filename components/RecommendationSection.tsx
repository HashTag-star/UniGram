
import React, { useState, useEffect } from 'react';
import { UserPlus, Users, Calendar, Sparkles, ChevronRight, RefreshCw } from 'lucide-react';
import { Recommendation, User } from '../types';
import { getPersonalizedRecommendations } from '../services/gemini';

interface RecommendationSectionProps {
  currentUser: User;
}

export const RecommendationSection: React.FC<RecommendationSectionProps> = ({ currentUser }) => {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecs = async () => {
    setLoading(true);
    const data = await getPersonalizedRecommendations({
      major: currentUser.major,
      university: currentUser.university,
      interests: currentUser.interests
    });
    setRecs(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRecs();
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'connection': return <UserPlus className="w-4 h-4" />;
      case 'group': return <Users className="w-4 h-4" />;
      case 'event': return <Calendar className="w-4 h-4" />;
      default: return <Sparkles className="w-4 h-4" />;
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400 fill-indigo-400/20" />
          <h2 className="text-lg font-bold tracking-tight">AI For You</h2>
        </div>
        <button onClick={fetchRecs} className={`text-indigo-400 p-1 rounded-full hover:bg-indigo-500/10 transition-colors ${loading ? 'animate-spin' : ''}`}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-white/5 animate-pulse rounded-2xl border border-white/10"></div>
          ))
        ) : (
          recs.map(rec => (
            <div key={rec.id} className="group flex items-start gap-4 p-4 bg-white/[0.03] border border-white/10 rounded-2xl hover:bg-white/[0.06] hover:border-indigo-500/30 transition-all cursor-pointer">
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 flex items-center justify-center text-indigo-400 flex-shrink-0 group-hover:scale-110 transition-transform">
                {getIcon(rec.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm truncate">{rec.title}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 bg-white/10 rounded text-white/50 font-medium uppercase tracking-tighter">
                    {rec.type}
                  </span>
                </div>
                <p className="text-xs text-white/60 mb-1 truncate">{rec.subtitle}</p>
                <p className="text-[10px] text-indigo-400/80 leading-relaxed line-clamp-1 italic">"{rec.reason}"</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 mt-1 group-hover:text-white/60 transition-colors" />
            </div>
          ))
        )}
      </div>
    </div>
  );
};
