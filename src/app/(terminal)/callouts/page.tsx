"use client";

import Link from "next/link";
import { useCallouts, calloutToTradeHref } from "@/hooks/use-callouts";
import { fmtUsd } from "@/lib/format";

export default function CalloutsPage() {
  const { data, isLoading } = useCallouts();

  const tr = data?.trackRecord;

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Track record header — the proof that drives followers */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Calls" value={String(tr?.total ?? 0)} />
        <Stat label="Resolved" value={String(tr?.resolved ?? 0)} />
        <Stat
          label="Win Rate"
          value={tr ? `${(tr.winRate * 100).toFixed(0)}%` : "—"}
          accent={tr && tr.winRate >= 0.5}
        />
        <Stat
          label="Avg Multiple"
          value={tr ? `${tr.avgMultiple.toFixed(2)}x` : "—"}
        />
        <Stat
          label="Best"
          value={tr ? `${tr.bestMultiple.toFixed(2)}x` : "—"}
          accent={tr && tr.bestMultiple >= 2}
        />
        <Stat label="W / L" value={`${tr?.wins ?? 0} / ${tr?.losses ?? 0}`} />
      </div>

      {/* Source explanation */}
      <p className="num text-xs text-fg-muted">
        Curated pump.fun calls from{" "}
        <span className="text-accent">MEGAPHONE</span> — filtered for real
        capital + socials + early entry. Execute any call as a paper trade, then
        resolve it to build the track record that grows your following.
      </p>

      {/* Calls table */}
      <div className="panel min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <p className="p-4 text-sm text-fg-muted">Loading callouts…</p>
        ) : (data?.callouts.length ?? 0) === 0 ? (
          <p className="p-4 text-sm text-fg-muted">
            No calls yet. MEGAPHONE logs calls as they score on the firehose.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Called MC</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Multiple</th>
                <th className="px-3 py-2 font-medium text-right">Trade</th>
              </tr>
            </thead>
            <tbody>
              {data!.callouts.map((c) => (
                <tr
                  key={c.mint}
                  className="border-b border-line/50 hover:bg-surface-2"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.symbol}</span>
                      {c.source === "whale-mirror" && (
                        <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                          {c.sourceHandle}
                        </span>
                      )}
                    </div>
                    <span className="num text-[10px] text-fg-muted">
                      {new Date(c.calledAt).toLocaleTimeString()}
                    </span>
                  </td>
                  <td className="num px-3 py-2 text-fg-dim">{c.score}</td>
                  <td className="num px-3 py-2 text-fg-dim">
                    {fmtUsd(c.calledMcUsd)}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {c.socials.join("/") || "—"}
                  </td>
                  <td className="num px-3 py-2">
                    {c.multiple !== undefined ? (
                      <span
                        className={
                          c.multiple >= 1.5
                            ? "text-green"
                            : c.multiple < 1
                              ? "text-red"
                              : "text-fg-dim"
                        }
                      >
                        {c.multiple.toFixed(2)}x
                        {c.graduated ? " ✓" : ""}
                      </span>
                    ) : (
                      <span className="text-fg-muted">open</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={calloutToTradeHref(c)}
                      className="btn-press rounded bg-accent px-2.5 py-1 text-xs font-semibold text-black hover:brightness-110"
                    >
                      Trade
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="panel px-3 py-2">
      <p className="label-caps mb-1">{label}</p>
      <p
        className={`num text-lg font-semibold ${accent ? "text-green" : "text-fg"}`}
      >
        {value}
      </p>
    </div>
  );
}
