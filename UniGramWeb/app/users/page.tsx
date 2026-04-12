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
  MapPin
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
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.university?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                  <h3 className="font-bold text-white text-lg leading-tight">{user.full_name || `@${user.username}`}</h3>
                  <p className="text-xs text-white/40 mt-0.5">Joined {new Date(user.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <button className="text-white/20 hover:text-white transition-colors">
                <MoreVertical size={20} />
              </button>
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
               <button className="flex-1 bg-white/5 hover:bg-white/10 border border-white/5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white/70 transition-all">
                  Profile Details
               </button>
               <button className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">
                  <Ban size={16} />
               </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
