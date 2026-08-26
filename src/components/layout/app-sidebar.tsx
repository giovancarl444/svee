"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

/** Icon+label rail, Axiom-style. Fixed width, full-height. */
export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-line bg-surface-1">
      {/* Brand */}
      <Link
        href="/trade"
        className="flex h-14 items-center gap-2.5 border-b border-line px-4"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-sm font-bold text-white shadow-glow-accent">
          S
        </span>
        <span className="text-[15px] font-semibold tracking-tight">
          Svee<span className="text-fg-muted"> Terminal</span>
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-surface-3 text-fg"
                  : "text-fg-dim hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-accent" : "text-fg-muted group-hover:text-fg-dim",
                )}
              />
              <span className={cn(active && "font-medium")}>{label}</span>
              {active && (
                <span className="ml-auto h-4 w-0.5 rounded-full bg-accent shadow-glow-accent" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Paper-trading disclaimer */}
      <div className="border-t border-line p-3">
        <p className="label-caps mb-1">Paper Trading</p>
        <p className="text-[11px] leading-relaxed text-fg-muted">
          Simulated funds only. No wallets connected, nothing real is at risk.
        </p>
      </div>
    </aside>
  );
}
