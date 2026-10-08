"use client";

import { Building2, LayoutDashboard, LogOut, Settings, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Panel", icon: LayoutDashboard },
  { href: "/businesses", label: "Empresas", icon: Building2 },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useApi<{ email: string; full_name: string | null }>("/api/auth/me");

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-slate-900 text-slate-100 md:flex">
        <div className="flex items-center gap-2 px-5 py-5 font-bold">
          <ShieldCheck className="h-5 w-5 text-sky-400" /> NAP Entity Auditor
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800")}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 p-4 text-xs text-slate-400">
          <div className="mb-2 truncate">{me?.email}</div>
          <Button variant="secondary" size="sm" onClick={logout} className="w-full">
            <LogOut /> Salir
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className="text-sm">
              {label}
            </Link>
          ))}
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
