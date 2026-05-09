"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  BrainCircuit,
  Send,
  Loader2,
  Sparkles,
  Search,
  Flag,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  ChevronRight,
  ShieldAlert,
  Users,
  Megaphone,
} from "lucide-react";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentAction {
  name: string;
  args: any;
  status: 'pending' | 'approved' | 'declined' | 'executed';
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "Hello! I'm your UniGram Admin Agent. I can help you manage users, reports, and content. You can give me commands like 'Ban @user' or ask me for a platform health check." 
    }
  ]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<AgentAction[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, proposals]);

  const handleSend = async (customQuery?: string) => {
    const text = customQuery || query.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    if (!customQuery) {
      setMessages(newMessages);
      setQuery("");
    }
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-ai-chat', {
        body: { messages: newMessages }
      });

      if (error) throw error;

      if (data.answer) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
      }

      if (data.actions) {
        // If the backend executed them, mark as executed
        setProposals(prev => [
          ...prev, 
          ...data.actions.map((a: any) => ({ ...a, status: 'executed' }))
        ]);
      }

      if (data.proposals) {
        // Suggested actions for admin to approve
        setProposals(prev => [
          ...prev, 
          ...data.proposals.map((p: any) => ({ ...p, status: 'pending' }))
        ]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message || 'Failed to communicate with agent.'}` }]);
    } finally {
      setLoading(false);
    }
  };

  const executeProposal = async (index: number) => {
    const p = proposals[index];
    setLoading(true);
    try {
      // We simulate execution by calling the agent with a specific "Approve" message
      await handleSend(`APPROVED: Execute ${p.name} with ${JSON.stringify(p.args)}`);
      setProposals(prev => prev.map((item, i) => i === index ? { ...item, status: 'executed' } : item));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 h-[calc(100vh-2rem)] flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Sparkles className="text-indigo-400" />
            AI Agent
          </h1>
          <p className="text-white/50 mt-1">Autonomous platform orchestration and moderation partner.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleSend("Perform a platform health check and look for issues.")}
            disabled={loading}
            className="glass-button flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/10"
          >
            <Search size={14} className="text-indigo-400" />
            Scan Issues
          </button>
          <button 
            onClick={() => handleSend("Summarize recent reports and suggest moderation actions.")}
            disabled={loading}
            className="glass-button flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/10"
          >
            <Flag size={14} className="text-red-400" />
            Mod Suggestions
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Chat Interface */}
        <div className="flex-1 glass rounded-[2.5rem] overflow-hidden flex flex-col border border-white/5 shadow-2xl">
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`
                  max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed
                  ${msg.role === 'user' 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                    : 'bg-white/5 text-white/80 border border-white/5'}
                `}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center">
                        <BrainCircuit size={12} className="text-indigo-400" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Agent</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
                  <Loader2 size={16} className="animate-spin text-indigo-400" />
                  <span className="text-xs text-white/40 font-medium">Agent is thinking...</span>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          <div className="p-6 bg-black/20 border-t border-white/5">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-2 focus-within:border-indigo-500/40 transition-all"
            >
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Give a command or ask a question..."
                className="flex-1 bg-transparent border-none focus:outline-none px-4 py-2 text-sm text-white placeholder:text-white/20"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-all shrink-0"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* Proposals Side Panel */}
        <div className="w-80 flex flex-col gap-6">
          <div className="glass rounded-[2rem] p-6 flex-1 flex flex-col border border-white/5 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap size={16} className="text-yellow-400" />
                Agent Proposals
              </h3>
              <span className="text-[10px] bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full font-bold">
                {proposals.filter(p => p.status === 'pending').length} New
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {proposals.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/10">
                  <MessageSquare size={32} className="mb-3 opacity-20" />
                  <p className="text-xs font-medium">No active proposals. Run a scan to find opportunities.</p>
                </div>
              ) : (
                proposals.slice().reverse().map((p, i) => (
                  <div key={i} className={`
                    p-4 rounded-2xl border transition-all
                    ${p.status === 'pending' 
                      ? 'bg-white/5 border-white/10' 
                      : 'bg-green-500/5 border-green-500/20 opacity-60'}
                  `}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {p.status === 'executed' ? (
                          <CheckCircle2 size={14} className="text-green-400" />
                        ) : (
                          <Clock size={14} className="text-yellow-400" />
                        )}
                        <span className="text-xs font-bold text-white capitalize">
                          {p.name.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-1 mb-4">
                      {Object.entries(p.args).map(([key, val]) => (
                        <div key={key} className="flex justify-between text-[10px]">
                          <span className="text-white/30 uppercase">{key}:</span>
                          <span className="text-white/60 font-mono truncate max-w-[100px]">{String(val)}</span>
                        </div>
                      ))}
                    </div>

                    {p.status === 'pending' && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => executeProposal(proposals.length - 1 - i)}
                          disabled={loading}
                          className="flex-1 bg-white text-black text-[10px] font-bold py-2 rounded-lg hover:scale-105 active:scale-95 transition-all"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => {
                            setProposals(prev => prev.map((item, idx) => 
                              idx === (proposals.length - 1 - i) ? { ...item, status: 'declined' } : item
                            ));
                          }}
                          className="px-2 bg-white/5 text-white/40 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-all"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Stats / Context */}
          <div className="glass rounded-[2rem] p-6 border border-white/5 bg-gradient-to-br from-indigo-600/10 to-transparent">
            <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-4">Agent Capabilities</h4>
            <div className="space-y-3">
              <CapabilityItem icon={<ShieldAlert size={14} />} text="Autonomous Moderation" />
              <CapabilityItem icon={<Users size={14} />} text="User Verifications" />
              <CapabilityItem icon={<Megaphone size={14} />} text="Global Announcements" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CapabilityItem({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-white/50">
      <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-white/30">{icon}</div>
      {text}
    </div>
  );
}