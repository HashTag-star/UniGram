"use client";
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  ShieldCheck,
  Users,
  AlertTriangle,
  TrendingUp,
  BrainCircuit,
  Send,
  Loader2,
} from "lucide-react";

interface Stats {
  totalUsers: number;
  pendingVerifications: number;
  activeReports: number;
  liveSessions: number;
  newUsers7d: number;
  posts24h: number;
}

const PRESET_QUERIES = [
  { label: "Scan for Suspicious Activity", query: "Are there any suspicious patterns in recent reports or verifications? Give me a threat assessment." },
  { label: "Prioritise Verifications", query: "Which pending verification requests look most legitimate and should be prioritised? Summarise the top ones." },
  { label: "Review Flagged Content", query: "What are the most critical pending reports I should act on right now? What action should I take for each?" },
];

export default function Home() {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    pendingVerifications: 0,
    activeReports: 0,
    liveSessions: 0,
    newUsers7d: 0,
    posts24h: 0,
  });
  const [recentVerifications, setRecentVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [aiQuery, setAiQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchStats();
    fetchRecentVerifications();
  }, []);

  const fetchStats = async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: userCount },
      { count: newUsers7d },
      { count: pendingCount },
      { count: reportCount },
      { count: liveCount },
      { count: postsCount },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      supabase.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('live_sessions').select('*', { count: 'exact', head: true }).eq('status', 'live'),
      supabase.from('posts').select('*', { count: 'exact', head: true }).gte('created_at', oneDayAgo).then(res => res, () => ({ count: 0 })),
    ]);

    setStats({
      totalUsers: userCount || 0,
      pendingVerifications: pendingCount || 0,
      activeReports: reportCount || 0,
      liveSessions: liveCount || 0,
      newUsers7d: newUsers7d || 0,
      posts24h: (postsCount as any) || 0,
    });
  };

  const fetchRecentVerifications = async () => {
    try {
      const { data } = await supabase
        .from('verification_requests')
        .select('*')
        .order('submitted_at', { ascending: false })
        .limit(5);
      setRecentVerifications(data || []);
    } finally {
      setLoading(false);
    }
  };

  const askAI = async (query: string) => {
    const q = query.trim();
    if (!q || aiLoading) return;
    setAiLoading(true);
    setAiAnswer("");
    setAiError("");
    setAiQuery(q);
    try {
      const { data, error } = await supabase.functions.invoke('admin-ai-chat', {
        body: { query: q },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setAiAnswer(data.answer ?? "No response.");
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askAI(aiQuery);
  };

  return (
    <div className="p-8 space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Users" value={stats.totalUsers.toLocaleString()} sub={`+${stats.newUsers7d} this week`} icon={<Users className="text-blue-400" />} />
        <StatCard label="Pending Verifications" value={stats.pendingVerifications.toString()} sub="awaiting review" icon={<ShieldCheck className="text-green-400" />} />
        <StatCard label="Active Reports" value={stats.activeReports.toString()} sub="pending action" icon={<AlertTriangle className="text-red-400" />} />
        <StatCard label="Live Sessions" value={stats.liveSessions.toString()} sub="on right now" icon={<TrendingUp className="text-purple-400" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* AI Assistant */}
        <div className="lg:col-span-2 space-y-8">
          <div className="glass rounded-3xl p-8 overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <div className="relative space-y-6">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <BrainCircuit className="text-indigo-400" />
                  How can I help you today?
                </h2>
                <p className="text-white/50 mt-2 max-w-lg text-sm">
                  Ask me anything about the platform — reports, verifications, user trends, or anything else.
                </p>
              </div>

              {/* Preset buttons */}
              <div className="flex flex-wrap gap-2">
                {PRESET_QUERIES.map(p => (
                  <button
                    key={p.label}
                    onClick={() => askAI(p.query)}
                    disabled={aiLoading}
                    className="bg-white/5 border border-white/10 hover:border-indigo-500/40 hover:bg-indigo-500/5 disabled:opacity-40 px-4 py-2 rounded-xl text-xs font-bold transition-all text-white/70 hover:text-white"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Input */}
              <form onSubmit={handleSubmit} className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-2xl p-3 focus-within:border-indigo-500/40 transition-colors">
                <input
                  ref={inputRef}
                  type="text"
                  value={aiQuery}
                  onChange={e => setAiQuery(e.target.value)}
                  placeholder="e.g. 'Summarise last week's verification requests'"
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm text-white placeholder:text-white/30"
                  disabled={aiLoading}
                />
                <button
                  type="submit"
                  disabled={aiLoading || !aiQuery.trim()}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shrink-0"
                >
                  {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {aiLoading ? "Thinking..." : "Ask"}
                </button>
              </form>

              {/* Answer */}
              {(aiAnswer || aiError) && (
                <div className={`rounded-2xl p-5 border text-sm leading-relaxed ${
                  aiError
                    ? 'bg-red-500/10 border-red-500/20 text-red-300'
                    : 'bg-indigo-600/10 border-indigo-500/20 text-white/80'
                }`}>
                  {aiError ? (
                    <p className="text-red-300">⚠ {aiError}</p>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">AI Response</p>
                      <p className="whitespace-pre-wrap">{aiAnswer}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recent Verifications */}
          <div className="glass rounded-3xl p-8">
            <h3 className="text-lg font-bold mb-6">Recent Verifications</h3>
            <div className="space-y-4">
              {loading ? (
                <div className="py-12 text-center text-white/20">Loading...</div>
              ) : recentVerifications.length === 0 ? (
                <div className="py-12 text-center text-white/20">No recent activity.</div>
              ) : recentVerifications.map(req => (
                <div key={req.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                      <Users size={18} className="text-white/60" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-white">{req.full_name}</p>
                      <p className="text-xs text-white/40">{req.university} · {req.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                      {new Date(req.created_at || req.submitted_at).toLocaleDateString()}
                    </p>
                    <span className={`text-xs font-bold ${req.status === 'approved' ? 'text-green-400' : 'text-yellow-400'}`}>
                      {req.status === 'pending' ? 'Pending' : req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Platform Health */}
        <div className="space-y-8">
          <div className="glass rounded-3xl p-8 h-full">
            <h3 className="text-lg font-bold mb-6">Platform Health</h3>
            <div className="space-y-6">
              <HealthRow
                label="New Users (7d)"
                value={stats.newUsers7d}
                progress={Math.min(100, stats.newUsers7d * 2)}
                color="bg-indigo-500"
              />
              <HealthRow
                label="Content Activity (24h)"
                value={stats.posts24h}
                progress={Math.min(100, stats.posts24h)}
                color="bg-green-500"
              />
              <HealthRow
                label="Verification Backlog"
                value={stats.pendingVerifications}
                progress={Math.min(100, stats.pendingVerifications * 5)}
                color="bg-yellow-500"
              />
              <HealthRow
                label="Report Backlog"
                value={stats.activeReports}
                progress={Math.min(100, stats.activeReports * 4)}
                color="bg-red-500"
              />
            </div>

            <div className="mt-10 p-5 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20">
              <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-2">Status</p>
              <p className="text-sm text-indigo-50/80 leading-relaxed">
                {stats.pendingVerifications > 10
                  ? `${stats.pendingVerifications} verifications and ${stats.activeReports} reports need attention.`
                  : stats.activeReports > 5
                  ? `${stats.activeReports} reports pending. Verifications are clear.`
                  : "Platform looks healthy. No urgent action needed."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-6 transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">{icon}</div>
      </div>
      <p className="text-white/40 text-xs font-medium uppercase tracking-wider">{label}</p>
      <h4 className="text-2xl font-bold mt-1 tracking-tight text-white">{value}</h4>
      <p className="text-xs text-white/30 mt-1">{sub}</p>
    </div>
  );
}

function HealthRow({ label, value, progress, color }: { label: string; value: number; progress: number; color: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-white/60">{label}</span>
        <span className="font-bold text-white">{value}</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
