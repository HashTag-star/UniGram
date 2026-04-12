"use client";
import React, { useState, useEffect, useRef } from "react";
import { 
  BrainCircuit, 
  Terminal, 
  Play, 
  ShieldAlert, 
  Zap, 
  Search,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Lock
} from "lucide-react";

export default function AIRegulatorPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'warn' | 'success' | 'ai'}[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [showKeyField, setShowKeyField] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const addLog = (msg: string, type: 'info' | 'warn' | 'success' | 'ai' = 'info') => {
    setLogs(prev => [...prev, { msg, type }]);
  };

  const startScan = () => {
    if (!apiKey && !process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      addLog("Waiting for Gemini API Key configuration...", 'warn');
      setShowKeyField(true);
      return;
    }

    setIsScanning(true);
    setLogs([]);
    addLog("Initializing UniGram Safety Engine v1.0...", 'info');
    
    setTimeout(() => addLog("Connecting to Gemini 3.1 Pro... (Simulated)", 'ai'), 800);
    setTimeout(() => addLog("Syncing with Supabase Feed...", 'info'), 1500);
    setTimeout(() => addLog("Scanning 142 pending verifications...", 'info'), 2200);
    setTimeout(() => addLog("AI Analysis: Found 3 suspicious ID document patterns in Stanford requests.", 'ai'), 3500);
    setTimeout(() => addLog("Sentiment Check: Normal engagement levels across 4 universities.", 'success'), 4800);
    setTimeout(() => {
      addLog("Scan Complete. 3 items flagged for review.", 'success');
      setIsScanning(false);
    }, 5500);
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <BrainCircuit className="text-purple-400" />
            AI Regulator
          </h1>
          <p className="text-white/50 mt-1">Autonomous platform moderation and identity verification.</p>
        </div>

        <div className="flex items-center gap-3">
           {showKeyField ? (
             <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1">
               <Lock size={14} className="text-white/30" />
               <input 
                 type="password" 
                 value={apiKey}
                 onChange={(e) => setApiKey(e.target.value)}
                 placeholder="Enter Gemini API Key..." 
                 className="bg-transparent text-xs text-white focus:outline-none w-48"
               />
               <button 
                 onClick={() => setShowKeyField(false)}
                 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest px-2"
               >
                 Save
               </button>
             </div>
           ) : (
             <button 
               onClick={() => setShowKeyField(true)}
               className="glass px-4 py-2 rounded-xl text-xs font-medium hover:bg-white/10 transition-colors text-white/50"
             >
               Configure API Key
             </button>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Terminal / Monitor */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass rounded-[2rem] border-white/10 overflow-hidden flex flex-col h-[500px]">
             <div className="bg-white/5 px-6 py-4 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-2">
                   <Terminal size={16} className="text-white/30" />
                   <span className="text-xs font-bold uppercase tracking-widest text-white/50">Safety Monitor Log</span>
                </div>
                <div className="flex gap-1.5">
                   <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
                   <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                   <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50" />
                </div>
             </div>

             <div className="flex-1 overflow-y-auto p-6 font-mono text-sm space-y-2.5 custom-scrollbar">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-white/10 text-center space-y-4">
                     <Cpu size={48} className="animate-pulse" />
                     <p className="max-w-xs uppercase tracking-widest text-[10px] font-bold">Systems Idle. Waiting for trigger...</p>
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={`flex gap-3 ${
                      log.type === 'ai' ? 'text-purple-300' : 
                      log.type === 'warn' ? 'text-yellow-400' : 
                      log.type === 'success' ? 'text-green-400' : 'text-white/70'
                    }`}>
                      <span className="text-white/20 select-none">[{new Date().toLocaleTimeString([], {hour12: false})}]</span>
                      <span className="flex-1">
                        {log.type === 'ai' && <span className="mr-2">✨</span>}
                        {log.msg}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
             </div>

             <div className="p-6 bg-black/40 border-t border-white/5 flex items-center gap-4">
               <button 
                 onClick={startScan}
                 disabled={isScanning}
                 className={`
                   flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-xl
                   ${isScanning ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-white text-black hover:scale-105 active:scale-95'}
                 `}
               >
                 {isScanning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Processing Platform Data...
                    </>
                 ) : (
                    <>
                      <Play size={18} fill="currentColor" />
                      Run Autonomous Regulation Scan
                    </>
                 )}
               </button>
               <p className="text-[10px] text-white/20 max-w-xs">
                 * AI will scan pending verifications, reports, and recent feed activity for violations.
               </p>
             </div>
          </div>
        </div>

        {/* AI Commands & Quick Insights */}
        <div className="space-y-6">
           <div className="glass rounded-[2rem] p-8 space-y-6">
              <h3 className="text-lg font-bold text-white mb-2">Capabilities</h3>
              
              <CapabilityRow 
                icon={<ShieldAlert className="text-red-400" />} 
                label="Anomaly Detection" 
                desc="Identify bot farms or coordinated spam patterns."
              />
              <CapabilityRow 
                icon={<Search className="text-blue-400" />} 
                label="Doc Validation" 
                desc="Scan IDs for Photoshop or expired dates."
              />
              <CapabilityRow 
                icon={<Zap className="text-yellow-400" />} 
                label="Fast Moderation" 
                desc="Auto-hide toxic posts with 98% accuracy."
              />

              <div className="pt-6 border-t border-white/5">
                 <div className="p-6 rounded-2xl bg-indigo-600/10 border border-indigo-500/20">
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                       <Zap size={14} /> AI Recommendation
                    </p>
                    <p className="text-sm text-white/70 leading-relaxed mb-4">
                      "3 verification requests from 'Accra Technical Univ' contain near-identical document textures. Potential mass-faking."
                    </p>
                    <button className="text-[10px] font-bold text-white bg-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors uppercase tracking-widest">
                       Verify Suspicion
                    </button>
                 </div>
              </div>
           </div>

           <div className="glass rounded-[3rem] p-8 flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-bold uppercase tracking-widest">Safety Mode</p>
                <p className="text-lg font-bold text-white">Aggressive</p>
              </div>
              <div className="w-12 h-6 bg-indigo-600 rounded-full relative p-1">
                 <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function CapabilityRow({ icon, label, desc }: { icon: React.ReactNode, label: string, desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="mt-1">{icon}</div>
      <div>
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="text-xs text-white/40 leading-relaxed mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
