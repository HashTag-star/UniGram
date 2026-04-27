"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
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
  RefreshCw,
  TrendingUp
} from "lucide-react";

type LogType = 'info' | 'warn' | 'success' | 'ai' | 'error';
interface LogEntry { msg: string; type: LogType }

interface ScanStats {
  total_reports: number;
  high_severity_reports: number;
  total_verifications: number;
  suspicious_verifications: number;
}

export default function AIRegulatorPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastScanStats, setLastScanStats] = useState<ScanStats | null>(null);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<string[]>([]);
  const [aiRecommendation, setAiRecommendation] = useState<string>("");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (msg: string, type: LogType = 'info') => {
    setLogs(prev => [...prev, { msg, type }]);
  };

  const startScan = async () => {
    setIsScanning(true);
    setLogs([]);
    setAnomalies([]);
    setAiRecommendation("");
    addLog("Initializing UniGram Safety Engine...", 'info');

    try {
      addLog("Connecting to Gemini 2.0 Flash...", 'ai');
      addLog("Fetching pending reports and verifications from Supabase...", 'info');

      const { data, error } = await supabase.functions.invoke('ai-regulation-scan', {
        body: {},
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const { summary, findings = [], anomalies: detected = [], stats } = data;

      addLog("✓ Data retrieved. Running Gemini analysis...", 'ai');
      await delay(600);

      if (stats) {
        setLastScanStats(stats);
        addLog(`Scanned ${stats.total_reports} reports and ${stats.total_verifications} verification requests.`, 'info');
      }

      if (detected.length > 0) {
        setAnomalies(detected);
        detected.forEach((a: string) => addLog(`⚠ Anomaly: ${a}`, 'warn'));
      } else {
        addLog("No coordinated anomalies detected.", 'success');
      }

      await delay(400);

      // Process findings
      const highPriority = findings.filter((f: any) => ['critical', 'high'].includes(f.severity));
      const medium = findings.filter((f: any) => f.severity === 'medium');
      const low = findings.filter((f: any) => f.severity === 'low');

      if (highPriority.length > 0) {
        addLog(`🚨 ${highPriority.length} high-priority item(s) flagged for immediate review.`, 'warn');
        highPriority.slice(0, 3).forEach((f: any) => {
          addLog(`  → [${f.severity.toUpperCase()}] ${f.target_type}: ${f.reason}`, 'warn');
        });
      }
      if (medium.length > 0) addLog(`${medium.length} medium-priority item(s) flagged for review.`, 'info');
      if (low.length > 0) addLog(`${low.length} low-priority item(s) noted.`, 'info');

      if (summary) {
        setAiRecommendation(summary);
        addLog(`AI Summary: ${summary.slice(0, 120)}${summary.length > 120 ? '...' : ''}`, 'ai');
      }

      setLastScanAt(new Date().toLocaleTimeString());
      addLog(`Scan complete. ${findings.length} total item(s) assessed.`, 'success');

    } catch (err: any) {
      addLog(`Error: ${err.message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <BrainCircuit className="text-purple-400" />
            AI Regulator
          </h1>
          <p className="text-white/50 mt-1">
            Groq-powered autonomous moderation and identity verification screening.
            {lastScanAt && <span className="text-white/30 ml-2 text-xs">Last scan: {lastScanAt}</span>}
          </p>
        </div>
        <div className="glass px-4 py-2 rounded-xl text-xs font-medium text-green-400">
          ✓ Groq / llama-3.3-70b configured
        </div>
      </div>

      {/* Stats bar */}
      {lastScanStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Reports Scanned" value={lastScanStats.total_reports} color="text-blue-400" />
          <StatCard label="High Severity" value={lastScanStats.high_severity_reports} color="text-red-400" />
          <StatCard label="Verifications" value={lastScanStats.total_verifications} color="text-indigo-400" />
          <StatCard label="Suspicious" value={lastScanStats.suspicious_verifications} color="text-yellow-400" />
        </div>
      )}

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

            <div className="flex-1 overflow-y-auto p-6 font-mono text-sm space-y-2.5">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/10 text-center space-y-4">
                  <Cpu size={48} className="animate-pulse" />
                  <p className="max-w-xs uppercase tracking-widest text-[10px] font-bold">Systems Idle. Waiting for trigger...</p>
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`flex gap-3 ${
                    log.type === 'ai'      ? 'text-purple-300' :
                    log.type === 'warn'    ? 'text-yellow-400' :
                    log.type === 'success' ? 'text-green-400'  :
                    log.type === 'error'   ? 'text-red-400'    : 'text-white/70'
                  }`}>
                    <span className="text-white/20 select-none shrink-0">[{new Date().toLocaleTimeString([], {hour12: false})}]</span>
                    <span className="flex-1 break-words">
                      {log.type === 'ai' && <span className="mr-1">✨</span>}
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
                    Analyzing Platform Data...
                  </>
                ) : (
                  <>
                    <Play size={18} fill="currentColor" />
                    Run Autonomous Regulation Scan
                  </>
                )}
              </button>
              <p className="text-[10px] text-white/20 max-w-xs">
                Scans pending reports and verifications via Gemini 2.0 Flash. Results logged to ai_action_log.
              </p>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-6">
          <div className="glass rounded-[2rem] p-8 space-y-6">
            <h3 className="text-lg font-bold text-white mb-2">Capabilities</h3>
            <CapabilityRow icon={<ShieldAlert className="text-red-400" />} label="Anomaly Detection" desc="Identify bot farms or coordinated spam patterns." />
            <CapabilityRow icon={<Search className="text-blue-400" />} label="Doc Validation" desc="Flag suspicious or unverified ID documents." />
            <CapabilityRow icon={<Zap className="text-yellow-400" />} label="Fast Moderation" desc="Gemini 2.0 Flash — sub-2s per batch." />

            {/* AI Recommendation */}
            {aiRecommendation && (
              <div className="pt-6 border-t border-white/5">
                <div className="p-4 rounded-2xl bg-indigo-600/10 border border-indigo-500/20">
                  <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Zap size={14} /> AI Summary
                  </p>
                  <p className="text-sm text-white/70 leading-relaxed">{aiRecommendation}</p>
                </div>
              </div>
            )}

            {/* Anomalies */}
            {anomalies.length > 0 && (
              <div className="pt-4 border-t border-white/5 space-y-2">
                <p className="text-xs font-bold text-yellow-400 uppercase tracking-widest">Detected Anomalies</p>
                {anomalies.map((a, i) => (
                  <div key={i} className="flex gap-2 text-sm text-white/60">
                    <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs text-white/40 uppercase tracking-widest font-bold">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function CapabilityRow({ icon, label, desc }: { icon: React.ReactNode; label: string; desc: string }) {
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
