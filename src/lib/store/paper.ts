/**
 * Local paper-trading store — file-backed, single-user (pre-auth Sprint 0).
 *
 * Same shape the Supabase tables will have (docs/02), so swapping this module
 * for DB calls later touches only this file. Writes are atomic
 * (tmp + rename) and guarded by a per-process async lock.
 */

import { promises as fs } from "fs";
import path from "path";
import type {
  Order,
  Portfolio,
  Position,
  Side,
  Trade,
} from "@/types/trading";

const DATA_DIR = process.env.SVEE_DATA_DIR ?? path.join(process.cwd(), ".svee");
const STATE_FILE = path.join(DATA_DIR, "paper-state.json");

export interface PaperState {
  portfolio: Portfolio;
  positions: Position[];
  orders: Order[];
  trades: Trade[];
  /** idempotency key -> order id (dict, not array: O(1) replay lookups) */
  idempotencyKeys: Record<string, string>;
}

function freshState(): PaperState {
  return {
    portfolio: {
      id: "local",
      cashUsdc: 10_000,
      startingBalance: 10_000,
      realizedPnl: 0,
      feesPaid: 0,
      resetCount: 0,
    },
    positions: [],
    orders: [],
    trades: [],
    idempotencyKeys: {},
  };
}

// ---- per-process mutation lock -------------------------------------------
let queue: Promise<unknown> = Promise.resolve();

/** Serialize mutations so read-modify-write cycles can't interleave. */
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

// ---- load / save -----------------------------------------------------------

export async function loadState(): Promise<PaperState> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw) as PaperState;
  } catch {
    return freshState();
  }
}

async function saveState(state: PaperState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, STATE_FILE);
}

/** Read + mutate + persist under the lock. */
export function mutateState<T>(
  fn: (state: PaperState) => T | Promise<T>,
): Promise<T> {
  return withLock(async () => {
    const state = await loadState();
    const result = await fn(state);
    await saveState(state);
    return result;
  });
}

// ---- domain helpers --------------------------------------------------------

export function upsertPosition(
  state: PaperState,
  p: {
    chain: string;
    tokenAddress: string;
    tokenSymbol?: string;
    tokenName?: string;
    qty: number;
    avgEntryPrice: number;
    investedUsdc: number;
  },
): Position {
  const key = positionKey(p.chain, p.tokenAddress);
  let pos = state.positions.find(
    (x) => positionKey(x.chain, x.tokenAddress) === key && x.status === "open",
  );
  if (!pos) {
    pos = {
      id: `pos_${crypto.randomUUID().slice(0, 12)}`,
      chain: p.chain as Position["chain"],
      tokenAddress: p.tokenAddress,
      tokenSymbol: p.tokenSymbol ?? "?",
      tokenName: p.tokenName,
      qty: 0,
      avgEntryPrice: 0,
      investedUsdc: 0,
      status: "open",
      openedAt: new Date().toISOString(),
    };
    state.positions.push(pos);
  }
  pos.qty = p.qty;
  pos.avgEntryPrice = p.avgEntryPrice;
  pos.investedUsdc = p.investedUsdc;
  if (p.tokenSymbol) pos.tokenSymbol = p.tokenSymbol;
  if (p.tokenName) pos.tokenName = p.tokenName;
  // Auto-close dust / fully-sold positions
  if (pos.qty <= 0 || pos.investedUsdc < 0.01) {
    pos.qty = Math.max(0, pos.qty);
    if (pos.qty === 0) {
      pos.status = "closed";
      pos.closedAt = new Date().toISOString();
    }
  }
  return pos;
}

export function findOpenPosition(
  state: PaperState,
  chain: string,
  tokenAddress: string,
): Position | undefined {
  const key = positionKey(chain, tokenAddress);
  return state.positions.find(
    (x) => positionKey(x.chain, x.tokenAddress) === key && x.status === "open",
  );
}

export function positionKey(chain: string, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

export interface RecordTradeArgs {
  orderId: string;
  side: Side;
  tokenSymbol?: string;
  qty: number;
  price: number;
  quoteValue: number;
  fee: number;
  realizedPnl?: number;
}

export function recordTrade(state: PaperState, args: RecordTradeArgs): Trade {
  const trade: Trade = {
    id: `trd_${crypto.randomUUID().slice(0, 12)}`,
    orderId: args.orderId,
    side: args.side,
    tokenSymbol: args.tokenSymbol,
    qty: args.qty,
    price: args.price,
    quoteValue: args.quoteValue,
    fee: args.fee,
    realizedPnl: args.realizedPnl,
    txHash: `sim${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    createdAt: new Date().toISOString(),
  };
  state.trades.unshift(trade);
  state.trades = state.trades.slice(0, 500); // bound ledger size locally
  return trade;
}
