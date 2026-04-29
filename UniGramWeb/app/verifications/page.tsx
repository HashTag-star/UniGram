"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  BrainCircuit,
  Search,
  Filter,
  AlertTriangle,
  Zap
} from "lucide-react";

interface VerificationRequest {
  id: string;
  user_id: string;
  type: string;
  full_name: string;
  email: string;
  university: string;
  reason: string;
  document_urls: string[];
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  sheerid_verified: boolean;
}

export default function VerificationsPage() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [aiScanning, setAiScanning] = useState(false);
  const [aiFindings, setAiFindings] = useState<{id: string; target_id: string; action: string; severity: string; reason: string}[]>([]);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from('verification_requests')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error: any) {
      console.error("Error fetching verifications:", error);
      setErrorMessage(error.message || "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('verification_requests')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      
      // Update local state
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      
      // If approved, we might also want to update the profile's is_verified flag
      if (status === 'approved') {
        const request = requests.find(r => r.id === id);
        if (request) {
           await supabase.from('profiles').update({ 
             is_verified: true,
             university: request.university // Ensure university is synced
           }).eq('id', request.user_id);
        }
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const runAiScan = async () => {
    setAiScanning(true);
    setAiFindings([]);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-regulation-scan', {
        body: {},
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const verificationFindings = (data.findings || []).filter((f: any) => f.target_type === 'verification');
      setAiFindings(verificationFindings);
    } catch (err: any) {
      setErrorMessage(`AI Scan failed: ${err.message}`);
    } finally {
      setAiScanning(false);
    }
  };

  const filteredRequests = requests.filter(r => {
    const fullName = r.full_name || "";
    const university = r.university || "";
    const matchesSearch = fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          university.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === "all" || r.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <ShieldCheck className="text-indigo-400" />
            Verification Requests
          </h1>
          <p className="text-white/50 mt-1">Review and validate student identity documents.</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={fetchRequests}
            className="glass px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Refresh List
          </button>
          <button
            onClick={runAiScan}
            disabled={aiScanning}
            className="bg-indigo-600 px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {aiScanning
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <BrainCircuit size={16} />
            }
            {aiScanning ? "Scanning..." : "Bulk AI Scan"}
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
            placeholder="Search by name or university..." 
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
            <option value="all" className="bg-[#0a0a0f]">All Statuses</option>
            <option value="pending" className="bg-[#0a0a0f]">Pending</option>
            <option value="approved" className="bg-[#0a0a0f]">Approved</option>
            <option value="rejected" className="bg-[#0a0a0f]">Rejected</option>
          </select>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl flex items-center gap-3">
          <AlertTriangle size={20} />
          <p className="text-sm font-medium">{errorMessage}</p>
        </div>
      )}

      {/* AI Scan Findings */}
      {aiFindings.length > 0 && (
        <div className="glass rounded-2xl p-6 border border-indigo-500/20 space-y-3">
          <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
            <Zap size={14} /> AI Scan Results — {aiFindings.length} verification(s) flagged
          </p>
          {aiFindings.map((f, i) => {
            const severity = f.severity;
            const color = severity === 'critical' || severity === 'high' ? 'text-red-400 bg-red-500/10 border-red-500/20'
              : severity === 'medium' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
              : 'text-blue-400 bg-blue-500/10 border-blue-500/20';
            return (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${color}`}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold uppercase text-xs tracking-wide">{severity}</span>
                  {' — '}<span className="opacity-80">{f.reason}</span>
                  <span className="text-xs opacity-50 block mt-0.5">Suggested action: {f.action} · ID: {f.target_id?.slice(0, 8)}…</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table/List */}
      <div className="glass rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">User</th>
                <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Institution</th>
                <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Type</th>
                <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Documents</th>
                <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-white/30">
                    <div className="flex flex-col items-center gap-2">
                       <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                       <span className="text-sm">Loading applications...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-white/30">
                    No requests found matching your search.
                  </td>
                </tr>
              ) : filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-white">{req.full_name}</p>
                        {req.sheerid_verified && (
                          <span title="SheerID Verified" className="bg-green-500/10 text-green-400 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 border border-green-500/20">
                            <ShieldCheck size={10} />
                            SheerID Cleared
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/40">{req.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-white/70">{req.university}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded-md">
                      {req.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {req.document_urls?.map((url, idx) => (
                        <a 
                          key={idx} 
                          href={url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors text-white/50 hover:text-white border border-white/10"
                        >
                          <ExternalLink size={14} />
                        </a>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => updateStatus(req.id, 'approved')}
                        className="w-8 h-8 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center hover:bg-green-500 hover:text-white transition-all"
                        title="Approve"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                      <button 
                         onClick={() => updateStatus(req.id, 'rejected')}
                         className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                         title="Reject"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: VerificationRequest['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <span className="flex items-center gap-1.5 text-xs text-yellow-400 font-medium">
          <Clock size={12} /> Pending
        </span>
      );
    case 'approved':
      return (
        <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
          <CheckCircle2 size={12} /> Approved
        </span>
      );
    case 'rejected':
      return (
        <span className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
          <XCircle size={12} /> Rejected
        </span>
      );
  }
}
