"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TrendingUp, Users, FileText, ShieldCheck, AlertTriangle, Activity } from "lucide-react";

interface DailyBucket { date: string; users: number; }

interface Stats {
  totalUsers: number; newUsers7d: number; newUsers30d: number;
  totalPosts: number; posts7d: number;
  totalReports: number; pendingReports: number;
  totalVerifications: number; approvedVerifications: number; pendingVerifications: number;
  onlineNow: number; activeToday: number;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [daily, setDaily] = useState<DailyBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const now = Date.now();
      const d7   = new Date(now - 7  * 86400000).toISOString();
      const d30  = new Date(now - 30 * 86400000).toISOString();
      const d1   = new Date(now -      86400000).toISOString();
      const d5m  = new Date(now -    5 * 60000).toISOString();

      const safe = (p: any) => p.then((r: any) => r.error ? { count: 0 } : r, () => ({ count: 0 }));

      const [
        { count: totalUsers },     { count: newUsers7d },       { count: newUsers30d },
        { count: totalPosts },     { count: posts7d },
        { count: totalReports },   { count: pendingReports },
        { count: totalVer },       { count: approvedVer },      { count: pendingVer },
        { count: onlineNow },      { count: activeToday },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", d7),
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", d30),
        safe(supabase.from("posts").select("*", { count: "exact", head: true })),
        safe(supabase.from("posts").select("*", { count: "exact", head: true }).gte("created_at", d7)),
        supabase.from("reports").select("*", { count: "exact", head: true }),
        supabase.from("reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("verification_requests").select("*", { count: "exact", head: true }),
        supabase.from("verification_requests").select("*", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("verification_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        safe(supabase.from("profiles").select("*", { count: "exact", head: true }).gte("last_seen", d5m)),
        safe(supabase.from("profiles").select("*", { count: "exact", head: true }).gte("last_seen", d1)),
      ]);

      setStats({
        totalUsers: totalUsers || 0, newUsers7d: newUsers7d || 0, newUsers30d: newUsers30d || 0,
        totalPosts: totalPosts || 0, posts7d: posts7d || 0,
        totalReports: totalReports || 0, pendingReports: pendingReports || 0,
        totalVerifications: totalVer || 0, approvedVerifications: approvedVer || 0, pendingVerifications: pendingVer || 0,
        onlineNow: onlineNow || 0, activeToday: activeToday || 0,
      });

      // 7-day signup sparkline
      const { data: signups } = await supabase.from("profiles").select("created_at").gte("created_at", d7).order("created_at");
      const buckets: Record<string, DailyBucket> = {};
      for (let i = 6; i >= 0; i--) {
        const key = new Date(now - i * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        buckets[key] = { date: key, users: 0 };
      }
      (signups || []).forEach((s) => {
        const key = new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        if (buckets[key]) buckets[key].users++;
      });
      setDaily(Object.values(buckets));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-96">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!stats) return null;

  const verRate = stats.totalVerifications > 0 ? Math.round((stats.approvedVerifications / stats.totalVerifications) * 100) : 0;
  const maxDU = Math.max(...daily.map((d) => d.users), 1);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <TrendingUp className="text-indigo-400" /> Analytics
          </h1>
          <p className="text-white/50 mt-1">Platform growth, activity, and health metrics.</p>
        </div>
        <button onClick={fetchAll} className="glass px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors text-white">
          Refresh
        </button>
      </div>

      {/* Live */}
      <div className="glass rounded-2xl p-6 border border-green-500/10">
        <p className="text-xs font-bold uppercase tracking-widest text-green-400 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" /> Live Activity
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <LiveStat label="Online right now" value={stats.onlineNow} color="text-green-400" />
          <LiveStat label="Active today" value={stats.activeToday} color="text-yellow-400" />
          <LiveStat label="New users (7d)" value={stats.newUsers7d} color="text-blue-400" />
          <LiveStat label="Posts (7d)" value={stats.posts7d} color="text-purple-400" />
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard icon={<Users className="text-blue-400" />} label="Total Users" value={stats.totalUsers} sub={`+${stats.newUsers30d} this month`} />
        <MetricCard icon={<FileText className="text-purple-400" />} label="Total Posts" value={stats.totalPosts} sub={`${stats.posts7d} this week`} />
        <MetricCard icon={<ShieldCheck className="text-green-400" />} label="Verifications" value={stats.totalVerifications} sub={`${verRate}% approved`} />
        <MetricCard icon={<AlertTriangle className="text-red-400" />} label="Reports" value={stats.totalReports} sub={`${stats.pendingReports} pending`} />
        <MetricCard icon={<Activity className="text-yellow-400" />} label="Pending Verif." value={stats.pendingVerifications} sub="awaiting review" />
      </div>

      {/* Signup chart */}
      <div className="glass rounded-3xl p-8">
        <h3 className="text-lg font-bold text-white mb-6">New User Signups — Last 7 Days</h3>
        <div className="flex items-end gap-3" style={{ height: 140 }}>
          {daily.map((d) => {
            const pct = Math.max(4, (d.users / maxDU) * 100);
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs text-white/40 font-bold">{d.users}</span>
                <div className="w-full relative rounded-t-lg" style={{ height: 100 }}>
                  <div className="absolute inset-0 bg-indigo-500/10 border border-indigo-500/20 rounded-t-lg" />
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-indigo-500 rounded-t-lg transition-all duration-700"
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-white/30 text-center leading-tight">{d.date}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Funnels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass rounded-3xl p-8 space-y-5">
          <h3 className="text-lg font-bold text-white">Verification Funnel</h3>
          <BarRow label="Total Submitted"  value={stats.totalVerifications} max={stats.totalVerifications} color="bg-indigo-500" />
          <BarRow label="Approved"         value={stats.approvedVerifications} max={stats.totalVerifications} color="bg-green-500" />
          <BarRow label="Pending Review"   value={stats.pendingVerifications} max={stats.totalVerifications} color="bg-yellow-500" />
          <BarRow label="Rejected"         value={Math.max(0, stats.totalVerifications - stats.approvedVerifications - stats.pendingVerifications)} max={stats.totalVerifications} color="bg-red-500" />
        </div>
        <div className="glass rounded-3xl p-8 space-y-5">
          <h3 className="text-lg font-bold text-white">Report Health</h3>
          <BarRow label="Total Reports"  value={stats.totalReports} max={stats.totalReports} color="bg-red-500" />
          <BarRow label="Pending Action" value={stats.pendingReports} max={stats.totalReports} color="bg-orange-500" />
          <BarRow label="Resolved"       value={Math.max(0, stats.totalReports - stats.pendingReports)} max={stats.totalReports} color="bg-green-500" />
          {stats.totalReports > 0 && (
            <p className="text-xs text-white/40 pt-2 border-t border-white/5">
              {Math.round(((stats.totalReports - stats.pendingReports) / stats.totalReports) * 100)}% of reports resolved
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <p className={`text-3xl font-bold ${color}`}>{value.toLocaleString()}</p>
      <p className="text-sm text-white/40 mt-1">{label}</p>
    </div>
  );
}

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub: string }) {
  return (
    <div className="glass rounded-2xl p-5 border border-white/5">
      <div className="mb-3">{icon}</div>
      <p className="text-xs text-white/40 uppercase tracking-widest font-bold">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value.toLocaleString()}</p>
      <p className="text-xs text-white/30 mt-1">{sub}</p>
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-white/60">{label}</span>
        <span className="font-bold text-white">{value}</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
