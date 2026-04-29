"use client";
import React, { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Search, LogOut, User } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      setAdminEmail(session.user.email ?? null);
      const { data: profile } = await supabase.from('profiles').select('username, full_name').eq('id', session.user.id).single();
      if (profile) setAdminName(profile.full_name || profile.username || null);
    });
  }, []);

  const handleSignOut = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const initials = (adminName || adminEmail || "AD")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex min-h-screen bg-[#050508]">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
              <input
                type="text"
                placeholder="Search anything... (Users, Posts, Reports)"
                className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors text-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {adminName && (
              <span className="text-sm text-white/50 hidden md:block">{adminName}</span>
            )}
            <div className="w-8 h-8 rounded-full bg-indigo-700 border border-indigo-500/40 flex items-center justify-center text-[11px] font-bold text-white">
              {initials}
            </div>
            <button
              onClick={handleSignOut}
              disabled={loggingOut}
              className="flex items-center gap-1.5 text-white/30 hover:text-white transition-colors text-sm px-2 py-1.5 rounded-lg hover:bg-white/5"
              title="Sign out"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline text-xs">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
