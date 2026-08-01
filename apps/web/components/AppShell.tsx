"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, ClipboardList, LogOut, MessageSquareText, TicketCheck } from "lucide-react";
import type { Role } from "@finserve/shared-types";
import { clearSession } from "../lib/session";

export function AppShell({ children, role }: { children: React.ReactNode; role: Role }) {
  const pathname = usePathname();
  const router = useRouter();
  const links =
    role === "USER"
      ? [
          { href: "/chat", label: "智能客服", icon: MessageSquareText },
          { href: "/tickets", label: "我的工单", icon: TicketCheck }
        ]
      : [
          { href: "/admin/dashboard", label: "运行指标", icon: Activity },
          { href: "/admin/tickets", label: "工单工作台", icon: ClipboardList },
          { href: "/chat", label: "用户视角", icon: MessageSquareText }
        ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand" aria-label="FinServe AI">
          <span className="brand-mark">F</span>
          <span>FinServe AI</span>
        </div>
        <nav className="nav" aria-label="主导航">
          {links.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} className={`nav-link ${active ? "active" : ""}`} href={item.href}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          className="nav-link"
          type="button"
          onClick={() => {
            clearSession();
            router.replace("/login");
          }}
        >
          <LogOut size={18} />
          退出
        </button>
      </aside>
      <main className="main" id="main-content">
        {children}
      </main>
    </div>
  );
}
