"use client";

import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCountUp } from "@/hooks/use-count-up";
import { fmtUsd } from "@/lib/format";
import { useBalanceStore } from "@/stores/balance-store";

/**
 * Topbar: search trigger, chain context, paper balance.
 * Balance counts up on change — the core "alive" signal.
 */
export function Topbar() {
  const cash = useBalanceStore((s) => s.cashUsdc);
  const displayCash = useCountUp(cash);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-4">
      {/* Search trigger */}
      <button
        type="button"
        className="flex h-9 w-72 items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg-dim"
      >
        <Search className="size-4" />
        <span>Search tokens…</span>
        <kbd className="num ml-auto rounded border border-line bg-surface-4 px-1.5 py-0.5 text-[10px]">
          ⌘K
        </kbd>
      </button>

      <Badge variant="blue">SOLANA</Badge>

      <div className="ml-auto flex items-center gap-3">
        {/* Paper balance pill */}
        <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5">
          <span className="label-caps">Paper USDC</span>
          <span className="num text-sm font-semibold text-green">
            {fmtUsd(displayCash)}
          </span>
        </div>

        {/* User avatar placeholder */}
        <button
          type="button"
          aria-label="Account menu"
          className="flex size-8 items-center justify-center rounded-full border border-line-strong bg-surface-3 text-xs font-semibold text-fg-dim transition-colors hover:border-accent/50 hover:text-fg"
        >
          E
        </button>
      </div>
    </header>
  );
}
