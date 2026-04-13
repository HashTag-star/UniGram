"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Shield,
  Plus,
  Trash2,
  AlertTriangle,
  Ban,
  Info,
  Search,
} from "lucide-react";

interface KeywordFilter {
  id: string;
  keyword: string;
  severity: "block" | "flag" | "warn";
  created_at: string;
}

const SEVERITY_CONFIG = {
  block: { label: "Block", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: <Ban size={14} /> },
  flag:  { label: "Flag",  color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", icon: <AlertTriangle size={14} /> },
  warn:  { label: "Warn",  color: "text-blue-400",  bg: "bg-blue-500/10 border-blue-500/20",  icon: <Info size={14} /> },
};

export default function KeywordManagerPage() {
  const [keywords, setKeywords] = useState<KeywordFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [newKeyword, setNewKeyword] = useState("");
  const [newSeverity, setNewSeverity] = useState<"block" | "flag" | "warn">("flag");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchKeywords(); }, []);

  const fetchKeywords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("keyword_filters")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setKeywords(data || []);
    setLoading(false);
  };

  const addKeyword = async () => {
    const kw = newKeyword.trim().toLowerCase();
    if (!kw) return;
    setAdding(true);
    setError(null);
    const { data, error } = await supabase
      .from("keyword_filters")
      .insert({ keyword: kw, severity: newSeverity })
      .select()
      .single();
    if (error) {
      setError(error.message.includes("unique") ? `"${kw}" is already in the list.` : error.message);
    } else {
      setKeywords(prev => [data, ...prev]);
      setNewKeyword("");
    }
    setAdding(false);
  };

  const deleteKeyword = async (id: string, keyword: string) => {
    if (!confirm(`Remove "${keyword}" from the filter list?`)) return;
    const { error } = await supabase.from("keyword_filters").delete().eq("id", id);
    if (error) setError(error.message);
    else setKeywords(prev => prev.filter(k => k.id !== id));
  };

  const updateSeverity = async (id: string, severity: "block" | "flag" | "warn") => {
    const { error } = await supabase.from("keyword_filters").update({ severity }).eq("id", id);
    if (error) setError(error.message);
    else setKeywords(prev => prev.map(k => k.id === id ? { ...k, severity } : k));
  };

  const filtered = keywords.filter(k => {
    const matchesSearch = k.keyword.includes(search.toLowerCase());
    const matchesSeverity = severityFilter === "all" || k.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  const counts = {
    block: keywords.filter(k => k.severity === "block").length,
    flag:  keywords.filter(k => k.severity === "flag").length,
    warn:  keywords.filter(k => k.severity === "warn").length,
  };

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <Shield className="text-indigo-400" />
          Keyword Filter Manager
        </h1>
        <p className="text-white/50 mt-1">
          Define words and phrases that trigger automatic content actions. Applied to all new posts and captions in real time.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {(["block", "flag", "warn"] as const).map(s => {
          const cfg = SEVERITY_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => setSeverityFilter(prev => prev === s ? "all" : s)}
              className={`glass rounded-2xl p-5 text-left transition-all border ${severityFilter === s ? cfg.bg : "border-white/5 hover:bg-white/5"}`}
            >
              <p className={`text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5 ${cfg.color}`}>
                {cfg.icon} {cfg.label}
              </p>
              <p className="text-2xl font-bold text-white">{counts[s]}</p>
              <p className="text-xs text-white/30 mt-0.5">
                {s === "block" ? "Hard stop — post rejected" :
                 s === "flag"  ? "Auto-reported for review" :
                 "Warning shown to user"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Add keyword */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-widest">Add New Keyword</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addKeyword()}
            placeholder="Enter keyword or phrase..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50"
          />
          <select
            value={newSeverity}
            onChange={e => setNewSeverity(e.target.value as any)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
          >
            <option value="block" className="bg-[#0a0a0f]">Block — reject post</option>
            <option value="flag"  className="bg-[#0a0a0f]">Flag — auto-report</option>
            <option value="warn"  className="bg-[#0a0a0f]">Warn — show warning</option>
          </select>
          <button
            onClick={addKeyword}
            disabled={adding || !newKeyword.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold px-6 py-3 rounded-xl transition-colors"
          >
            {adding
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Plus size={16} />
            }
            Add
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </p>
        )}
      </div>

      {/* Filter & search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search keywords..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500/50"
          />
        </div>
        {severityFilter !== "all" && (
          <button
            onClick={() => setSeverityFilter("all")}
            className="text-xs text-white/50 hover:text-white px-4 border border-white/10 rounded-xl transition-colors"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Keyword list */}
      <div className="glass rounded-3xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Keyword</th>
              <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Severity</th>
              <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Added</th>
              <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <div className="flex justify-center">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-white/30 text-sm">
                  {keywords.length === 0 ? "No keywords added yet. Add your first one above." : "No keywords match your search."}
                </td>
              </tr>
            ) : (
              filtered.map(kw => {
                const cfg = SEVERITY_CONFIG[kw.severity];
                return (
                  <tr key={kw.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-white font-mono text-sm bg-white/5 px-2 py-0.5 rounded">{kw.keyword}</span>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={kw.severity}
                        onChange={e => updateSeverity(kw.id, e.target.value as any)}
                        className={`text-xs font-bold rounded-lg px-2 py-1 border focus:outline-none ${cfg.bg} ${cfg.color}`}
                      >
                        <option value="block" className="bg-[#0a0a0f] text-white">Block</option>
                        <option value="flag"  className="bg-[#0a0a0f] text-white">Flag</option>
                        <option value="warn"  className="bg-[#0a0a0f] text-white">Warn</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-white/40 text-sm">
                      {new Date(kw.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => deleteKeyword(kw.id, kw.keyword)}
                        className="text-white/30 hover:text-red-400 transition-colors p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
