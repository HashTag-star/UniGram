"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldCheck,
  Users,
  AlertTriangle,
  TrendingUp,
  Settings,
  BrainCircuit,
  LayoutDashboard,
  Search,
  Filter,
  Megaphone,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const isLinkActive = (path: string) => {
    if (path === "/" && pathname !== "/") return false;
    return pathname.startsWith(path);
  };

  return (
    <aside className="w-64 glass border-r border-white/5 flex flex-col h-screen sticky top-0">
      <div className="p-6 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">UniGram<span className="text-indigo-400 text-sm ml-1">Admin</span></span>
        </Link>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        <NavItem href="/" icon={<LayoutDashboard size={18} />} label="Overview" active={pathname === "/"} />
        <NavItem href="/verifications" icon={<ShieldCheck size={18} />} label="Verifications" active={isLinkActive("/verifications")} />
        <NavItem href="/reports" icon={<AlertTriangle size={18} />} label="Reports" active={isLinkActive("/reports")} />
        <NavItem href="/users" icon={<Users size={18} />} label="Users" active={isLinkActive("/users")} />
        <NavItem href="/analytics" icon={<TrendingUp size={18} />} label="Analytics" active={isLinkActive("/analytics")} />
        
        <div className="pt-4 mt-4 border-t border-white/5">
          <span className="px-3 text-[10px] font-bold text-white/30 uppercase tracking-[2px]">Core AI</span>
          <NavItem href="/ai-regulator" icon={<BrainCircuit size={18} />} label="AI Regulator" color="text-purple-400" active={isLinkActive("/ai-regulator")} />
          <NavItem href="/keyword-manager" icon={<Filter size={18} />} label="Keyword Filters" color="text-yellow-400" active={isLinkActive("/keyword-manager")} />
          <NavItem href="/campus-content" icon={<Megaphone size={18} />} label="Campus Content" color="text-green-400" active={isLinkActive("/campus-content")} />
        </div>
      </nav>

      <div className="p-4 border-t border-white/5">
        <NavItem href="/settings" icon={<Settings size={18} />} label="Settings" active={isLinkActive("/settings")} />
      </div>
    </aside>
  );
}

function NavItem({ href, icon, label, active = false, color }: { href: string, icon: React.ReactNode, label: string, active?: boolean, color?: string }) {
  return (
    <Link href={href}>
      <div className={`
        flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200
        ${active ? 'bg-indigo-600 shadow-lg shadow-indigo-600/20 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}
        ${color}
      `}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
    </Link>
  );
}
