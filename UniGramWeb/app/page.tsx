import { 
  ShieldCheck, 
  Users, 
  AlertTriangle, 
  TrendingUp, 
  BrainCircuit,
} from "lucide-react";

export default function Home() {
  return (
    <div className="p-8 space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Users" value="12,482" change="+12%" icon={<Users className="text-blue-400" />} />
        <StatCard label="Pending Verifications" value="142" change="-5%" icon={<ShieldCheck className="text-green-400" />} />
        <StatCard label="Active Reports" value="28" change="+2%" icon={<AlertTriangle className="text-red-400" />} />
        <StatCard label="Live Sessions" value="15" change="+82%" icon={<TrendingUp className="text-purple-400" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* AI Assistant Column */}
        <div className="lg:col-span-2 space-y-8">
          <div className="glass rounded-3xl p-8 overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
            
            <div className="relative">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <BrainCircuit className="text-indigo-400" />
                How can I help you today?
              </h2>
              <p className="text-white/50 mt-2 max-w-lg">
                I am your UniGram AI Assistant. I can help you verify documents, moderate content, or analyze platform health.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <ActionButton label="Scan for Suspicious Activity" />
                <ActionButton label="Verify Top 5 Students" />
                <ActionButton label="Review Flagged Content" />
              </div>

              <div className="mt-8 bg-black/40 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                <input 
                  type="text" 
                  placeholder="e.g. 'Show me a summary of last week's verification requests'" 
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm text-white"
                />
                <button className="bg-white text-black px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors">
                  Ask AI
                </button>
              </div>
            </div>
          </div>

          {/* Recent Activity Table Preview */}
          <div className="glass rounded-3xl p-8">
            <h3 className="text-lg font-bold mb-6">Recent Verifications</h3>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between p-4 rounded-2xl hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500" />
                    <div>
                      <p className="font-bold text-sm">@john_doe_{i}</p>
                      <p className="text-xs text-white/40">Stanford University · Verified Student</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Minutes ago</p>
                    <span className="text-xs text-indigo-400 font-bold">Pending AI Scan</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Platform Health Sidebar */}
        <div className="space-y-8">
           <div className="glass rounded-3xl p-8 h-full">
              <h3 className="text-lg font-bold mb-6">Platform Health</h3>
              <div className="space-y-6">
                <HealthRow label="Server Load" progress={34} color="bg-indigo-500" />
                <HealthRow label="API Latency" progress={12} color="bg-green-500" />
                <HealthRow label="Media Uploads" progress={78} color="bg-purple-500" />
                <HealthRow label="Report Rate" progress={5} color="bg-red-500" />
              </div>

              <div className="mt-12 p-6 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20">
                <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-2">AI Alert</p>
                <p className="text-sm text-indigo-50/80 leading-relaxed">
                  "Unusual spike in verification requests from MIT detected. Verifying IP patterns for potential bots."
                </p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, change, icon }: { label: string, value: string, change: string, icon: React.ReactNode }) {
  const isUp = change.startsWith('+');
  return (
    <div className="glass rounded-3xl p-6 glass-hover transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">
          {icon}
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isUp ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {change}
        </span>
      </div>
      <p className="text-white/40 text-xs font-medium uppercase tracking-wider">{label}</p>
      <h4 className="text-2xl font-bold mt-1 tracking-tight">{value}</h4>
    </div>
  );
}

function HealthRow({ label, progress, color }: { label: string, progress: number, color: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-white/60">{label}</span>
        <span className="font-bold">{progress}%</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function ActionButton({ label }: { label: string }) {
  return (
    <button className="bg-white/5 border border-white/10 hover:border-white/20 px-4 py-2 rounded-xl text-xs font-bold transition-all text-white/70 hover:text-white">
      {label}
    </button>
  );
}
