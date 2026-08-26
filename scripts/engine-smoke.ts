/**
 * Engine smoke test — exercises the pure simulation modules and prints
 * PASS/FAIL per assertion. Run: npx tsx scripts/engine-smoke.ts
 */

import { simulateSlippage, mulberry32 } from "../src/lib/engine/slippage";
import { computeFees } from "../src/lib/engine/fees";
import { executeMarket } from "../src/lib/engine/execute";
import { evaluateTrigger } from "../src/lib/engine/match";
import { applyBuy, applySell, unrealizedPnl } from "../src/lib/engine/pnl";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---- Slippage monotonicity: bigger size => worse price --------------------
const small = simulateSlippage(
  { tradeUsd: 500, liquidityUsd: 500_000, volume24hUsd: 5_000_000 },
  mulberry32(42),
);
const big = simulateSlippage(
  { tradeUsd: 2_000, liquidityUsd: 40_000, volume24hUsd: 50_000 },
  mulberry32(42),
);
check("small size slips modestly (<60bps)", small.slippageBps < 60 && !small.failsLiquidity, `${small.slippageBps}bps`);
check("big size into thin pool slips hard (>300bps)", big.slippageBps > 300 || big.failsLiquidity, `${big.slippageBps}bps`);
check("slippage is adverse (multiplier <1)", small.priceMultiplier < 1);

// ---- Fees -------------------------------------------------------------------
const fees = computeFees(500, { volume24hUsd: 1_000_000 }, { next: mulberry32(7) });
check("platform fee is 0.9% of quote", Math.abs(fees.platform - 4.5) < 0.01, `$${fees.platform}`);
check("network fee in sane band ($0.02–$0.30)", fees.network > 0.02 && fees.network < 0.3, `$${fees.network}`);
check("no MEV on old pairs", fees.mev === null);

// ---- Execution: BUY ---------------------------------------------------------
const mkt = { priceUsd: 0.8, liquidityUsd: 500_000, volume24hUsd: 5_000_000 };
const buy = executeMarket({ side: "buy", amountUsd: 500, market: mkt, cashUsdc: 10_000, position: null, seed: 99 });
check("buy fills", buy.ok === true && !!buy.execPrice, `exec=$${buy.execPrice} slip=${buy.slippageBps}bps fee=$${buy.feeBreakdown?.total}`);
check("buy exec price >= ref (pay up)", (buy.execPrice ?? 0) >= mkt.priceUsd);
check("position updated after buy", (buy.positionAfter?.qty ?? 0) > 0, `qty=${buy.positionAfter?.qty?.toFixed(2)}`);

// ---- Execution: SELL closes the loop ---------------------------------------
const pos = buy.positionAfter!;
const sell = executeMarket({ side: "sell", sellPct: 100, market: mkt, cashUsdc: 0, position: pos, seed: 99 });
check("sell fills and flattens", sell.ok === true && sell.positionAfter?.qty === 0, `proceeds≈$${sell.quoteValue} realizedPnl=$${sell.realizedPnl}`);
check("round-trip PnL ≈ -(slippage+fees)", (sell.realizedPnl ?? 0) > -60 && (sell.realizedPnl ?? 0) < 0, `$${sell.realizedPnl}`);

// ---- Sell without position fails -------------------------------------------
const noPos = executeMarket({ side: "sell", sellPct: 100, market: mkt, cashUsdc: 0, position: null });
check("sell w/o position rejected", noPos.ok === false && noPos.failReason === "NO_POSITION");

// ---- Matcher triggers --------------------------------------------------------
check("limit buy triggers below limit", evaluateTrigger({ side: "buy", orderType: "limit", limitPrice: 0.8 }, 0.79).triggered);
check("limit buy idle above limit", !evaluateTrigger({ side: "buy", orderType: "limit", limitPrice: 0.8 }, 0.81).triggered);
check("stop fires at/below stop", evaluateTrigger({ side: "sell", orderType: "stop_loss", stopPrice: 0.75 }, 0.74).triggered);
check("TP fires at/above target", evaluateTrigger({ side: "sell", orderType: "take_profit", takeProfitPrice: 0.9 }, 0.91).triggered);

// ---- Average-cost across mixed buys ----------------------------------------
let p = applyBuy({ qty: 0, avgEntryPrice: 0, investedUsdc: 0 }, 100, 1.0)!;
p = applyBuy(p, 100, 3.0)!;
check("avg entry = (100*1 + 100*3)/200 = 2.0", Math.abs(p.avgEntryPrice - 2.0) < 1e-9, `${p.avgEntryPrice}`);
const closeHalf = applySell(p, 100, 4.0, 0);
check("half out at $4 realizes $200", Math.abs(closeHalf.realizedPnl - 200) < 0.01, `$${closeHalf.realizedPnl}`);
check("uPnL on remainder at mark 5 = $300", Math.abs(unrealizedPnl(closeHalf.position, 5.0) - 300) < 0.01);

console.log(failures === 0 ? "\nALL ENGINE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
