"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Users, 
  Search, 
  MoreVertical, 
  ShieldCheck, 
  Ban, 
  UserPlus,
  Mail,
  MapPin,
  X
} from "lucide-react";

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  university: string;
  is_verified: boolean;
  avatar_url: string;
  created_at: string;
  is_banned: boolean;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fallback: Fetch emails from verification_requests since profiles might not have them
      const { data: verifications } = await supabase
        .from('verification_requests')
        .select('user_id, email');

      const emailMap = new Map();
      if (verifications) {
        verifications.forEach(v => {
          if (v.email) emailMap.set(v.user_id, v.email);
        });
      }

      const usersWithEmail = (profiles || []).map(p => ({
        ...p,
        email: p.email || emailMap.get(p.id) || ''
      }));

      setUsers(usersWithEmail);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleBan = async (userId: string, isCurrentlyBanned: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: !isCurrentlyBanned })
        .eq('id', userId);
        
      if (error) throw error;
      
      setUsers(users.map(u => u.id === userId ? { ...u, is_banned: !isCurrentlyBanned } : u));
    } catch (error) {
      console.error("Error toggling ban status:", error);
      alert("Failed to update user ban status.");
    }
  };

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.university?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleInviteAdmin = () => {
    const email = prompt("Enter the email address to invite as an admin:");
    if (email) {
      alert(`Invitation sent to ${email}`);
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="text-blue-400" />
            User Management
          </h1>
          <p className="text-white/50 mt-1">Manage accounts, permissions, and platform bans.</p>
        </div>

        <button 
          onClick={handleInviteAdmin}
          className="bg-white text-black px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-200 transition-all active:scale-95 shadow-lg shadow-white/5"
        >
          <UserPlus size={18} />
          Invite Admin
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={20} />
        <input 
          type="text" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for users by name, university, or username..." 
          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm focus:outline-none focus:border-blue-500/50 transition-colors text-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
             Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass rounded-3xl p-6 h-48 animate-pulse bg-white/5 border border-white/5" />
             ))
        ) : filteredUsers.length === 0 ? (
          <div className="col-span-full py-20 text-center glass rounded-3xl text-white/30">
             No users found.
          </div>
        ) : filteredUsers.map((user) => (
          <div key={user.id} className="glass rounded-[2rem] p-6 hover:bg-white/[0.04] transition-all group border border-white/5 hover:border-white/10 relative">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500/20 to-purple-500/20 border border-white/10 overflow-hidden flex items-center justify-center relative">
                   {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                   ) : (
                      <Users className="text-white/20" size={24} />
                   )}
                   {user.is_verified && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-black drop-shadow-lg">
                        <ShieldCheck size={10} className="text-white" />
                      </div>
                   )}
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg leading-tight flex items-center gap-2">
                    {user.full_name || `@${user.username}`}
                    {user.is_banned && <span className="bg-red-500/20 text-red-400 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border border-red-500/30">Banned</span>}
                  </h3>
                  <p className="text-xs text-white/40 mt-0.5">Joined {new Date(user.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="relative">
                <button 
                  onClick={() => setDropdownOpenId(dropdownOpenId === user.id ? null : user.id)}
                  className="text-white/20 hover:text-white transition-colors"
                >
                  <MoreVertical size={20} />
                </button>
                {dropdownOpenId === user.id && (
                  <div className="absolute right-0 mt-2 w-48 bg-[#1a1a24] border border-white/10 rounded-xl shadow-xl overflow-hidden z-20">
                    <button 
                      onClick={() => { navigator.clipboard.writeText(user.id); setDropdownOpenId(null); alert("User ID copied to clipboard!"); }}
                      className="w-full text-left px-4 py-3 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      Copy User ID
                    </button>
                    <button 
                      onClick={() => { alert(`Messaging feature is under development.`); setDropdownOpenId(null); }}
                      className="w-full text-left px-4 py-3 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      Message User
                    </button>
                    <button 
                      onClick={() => { alert(`Password reset link sent to ${user.email}`); setDropdownOpenId(null); }}
                      className="w-full text-left px-4 py-3 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors border-t border-white/5 text-red-400 hover:text-red-300"
                    >
                      Reset Password
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
               <div className="flex items-center gap-2 text-white/50 text-xs">
                  <Mail size={14} className="text-white/20" />
                  {user.id.substring(0, 18)}...
               </div>
               <div className="flex items-center gap-2 text-white/50 text-xs">
                  <MapPin size={14} className="text-white/20" />
                  {user.university || 'No campus set'}
               </div>
            </div>

            <div className="mt-6 flex items-center gap-2">
               <button 
                 onClick={() => setSelectedUser(user)}
                 className="flex-1 bg-white/5 hover:bg-white/10 border border-white/5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white/70 transition-all">
                  Profile Details
               </button>
               <button 
                 onClick={() => toggleBan(user.id, user.is_banned)}
                 className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                   user.is_banned 
                     ? 'bg-red-500 text-white hover:bg-red-600' 
                     : 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white'
                 }`}
                 title={user.is_banned ? "Unban User" : "Ban User"}
               >
                  <Ban size={16} />
               </button>
            </div>
          </div>
        ))}
      </div>

      {selectedUser && (
        <ProfileModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
}

function ProfileModal({ user, onClose }: { user: UserProfile, onClose: () => void }) {
  if (!user) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f13] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h2 className="text-xl font-bold">Profile Details</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-500/20 to-purple-500/20 border border-white/10 overflow-hidden flex items-center justify-center relative">
               {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
               ) : (
                  <Users className="text-white/20" size={32} />
               )}
            </div>
            <div>
              <h3 className="font-bold text-white text-2xl flex items-center gap-2">
                {user.full_name || `@${user.username}`}
                {user.is_verified && <ShieldCheck size={16} className="text-blue-400" />}
              </h3>
              <p className="text-sm text-white/50">@{user.username}</p>
            </div>
          </div>
          
          <div className="space-y-4 bg-white/5 rounded-2xl p-4 border border-white/5">
            <DetailRow label="User ID" value={user.id} />
            <DetailRow label="Email" value={user.email || 'No email provided'} />
            <DetailRow label="University" value={user.university || 'No campus set'} />
            <DetailRow label="Verified" value={user.is_verified ? "Yes" : "No"} />
            <DetailRow label="Joined" value={new Date(user.created_at).toLocaleString()} />
            <DetailRow label="Status" value={user.is_banned ? "Banned" : "Active"} color={user.is_banned ? "text-red-400" : "text-green-400"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, color = "text-white" }: { label: string, value: string, color?: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-white/40 text-sm">{label}</span>
      <span className={`text-sm font-medium ${color} text-right`}>{value}</span>
    </div>
  );
}
