"use client";
import React, { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Settings, User, Mail, Shield, Save, Loader2, CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    id: "",
    email: "",
    full_name: "",
    username: "",
    is_admin: false,
  });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, is_admin')
      .eq('id', session.user.id)
      .single();

    if (error) {
      setError(error.message);
    } else {
      setProfile({
        id: data.id,
        email: session.user.email || "",
        full_name: data.full_name || "",
        username: data.username || "",
        is_admin: data.is_admin,
      });
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: profile.full_name })
      .eq('id', profile.id);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <Settings className="text-white/40" /> Settings
        </h1>
        <p className="text-white/50 mt-1">Manage your administrator account and preferences.</p>
      </div>

      <div className="glass rounded-[2rem] overflow-hidden border border-white/5">
        <div className="bg-white/5 px-8 py-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <User size={18} className="text-indigo-400" />
            Account Information
          </h2>
        </div>

        <form onSubmit={handleSave} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-500 p-4 rounded-xl text-sm font-medium flex items-center gap-2">
              <CheckCircle2 size={16} />
              Profile updated successfully.
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                <input 
                  type="email" 
                  disabled
                  value={profile.email}
                  className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-white/40 cursor-not-allowed text-sm"
                />
              </div>
              <p className="text-[10px] text-white/20 pl-1">Login email cannot be changed from the dashboard.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Username</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 text-sm font-bold">@</span>
                <input 
                  type="text" 
                  disabled
                  value={profile.username}
                  className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-10 pr-4 text-white/40 cursor-not-allowed text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Full Name</label>
              <input 
                type="text" 
                value={profile.full_name}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                placeholder="Admin Name"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500/50 transition-colors text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Role</label>
              <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl py-3 px-4">
                <Shield size={16} className="text-indigo-400" />
                <span className="text-sm font-bold text-indigo-400">Administrator</span>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button 
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-indigo-600/20"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {saving ? "Saving Changes..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      <div className="p-6 rounded-[2rem] bg-red-500/5 border border-red-500/10 space-y-4">
        <h3 className="text-sm font-bold text-red-400 uppercase tracking-widest">Danger Zone</h3>
        <p className="text-xs text-white/40">These actions are irreversible. Please proceed with extreme caution.</p>
        <button 
          className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 py-3 px-6 rounded-2xl text-xs font-bold transition-all"
          onClick={() => alert("This functionality is managed via Supabase Auth console.")}
        >
          Request Account Deletion
        </button>
      </div>
    </div>
  );
}
