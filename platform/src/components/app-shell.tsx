"use client";

import { useState } from "react";
import Link from "next/link";
import { LogoInline } from "@/components/logo";
import { AppNav, type NavItem } from "@/components/app-nav";
import { HelpButton } from "@/components/help/help-button";

export function AppShell({
  navItems,
  userName,
  rolesLabel,
  initials,
  unreadCount,
  logoutSlot,
  children,
}: {
  navItems: NavItem[];
  userName: string;
  rolesLabel: string;
  initials: string;
  unreadCount: number;
  logoutSlot: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const sidebar = (
    <>
      <div className="border-b border-neutral-800 px-4 py-4">
        <LogoInline className="text-white" />
      </div>
      <AppNav items={navItems} onNavigate={() => setOpen(false)} />
      <div className="border-t border-neutral-800 px-4 py-3">
        <p className="truncate text-sm font-medium text-white">{userName}</p>
        <p className="truncate text-xs text-neutral-500">{rolesLabel}</p>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-neutral-950 text-neutral-100 lg:flex">{sidebar}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-neutral-950 text-neutral-100 shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-neutral-700 hover:bg-neutral-100 lg:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-neutral-900 lg:hidden">
            <LogoInline />
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 sm:px-3"
            >
              <span className="hidden sm:inline">Notifications</span>
              <span className="sm:hidden">🔔</span>
              {unreadCount > 0 && (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unreadCount}</span>
              )}
            </Link>
            <HelpButton />
            <Link
              href="/account/security"
              title="Account security"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white hover:bg-neutral-700"
            >
              {initials}
            </Link>
            {logoutSlot}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
