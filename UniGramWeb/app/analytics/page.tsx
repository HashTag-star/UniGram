"use client";
import React, { useEffect, useState } from "react";
import { TrendingUp, Users, Activity, Eye, MousePointerClick, ShieldCheck, Video, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AnalyticsPage() {
  const [stats, setStats] = useState({
    users: 0,
    posts: 0,
    verifications: 0,
    liveSessions: 0,
    loading: true
  });

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const [
          { count: usersCount },
          { count: postsCount },
          { count: verificationsCount },
          { count: liveCount }
        ] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }).then(res => res, () => ({ count: 0 })),
          supabase.from('posts').select('*', { count: 'exact', head: true }).then(res => res, () => ({ count: 0 })),
          supabase.from('verification_requests').select('*', { count: 'exact', head: true }).then(res => res, () => ({ count: 0 })),
          supabase.from('live_sessions').select('*', { count: 'exact', head: true }).then(res => res, () => ({ count: 0 }))
        ]);

        setStats({
          users: usersCount || 0,
          posts: postsCount || 0,
          verifications: verificationsCount || 0,
          liveSessions: liveCount || 0,
          loading: false
        });
      } catch (error) {
        console.error("Error fetching analytics:", error);
        setStats(prev => ({ ...prev, loading: false }));
      }
    }

    fetchAnalytics();
  }, []);
  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <TrendingUp className="text-indigo-400" />
            Platform Analytics
          </h1>
          <p className="text-white/50 mt-1">Key metrics and performance indicators.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Users" value={stats.loading ? "..." : stats.users.toLocaleString()} sub="Registered accounts" icon={<Users className="text-blue-400" />} />
        <StatCard label="Total Posts" value={stats.loading ? "..." : stats.posts.toLocaleString()} sub="Published content" icon={<MessageSquare className="text-green-400" />} />
        <StatCard label="Verifications" value={stats.loading ? "..." : stats.verifications.toLocaleString()} sub="Processed requests" icon={<ShieldCheck className="text-purple-400" />} />
        <StatCard label="Live Sessions" value={stats.loading ? "..." : stats.liveSessions.toLocaleString()} sub="Broadcasts created" icon={<Video className="text-yellow-400" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass rounded-3xl p-8 h-96 flex flex-col">
          <h3 className="text-lg font-bold mb-6">User Growth Overview</h3>
          <div className="flex-1 flex items-center justify-center border border-white/5 rounded-2xl bg-white/[0.02]">
            <p className="text-white/30 text-sm">Chart rendering soon...</p>
          </div>
        </div>
        
        <div className="glass rounded-3xl p-8 h-96 flex flex-col">
          <h3 className="text-lg font-bold mb-6">Engagement Trends</h3>
          <div className="flex-1 flex items-center justify-center border border-white/5 rounded-2xl bg-white/[0.02]">
            <p className="text-white/30 text-sm">Chart rendering soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-6 transition-all border border-white/5 hover:border-white/10">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">{icon}</div>
      </div>
      <p className="text-white/40 text-xs font-medium uppercase tracking-wider">{label}</p>
      <h4 className="text-2xl font-bold mt-1 tracking-tight text-white">{value}</h4>
      <p className="text-xs text-white/30 mt-1">{sub}</p>
    </div>
  );
}
