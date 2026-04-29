"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  UserMinus,
  CheckCircle2,
  ExternalLink,
  Search,
  Filter,
  X,
  Image,
  MessageSquare,
  User,
  ShoppingBag,
  Loader2,
} from "lucide-react";

interface AdminReport {
  id: string;
  reporter_id: string;
  target_id: string;
  target_type: "post" | "reel" | "member" | "comment" | "market_item";
  reason: string;
  details: string;
  status: "pending" | "resolved" | "dismissed";
  created_at: string;
  reporter?: { username: string; avatar_url: string };
}

interface ContentModal {
  report: AdminReport;
  content: any;
  loading: boolean;
  error: string | null;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState<ContentModal | null>(null);
  const [banning, setBanning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reports")
        .select(`*, reporter:profiles!reports_reporter_id_fkey(username, avatar_url)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const processed = (data || []).map((r) => ({
        ...r,
        reporter: Array.isArray(r.reporter) ? r.reporter[0] : r.reporter,
      })) as AdminReport[];
      setReports(processed);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: "resolved" | "dismissed") => {
    const { error } = await supabase.from("reports").update({ status }).eq("id", id);
    if (!error) setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const viewContent = async (report: AdminReport) => {
    setModal({ report, content: null, loading: true, error: null });
    try {
      let content: any = null;
      if (report.target_type === "post" || report.target_type === "reel") {
        const { data } = await supabase
          .from("posts")
          .select("*, author:profiles!posts_author_id_fkey(id, username, avatar_url)")
          .eq("id", report.target_id)
          .single();
        content = data;
      } else if (report.target_type === "comment") {
        const { data } = await supabase
          .from("comments")
          .select("*, author:profiles!comments_author_id_fkey(id, username, avatar_url)")
          .eq("id", report.target_id)
          .single();
        content = data;
      } else if (report.target_type === "member") {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, university, is_verified, is_banned, created_at")
          .eq("id", report.target_id)
          .single();
        content = data;
      } else if (report.target_type === "market_item") {
        const { data } = await supabase
          .from("market_items")
          .select("*, seller:profiles!market_items_seller_id_fkey(id, username)")
          .eq("id", report.target_id)
          .single();
        content = data;
      }
      setModal((m) => m ? { ...m, content, loading: false } : null);
    } catch (err: any) {
      setModal((m) => m ? { ...m, loading: false, error: err.message } : null);
    }
  };

  const banUser = async (userId: string, username?: string) => {
    if (!confirm(`Ban user${username ? ` @${username}` : ""}? They will lose access to the platform.`)) return;
    setBanning(userId);
    const { error } = await supabase.from("profiles").update({ is_banned: true }).eq("id", userId);
    setBanning(null);
    if (error) {
      setToast(`Error: ${error.message}`);
    } else {
      setToast(`User ${username ? `@${username}` : ""} banned.`);
      setModal(null);
    }
  };

  const banFromReport = async (report: AdminReport) => {
    if (report.target_type === "member") {
      await banUser(report.target_id);
      return;
    }
    // For content types, open modal first so admin can see who the author is
    await viewContent(report);
  };

  const filteredReports = reports.filter((r) => {
    const matchesSearch =
      r.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reporter?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.target_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === "all" || r.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-8 space-y-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-white text-black text-sm font-bold px-5 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <AlertTriangle className="text-red-400" />
            Safety Reports
          </h1>
          <p className="text-white/50 mt-1">Manage user reports and moderate community content.</p>
        </div>
        <button onClick={fetchReports} className="glass px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors text-white">
          Refresh List
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by reason, user, or type..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500/50 text-white"
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

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-4 text-white/30">
            <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Scanning safety reports...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="py-20 text-center glass rounded-3xl text-white/30">No safety reports found.</div>
        ) : (
          filteredReports.map((report) => (
            <div
              key={report.id}
              className="glass rounded-2xl p-6 hover:bg-white/[0.04] transition-all group border border-white/5 hover:border-white/10 relative overflow-hidden"
            >
              {report.status === "pending" && (
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
              )}
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${getTargetColor(report.target_type)}`}>
                      {report.target_type}
                    </span>
                    <span className="text-white/20 text-xs">•</span>
                    <span className="text-xs text-white/50 font-medium">
                      Reported by @{report.reporter?.username || "unknown"}
                    </span>
                    <span className="text-white/20 text-xs">•</span>
                    <span className="text-[10px] text-white/30 font-bold uppercase tracking-tighter">
                      {new Date(report.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{report.reason}</h3>
                    {report.details && (
                      <p className="text-sm text-white/50 mt-1 italic">"{report.details}"</p>
                    )}
                  </div>
                  <button
                    onClick={() => viewContent(report)}
                    className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5 hover:text-indigo-300 transition-colors"
                  >
                    <ExternalLink size={12} /> View Reported Content
                  </button>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center">
                  {report.status === "pending" ? (
                    <>
                      <button
                        onClick={() => updateStatus(report.id, "resolved")}
                        className="flex items-center gap-2 bg-green-500/10 text-green-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-500 hover:text-white transition-all whitespace-nowrap"
                      >
                        <CheckCircle2 size={14} /> Mark Resolved
                      </button>
                      <button
                        onClick={() => updateStatus(report.id, "dismissed")}
                        className="flex items-center gap-2 bg-white/5 text-white/40 px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/10 hover:text-white transition-all whitespace-nowrap"
                      >
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <div className="text-white/30 text-xs font-bold uppercase tracking-widest italic py-2">
                      {report.status}
                    </div>
                  )}
                  <div className="h-8 w-[1px] bg-white/10 mx-2" />
                  <button
                    onClick={() => banFromReport(report)}
                    disabled={banning === report.target_id}
                    className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                    title={report.target_type === "member" ? "Ban User" : "View content to ban author"}
                  >
                    {banning === report.target_id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <UserMinus size={18} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Content Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div
            className="glass rounded-3xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-8 space-y-6 border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {getTypeIcon(modal.report.target_type)}
                Reported {modal.report.target_type}
              </h2>
              <button onClick={() => setModal(null)} className="text-white/30 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {modal.loading ? (
              <div className="py-12 flex justify-center">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : modal.error ? (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                {modal.error}
              </div>
            ) : modal.content ? (
              <ContentDisplay report={modal.report} content={modal.content} onBan={banUser} banning={banning} />
            ) : (
              <p className="text-white/40 text-sm">Content not found or may have been deleted.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContentDisplay({ report, content, onBan, banning }: {
  report: AdminReport;
  content: any;
  onBan: (userId: string, username?: string) => void;
  banning: string | null;
}) {
  if (report.target_type === "member") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl">
          {content.avatar_url ? (
            <img src={content.avatar_url} className="w-14 h-14 rounded-2xl object-cover" alt={content.username} />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-500/20 to-purple-500/20 flex items-center justify-center">
              <User size={24} className="text-white/30" />
            </div>
          )}
          <div>
            <p className="font-bold text-white">{content.full_name || `@${content.username}`}</p>
            <p className="text-sm text-white/40">@{content.username}</p>
            <p className="text-xs text-white/30">{content.university}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {content.is_banned ? (
            <span className="text-sm text-red-400 font-bold">Already banned</span>
          ) : (
            <button
              onClick={() => onBan(content.id, content.username)}
              disabled={banning === content.id}
              className="flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-red-500 hover:text-white hover:border-red-500 transition-all disabled:opacity-50"
            >
              {banning === content.id ? <Loader2 size={14} className="animate-spin" /> : <UserMinus size={14} />}
              Ban This User
            </button>
          )}
        </div>
      </div>
    );
  }

  const author = content.author;
  const authorId = author?.id ?? content.author_id ?? content.seller_id;

  return (
    <div className="space-y-4">
      {author && (
        <div className="flex items-center gap-3 text-sm text-white/60">
          <span className="font-bold text-white/80">@{author.username}</span>
          <span className="text-white/20">·</span>
          <span>Author</span>
        </div>
      )}
      {content.caption || content.body || content.content || content.description ? (
        <div className="p-4 bg-white/5 rounded-2xl">
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
            {content.caption || content.body || content.content || content.description}
          </p>
        </div>
      ) : (
        <p className="text-white/30 text-sm italic">No text content</p>
      )}
      {content.media_url && (
        <img src={content.media_url} alt="Reported media" className="w-full rounded-2xl object-cover max-h-64" />
      )}
      {authorId && (
        <button
          onClick={() => onBan(authorId, author?.username)}
          disabled={banning === authorId}
          className="flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-red-500 hover:text-white hover:border-red-500 transition-all disabled:opacity-50"
        >
          {banning === authorId ? <Loader2 size={14} className="animate-spin" /> : <UserMinus size={14} />}
          Ban Author
        </button>
      )}
    </div>
  );
}

function getTypeIcon(type: AdminReport["target_type"]) {
  switch (type) {
    case "post": return <Image size={18} className="text-blue-400" />;
    case "reel": return <Image size={18} className="text-purple-400" />;
    case "comment": return <MessageSquare size={18} className="text-yellow-400" />;
    case "member": return <User size={18} className="text-red-400" />;
    case "market_item": return <ShoppingBag size={18} className="text-green-400" />;
  }
}

function getTargetColor(type: AdminReport["target_type"]) {
  switch (type) {
    case "post": return "bg-blue-500/10 text-blue-400";
    case "reel": return "bg-purple-500/10 text-purple-400";
    case "comment": return "bg-yellow-500/10 text-yellow-400";
    case "member": return "bg-red-500/10 text-red-400";
    case "market_item": return "bg-green-500/10 text-green-400";
    default: return "bg-white/10 text-white/50";
  }
}
