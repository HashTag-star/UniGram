"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  AlertTriangle, 
  Trash2, 
  UserMinus, 
  CheckCircle2, 
  Clock,
  ExternalLink,
  Search,
  Filter,
  MessageSquare
} from "lucide-react";

interface AdminReport {
  id: string;
  reporter_id: string;
  target_id: string;
  target_type: 'post' | 'reel' | 'member' | 'comment' | 'market_item';
  reason: string;
  details: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  reporter?: {
    username: string;
    avatar_url: string;
  };
}

export default function ReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          reporter:profiles!reports_reporter_id_fkey(username, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Post-process to handle join results
      const processed = (data || []).map(r => ({
        ...r,
        reporter: Array.isArray(r.reporter) ? r.reporter[0] : r.reporter
      })) as AdminReport[];

      setReports(processed);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: 'resolved' | 'dismissed') => {
    try {
      const { error } = await supabase
        .from('reports')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (error) {
      console.error("Error updating report status:", error);
    }
  };

  const filteredReports = reports.filter(r => {
    const matchesSearch = r.reason.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.reporter?.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.target_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === "all" || r.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <AlertTriangle className="text-red-400" />
            Safety Reports
          </h1>
          <p className="text-white/50 mt-1">Manage user reports and moderate community content.</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={fetchReports}
            className="glass px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors text-white"
          >
            Refresh List
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by reason, user, or type..." 
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors text-white"
          />
        </div>
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 p-1">
          <Filter size={16} className="text-white/30" />
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-transparent text-sm text-white/70 focus:outline-none py-2"
          >
            <option value="all" className="bg-[#0a0a0f]">All Reports</option>
            <option value="pending" className="bg-[#0a0a0f]">Pending</option>
            <option value="resolved" className="bg-[#0a0a0f]">Resolved</option>
            <option value="dismissed" className="bg-[#0a0a0f]">Dismissed</option>
          </select>
        </div>
      </div>

      {/* Reports Feed */}
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-4 text-white/30">
             <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
             <p className="text-sm font-medium">Scanning safety reports...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="py-20 text-center glass rounded-3xl text-white/30">
            <p>No safety reports found.</p>
          </div>
        ) : filteredReports.map((report) => (
          <div key={report.id} className="glass rounded-2xl p-6 hover:bg-white/[0.04] transition-all group border border-white/5 hover:border-white/10 relative overflow-hidden">
            {report.status === 'pending' && (
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
            )}
            
            <div className="flex flex-col md:flex-row gap-6">
              {/* Report Details */}
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${getTargetColor(report.target_type)}`}>
                    {report.target_type}
                  </span>
                  <span className="text-white/20 text-xs">•</span>
                  <span className="text-xs text-white/50 font-medium">Reported by @{report.reporter?.username || 'unknown'}</span>
                  <span className="text-white/20 text-xs">•</span>
                  <span className="text-[10px] text-white/30 font-bold uppercase tracking-tighter">
                    {new Date(report.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {report.reason}
                  </h3>
                  {report.details && (
                    <p className="text-sm text-white/50 mt-1 italic">"{report.details}"</p>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5 hover:text-indigo-300 transition-colors">
                    <ExternalLink size={12} /> View Reported Content
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 self-end md:self-center">
                {report.status === 'pending' ? (
                  <>
                    <button 
                      onClick={() => updateStatus(report.id, 'resolved')}
                      className="flex items-center gap-2 bg-green-500/10 text-green-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-500 hover:text-white transition-all whitespace-nowrap"
                    >
                      <CheckCircle2 size={14} /> Mark Resolved
                    </button>
                    <button 
                       onClick={() => updateStatus(report.id, 'dismissed')}
                       className="flex items-center gap-2 bg-white/5 text-white/40 px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/10 hover:text-white transition-all whitespace-nowrap underline decoration-white/10 underline-offset-4"
                    >
                      Dismiss
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-white/30 text-xs font-bold uppercase tracking-widest italic py-2">
                    {report.status}
                  </div>
                )}
                
                {/* Moderate User Actions */}
                <div className="h-8 w-[1px] bg-white/10 mx-2" />
                <button className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all group/btn" title="Ban User">
                  <UserMinus size={18} className="group-hover/btn:scale-110 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getTargetColor(type: AdminReport['target_type']) {
  switch (type) {
    case 'post': return 'bg-blue-500/10 text-blue-400';
    case 'reel': return 'bg-purple-500/10 text-purple-400';
    case 'comment': return 'bg-yellow-500/10 text-yellow-400';
    case 'member': return 'bg-red-500/10 text-red-400';
    case 'market_item': return 'bg-green-500/10 text-green-400';
    default: return 'bg-white/10 text-white/50';
  }
}
