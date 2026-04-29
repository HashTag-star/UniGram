"use client";
import React, { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  Users,
  Search,
  MoreVertical,
  ShieldCheck,
  Ban,
  UserPlus,
  Mail,
  MapPin,
  X,
  Activity,
  Clock,
  Copy,
  Loader2,
} from "lucide-react";

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  university: string;
  is_verified: boolean;
  is_banned: boolean;
  is_admin: boolean;
  avatar_url: string;
  created_at: string;
  last_seen: string | null;
}

interface ProfileDetail extends UserProfile {
  post_count: number;
  follower_count: number;
  following_count: number;
}

type ActivityStatus = "online" | "today" | "week" | "inactive";

function getActivity(last_seen: string | null): ActivityStatus {
  if (!last_seen) return "inactive";
  const diff = Date.now() - new Date(last_seen).getTime();
  if (diff < 5 * 60 * 1000) return "online";
  if (diff < 24 * 60 * 60 * 1000) return "today";
  if (diff < 7 * 24 * 60 * 60 * 1000) return "week";
  return "inactive";
}

function ActivityDot({ status }: { status: ActivityStatus }) {
  const cls = {
    online: "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]",
    today: "bg-yellow-400",
    week: "bg-white/30",
    inactive: "bg-white/10",
  }[status];
  return <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${cls}`} />;
}

function activityLabel(status: ActivityStatus, last_seen: string | null): string {
  if (status === "online") return "Online now";
  if (status === "today") return "Active today";
  if (status === "week") return "Active this week";
  if (last_seen) return `Last seen ${new Date(last_seen).toLocaleDateString()}`;
  return "Never seen";
}

export default function UsersPage() {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), []);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "today" | "banned">("all");
  const [detailUser, setDetailUser] = useState<ProfileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [banning, setBanning] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    const handler = () => setOpenMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_profiles_with_email", {
        p_limit: 500,
        p_offset: 0,
      });
      if (error) throw error;
      setUsers((data || []) as UserProfile[]);
    } catch (err: any) {
      setToast(`Failed to load users: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (user: UserProfile) => {
    setDetailLoading(true);
    setDetailUser({ ...user, post_count: 0, follower_count: 0, following_count: 0 });
    const [pc, fc, fg] = await Promise.all([
      supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", user.id)
        .then((r) => r.count ?? 0, () => 0),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id)
        .then((r) => r.count ?? 0, () => 0),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id)
        .then((r) => r.count ?? 0, () => 0),
    ]);
    setDetailUser({ ...user, post_count: pc as number, follower_count: fc as number, following_count: fg as number });
    setDetailLoading(false);
  };

  const banUser = async (id: string, username: string, currentBan: boolean) => {
    const verb = currentBan ? "Unban" : "Ban";
    if (!confirm(`${verb} @${username}?`)) return;
    setBanning(id);
    const { error } = await supabase.from("profiles").update({ is_banned: !currentBan }).eq("id", id);
    setBanning(null);
    if (error) {
      setToast(`Error: ${error.message}`);
    } else {
      setToast(`@${username} ${currentBan ? "unbanned" : "banned"}.`);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, is_banned: !currentBan } : u)));
      if (detailUser?.id === id) setDetailUser((d) => d ? { ...d, is_banned: !currentBan } : d);
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setToast("User ID copied.");
    setOpenMenu(null);
  };

  const online = users.filter((u) => getActivity(u.last_seen) === "online").length;
  const activeToday = users.filter((u) => ["online", "today"].includes(getActivity(u.last_seen))).length;
  const banned = users.filter((u) => u.is_banned).length;

  const filtered = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchQ =
      !q ||
      u.username?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.university?.toLowerCase().includes(q);
    const matchF =
      filter === "all" ||
      (filter === "online" && getActivity(u.last_seen) === "online") ||
      (filter === "today" && ["online", "today"].includes(getActivity(u.last_seen))) ||
      (filter === "banned" && u.is_banned);
    return matchQ && matchF;
  });

  return (
    <div className="p-8 space-y-8">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-white text-black text-sm font-bold px-5 py-3 rounded-2xl shadow-2xl">
          {toast}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="text-blue-400" /> User Management
          </h1>
          <p className="text-white/50 mt-1">Manage accounts, activity, and platform bans.</p>
        </div>
        <button
          onClick={() => setInviteModal(true)}
          className="bg-white text-black px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-200 transition-all active:scale-95 shadow-lg"
        >
          <UserPlus size={18} /> Invite Admin
        </button>
      </div>

      {/* Activity Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(
          [
            { key: "all", label: "Total Users", value: users.length, color: "text-white" },
            { key: "online", label: "Online Now", value: online, color: "text-green-400" },
            { key: "today", label: "Active Today", value: activeToday, color: "text-yellow-400" },
            { key: "banned", label: "Banned", value: banned, color: "text-red-400" },
          ] as const
        ).map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className={`glass rounded-2xl p-4 text-left transition-all hover:bg-white/10 ${filter === s.key ? "ring-1 ring-indigo-500/60" : ""}`}
          >
            <p className="text-xs text-white/40 uppercase tracking-widest font-bold">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={20} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, university, or username..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm focus:outline-none focus:border-blue-500/50 text-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass rounded-3xl p-6 h-48 animate-pulse bg-white/5 border border-white/5" />
            ))
          : filtered.length === 0
          ? <div className="col-span-full py-20 text-center glass rounded-3xl text-white/30">No users found.</div>
          : filtered.map((user) => {
              const activity = getActivity(user.last_seen);
              return (
                <div
                  key={user.id}
                  className={`glass rounded-[2rem] p-6 hover:bg-white/[0.04] transition-all border hover:border-white/10 relative ${user.is_banned ? "border-red-500/20" : "border-white/5"}`}
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-4">
                      <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-500/20 to-purple-500/20 border border-white/10 overflow-hidden flex items-center justify-center">
                        {user.avatar_url
                          ? <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                          : <Users className="text-white/20" size={22} />
                        }
                        {user.is_verified && (
                          <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center border border-black">
                            <ShieldCheck size={8} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-white text-sm leading-tight">{user.full_name || `@${user.username}`}</h3>
                          {user.is_banned && (
                            <span className="text-[9px] font-bold uppercase tracking-wide bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">Banned</span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 mt-0.5">@{user.username}</p>
                      </div>
                    </div>

                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setOpenMenu(openMenu === user.id ? null : user.id)}
                        className="text-white/20 hover:text-white transition-colors p-1"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {openMenu === user.id && (
                        <div className="absolute right-0 top-8 z-20 w-44 bg-[#1a1a24] rounded-xl border border-white/10 shadow-2xl overflow-hidden">
                          <button onClick={() => { openDetail(user); setOpenMenu(null); }} className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors">
                            Profile Details
                          </button>
                          <button onClick={() => copyId(user.id)} className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2">
                            <Copy size={13} /> Copy User ID
                          </button>
                          <div className="border-t border-white/5" />
                          <button onClick={() => { banUser(user.id, user.username, user.is_banned); setOpenMenu(null); }} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                            {user.is_banned ? "Unban User" : "Ban User"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 mb-5">
                    <div className="flex items-center gap-2 text-white/40 text-xs">
                      <MapPin size={12} className="text-white/20" />
                      {user.university || "No campus set"}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <ActivityDot status={activity} />
                      <span className={activity === "online" ? "text-green-400" : activity === "today" ? "text-yellow-400/80" : "text-white/30"}>
                        {activityLabel(activity, user.last_seen)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => openDetail(user)} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white/70 transition-all">
                      Profile Details
                    </button>
                    <button
                      onClick={() => banUser(user.id, user.username, user.is_banned)}
                      disabled={banning === user.id}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-50 ${user.is_banned ? "bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white" : "bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"}`}
                      title={user.is_banned ? "Unban" : "Ban"}
                    >
                      {banning === user.id ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                    </button>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Profile Detail Modal */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setDetailUser(null)}>
          <div className="glass rounded-3xl w-full max-w-md p-8 space-y-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Profile Details</h2>
              <button onClick={() => setDetailUser(null)} className="text-white/30 hover:text-white transition-colors"><X size={20} /></button>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-500/20 to-purple-500/20 border border-white/10 overflow-hidden flex items-center justify-center">
                {detailUser.avatar_url
                  ? <img src={detailUser.avatar_url} alt={detailUser.username} className="w-full h-full object-cover" />
                  : <Users size={32} className="text-white/20" />
                }
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-white text-xl">{detailUser.full_name || `@${detailUser.username}`}</p>
                  {detailUser.is_verified && <ShieldCheck size={16} className="text-blue-400" />}
                </div>
                <p className="text-sm text-white/40">@{detailUser.username}</p>
                {detailUser.is_banned && <span className="text-[10px] font-bold uppercase bg-red-500/20 text-red-400 px-2 py-0.5 rounded mt-1 inline-block">Banned</span>}
              </div>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {[["Posts", detailUser.post_count], ["Followers", detailUser.follower_count], ["Following", detailUser.following_count]].map(([l, v]) => (
                  <div key={l} className="bg-white/5 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-bold text-white">{v}</p>
                    <p className="text-xs text-white/40 mt-1">{l}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 text-sm">
              <InfoRow icon={<MapPin size={14} />} label="Campus" value={detailUser.university || "Not set"} />
              <InfoRow icon={<Mail size={14} />} label="Email" value={detailUser.email || "—"} />
              <InfoRow icon={<Clock size={14} />} label="Joined" value={new Date(detailUser.created_at).toLocaleDateString()} />
              <InfoRow
                icon={<Activity size={14} />}
                label="Last Seen"
                value={detailUser.last_seen ? new Date(detailUser.last_seen).toLocaleString() : "Never"}
                highlight={getActivity(detailUser.last_seen) === "online" ? "text-green-400" : undefined}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => banUser(detailUser.id, detailUser.username, detailUser.is_banned)}
                disabled={banning === detailUser.id}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 border ${detailUser.is_banned ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500 hover:text-white" : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500 hover:text-white"}`}
              >
                {banning === detailUser.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                {detailUser.is_banned ? "Unban User" : "Ban User"}
              </button>
              <button onClick={() => copyId(detailUser.id)} className="px-4 py-2.5 rounded-xl bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Copy User ID">
                <Copy size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Admin Modal */}
      {inviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setInviteModal(false)}>
          <div className="glass rounded-3xl w-full max-w-sm p-8 space-y-5 border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Invite Admin</h2>
              <button onClick={() => setInviteModal(false)} className="text-white/30 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <p className="text-sm text-white/50">Enter an email address to send an admin invite.</p>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="admin@university.edu"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={async () => {
                if (!inviteEmail.trim()) return;
                const { error } = await supabase.functions.invoke("invite-admin", { body: { email: inviteEmail.trim() } });
                if (error) { setToast(`Error: ${error.message}`); }
                else { setToast(`Invite sent to ${inviteEmail}`); setInviteModal(false); setInviteEmail(""); }
              }}
              disabled={!inviteEmail.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Mail size={16} /> Send Invite
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-white/20 w-4 flex-shrink-0">{icon}</span>
      <span className="text-white/40 w-20 flex-shrink-0 text-xs uppercase tracking-wider font-bold">{label}</span>
      <span className={`font-medium truncate text-sm ${highlight || "text-white/80"}`}>{value}</span>
    </div>
  );
}
