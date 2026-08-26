import Link from "next/link";
import {
  Flame,
  Zap,
  BarChart3,
  Trophy,
  Users,
  Smartphone,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

/**
 * svee.trade landing — trader-native, zero corporate fluff.
 * Copy source: docs/07-landing-copy.md
 */

const STATS = [
  { value: "10,000+", label: "traders practicing" },
  { value: "$4.2M", label: "simulated volume" },
  { value: "87,000", label: "paper trades" },
  { value: "0", label: "wallets drained" },
];

const FEATURES = [
  {
    icon: Flame,
    title: "Real Markets. Fake Money.",
    body: "Live prices from the same pairs you actually trade. If BONK is pumping, your paper BONK is pumping. Slippage punishes oversized entries exactly like the real chain does.",
  },
  {
    icon: Zap,
    title: "Terminal-Grade Execution",
    body: "Market, limit, stop-loss and tiered take-profits with realistic latency, fees, and the occasional brutal failed transaction. Practice through the pain now.",
  },
  {
    icon: BarChart3,
    title: "Analytics That Talk Trash",
    body: "Every trade logged. Every mistake measured. Win rate, average hold time, and the personal statistics you didn't ask for but needed.",
  },
  {
    icon: Trophy,
    title: "Leaderboards With Stakes",
    body: "Weekly contests on who can flip $10k hardest. Climb the board, share your profile, let the numbers talk. Screenshot culture is the whole point.",
  },
  {
    icon: Users,
    title: "Copy the Sharpest",
    body: "Follow top paper traders' every move. Learn the entries, study the exits, steal the strategy — it's encouraged here.",
  },
  {
    icon: Smartphone,
    title: "Your Pocket Casino, Sans Regret",
    body: "Install as an app. Snipe fake dips from the bus. Your portfolio syncs everywhere — your losses don't exist.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Sign up in 30 seconds",
    body: "Email or Google. $10,000 paper USDC hits your account instantly.",
  },
  {
    n: "02",
    title: "Trade live markets",
    body: "Real tokens, real-time candles, real order types. The money just isn't real.",
  },
  {
    n: "03",
    title: "Get good before it costs you",
    body: "Leaderboards, public profiles, receipts. When you go live, you'll already know what a 40% drawdown feels like.",
  },
];

// Decorative ticker — flavor for the hero mock, not live data
const TICKER = [
  { sym: "WIF", chg: "+12.4" },
  { sym: "BONK", chg: "-3.1" },
  { sym: "POPCAT", chg: "+41.7" },
  { sym: "MOG", chg: "+8.2" },
  { sym: "MEW", chg: "-9.6" },
  { sym: "PNUT", chg: "+23.0" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-white shadow-glow-accent">
              S
            </span>
            <span className="text-lg font-semibold tracking-tight">Svee</span>
          </Link>
          <Badge variant="outline" className="ml-1 hidden sm:inline-flex">
            TERMINAL
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-md px-4 py-2 text-sm text-fg-dim transition-colors hover:text-fg"
            >
              Log in
            </Link>
            <Link href="/signup" className={buttonVariants({ variant: "accent" })}>
              Launch Terminal
            </Link>
          </div>
        </nav>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden border-b border-line">
        {/* accent glow backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-320px] h-[560px] w-[900px] -translate-x-1/2 rounded-full opacity-25"
          style={{
            background:
              "radial-gradient(closest-side, rgba(139,92,246,0.55), rgba(0,255,136,0.12), transparent)",
          }}
        />
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
          <Badge variant="green" className="mb-6">
            $10,000 PAPER USDC ON SIGNUP
          </Badge>
          <h1 className="mx-auto max-w-3xl text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Trade like it&apos;s real.
            <br />
            <span className="bg-gradient-to-r from-green to-accent bg-clip-text text-transparent">
              Risk nothing.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-fg-dim">
            The paper trading terminal for memecoin degens. Real markets, real
            charts, real slippage — fake money. Turn practice reps into the
            skills that keep your actual stack alive.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className={`${buttonVariants({ variant: "buy", size: "lg" })} px-8`}
            >
              Start Trading Free <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/discover"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Watch a 10x run
            </Link>
          </div>
          <p className="mt-4 text-sm text-fg-muted">
            No wallet. No deposit. No excuses. Live in 30 seconds.
          </p>

          {/* Terminal mock preview */}
          <TerminalMock />
        </div>
      </section>

      {/* ---------- Stats strip ---------- */}
      <section className="border-b border-line bg-surface-1">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="px-6 py-8 text-center">
              <div className="num text-3xl font-semibold text-fg">{s.value}</div>
              <div className="label-caps mt-1.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight">
          Built like the terminals you already use
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-fg-dim">
          Padre muscle memory transfers on day one. We just removed the part
          where you lose your rent money.
        </p>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="panel panel-hover p-6">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-accent/25 bg-accent/10">
                <Icon className="size-5 text-accent" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-dim">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="border-y border-line bg-surface-1">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Three steps. Zero risk.
          </h2>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-left">
                <div className="num mb-4 text-sm font-semibold text-accent">
                  {s.n}
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-dim">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-28 text-center">
        <h2 className="text-4xl font-bold tracking-tight">
          Where traders are forged.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-fg-dim">
          Your next 100x story starts as a paper trade. Come blow up a fake
          account so the real one survives.
        </p>
        <Link
          href="/signup"
          className={`${buttonVariants({ variant: "accent", size: "lg" })} mt-8 px-10`}
        >
          Claim your $10,000 <ArrowRight className="size-4" />
        </Link>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <span className="flex size-6 items-center justify-center rounded bg-surface-3 text-xs font-bold">
              S
            </span>
            Svee — Practice. Perfect. Profit.
          </div>
          <p className="max-w-md text-xs leading-relaxed text-fg-muted">
            All balances are simulated. Nothing on this platform involves real
            funds, wallets, or transactions.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Decorative mini-terminal rendered with pure markup — sells the aesthetic instantly */
function TerminalMock() {
  return (
    <div className="panel relative mx-auto mt-16 max-w-4xl overflow-hidden text-left">
      {/* window chrome */}
      <div className="flex h-9 items-center gap-2 border-b border-line bg-surface-1 px-4">
        <span className="size-2.5 rounded-full bg-red/60" />
        <span className="size-2.5 rounded-full bg-warning/60" />
        <span className="size-2.5 rounded-full bg-green/60" />
        <span className="num ml-3 text-xs text-fg-muted">
          svee.trade/trade/solana/wif
        </span>
      </div>
      <div className="grid grid-cols-12">
        {/* chart area */}
        <div className="col-span-8 border-r border-line p-4">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="num text-xl font-semibold">dogwifhat</span>
              <span className="label-caps ml-2">WIF / USDC</span>
            </div>
            <PriceBlock price="$2.8471" change="+12.4%" up />
          </div>
          {/* fake candles */}
          <svg viewBox="0 0 400 120" className="mt-4 h-40 w-full" aria-hidden>
            {FAKE_CANDLES.map((c, i) => (
              <g key={i}>
                <line
                  x1={i * 13 + 5}
                  x2={i * 13 + 5}
                  y1={c.wickLow}
                  y2={c.wickHigh}
                  stroke={c.up ? "#00FF88" : "#FF3B3B"}
                  strokeWidth="1"
                  opacity="0.7"
                />
                <rect
                  x={i * 13 + 2}
                  y={c.bodyTop}
                  width="6"
                  height={Math.max(2, c.bodyBottom - c.bodyTop)}
                  fill={c.up ? "#00FF88" : "#FF3B3B"}
                  rx="1"
                />
              </g>
            ))}
          </svg>
          <div className="mt-2 flex gap-2">
            {TICKER.slice(0, 4).map((t) => (
              <span
                key={t.sym}
                className={`num rounded border border-line bg-surface-2 px-2 py-1 text-xs ${
                  t.chg.startsWith("+") ? "text-green" : "text-red"
                }`}
              >
                {t.sym} {t.chg}%
              </span>
            ))}
          </div>
        </div>
        {/* order panel area */}
        <div className="col-span-4 p-4">
          <div className="grid grid-cols-2 gap-2">
            <span className="rounded-md bg-green py-2 text-center text-sm font-semibold text-black">
              Buy
            </span>
            <span className="rounded-md bg-red py-2 text-center text-sm font-semibold text-white">
              Sell
            </span>
          </div>
          <div className="mt-3 rounded-md border border-line bg-surface-4 px-3 py-2.5">
            <span className="num text-sm text-fg-dim">Amount · USD</span>
            <div className="num mt-0.5 text-lg font-semibold">500.00</div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {["25%", "50%", "75%", "Max"].map((q) => (
              <span
                key={q}
                className="num rounded border border-line bg-surface-3 py-1.5 text-center text-xs text-fg-dim"
              >
                {q}
              </span>
            ))}
          </div>
          <div className="num mt-3 space-y-1.5 rounded-md border border-line bg-surface-2 p-3 text-xs text-fg-muted">
            <div className="flex justify-between">
              <span>Slippage est.</span>
              <span>0.13%</span>
            </div>
            <div className="flex justify-between">
              <span>Platform fee</span>
              <span>$4.50</span>
            </div>
            <div className="flex justify-between">
              <span>Network fee</span>
              <span>$0.08</span>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5 text-fg">
              <span>You receive</span>
              <span className="text-green">175.42 WIF</span>
            </div>
          </div>
          <button
            className="btn-press mt-3 w-full rounded-md bg-green py-2.5 text-sm font-semibold text-black"
            tabIndex={-1}
          >
            Buy WIF
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceBlock({
  price,
  change,
  up,
}: {
  price: string;
  change: string;
  up: boolean;
}) {
  return (
    <div className="text-right">
      <div className="num text-xl font-semibold">{price}</div>
      <div className={`num text-sm ${up ? "text-green" : "text-red"}`}>
        {change}
      </div>
    </div>
  );
}

// Deterministic decorative candlesticks (upward drift to look bullish)
const FAKE_CANDLES = Array.from({ length: 30 }, (_, i) => {
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  const r = seed - Math.floor(seed);
  const base = 90 - i * 2.2;
  const up = r > 0.38;
  const bodyTop = base - r * 18;
  const bodyBottom = bodyTop + 6 + r * 14;
  return {
    up,
    wickLow: Math.min(base + 8, 118),
    wickHigh: Math.max(bodyTop - 8, 2),
    bodyTop,
    bodyBottom,
  };
});
