"use client";
import React, { useEffect, useState } from "react";
import { AI_NAV_ITEMS, NAV_ITEMS, NavItem, Sidebar } from "./Sidebar";
import { Search, LogOut, ShieldCheck } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { usePathname, useRouter } from "next/navigation";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.push("/login");
        return;
      }
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username, full_name, is_admin')
        .eq('id', session.user.id)
        .single();

      if (error || !profile?.is_admin) {
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setAdminEmail(session.user.email ?? null);
      setAdminName(profile.full_name || profile.username || null);
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

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-white/5 bg-black/70 backdrop-blur-md sticky top-0 z-10">
          <div className="h-16 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-white">UniGram</span>
            </div>

            <div className="hidden sm:flex items-center gap-4 flex-1 max-w-xl">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input
                  type="text"
                  placeholder="Search users, posts, reports"
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors text-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              {adminName && (
                <span className="text-sm text-white/50 hidden md:block">{adminName}</span>
              )}
              <div className="w-8 h-8 rounded-lg bg-indigo-700 border border-indigo-500/40 flex items-center justify-center text-[11px] font-bold text-white">
                {initials}
              </div>
              <button
                onClick={handleSignOut}
                disabled={loggingOut}
                className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors text-sm px-2 py-1.5 rounded-lg hover:bg-white/5"
                title="Sign out"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline text-xs">Sign out</span>
              </button>
            </div>
          </div>

          <nav className="lg:hidden flex gap-2 overflow-x-auto px-4 pb-3">
            {[...NAV_ITEMS, ...AI_NAV_ITEMS].map((item) => (
              <div key={item.href} className="shrink-0">
                <NavItem
                  {...item}
                  active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
                />
              </div>
            ))}
          </nav>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
