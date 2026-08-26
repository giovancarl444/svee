/**
 * Core trading domain types. DB rows are snake_case numerics-as-strings
 * (Postgres numeric); API layer maps them onto these camelCase numbers.
 */

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop_loss" | "take_profit";
export type OrderStatus =
  | "submitted"
  | "pending"
  | "open"
  | "filled"
  | "cancelled"
  | "expired"
  | "failed";
export type Chain = "solana" | "ethereum" | "base" | "bnb";

export interface Portfolio {
  id: string;
  cashUsdc: number;
  startingBalance: number;
  realizedPnl: number;
  feesPaid: number;
  resetCount: number;
}

export interface Position {
  id: string;
  chain: Chain;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName?: string;
  qty: number;
  avgEntryPrice: number;
  investedUsdc: number;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  /** live fields joined at read time */
  markPrice?: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
}

export interface Order {
  id: string;
  side: Side;
  orderType: OrderType;
  status: OrderStatus;
  chain: Chain;
  tokenAddress: string;
  tokenSymbol?: string;
  quoteAmount?: number;
  qty?: number;
  sellPct?: number;
  limitPrice?: number;
  stopPrice?: number;
  takeProfitPrice?: number;
  filledQty: number;
  avgFillPrice?: number;
  slippageBps?: number;
  feeTotal: number;
  latencyMs?: number;
  failReason?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface Trade {
  id: string;
  orderId: string;
  side: Side;
  tokenSymbol?: string;
  qty: number;
  price: number;
  quoteValue: number;
  fee: number;
  realizedPnl?: number;
  txHash: string;
  createdAt: string;
}

export interface ExitPlanLevel {
  pct: number; // % of position to sell
  tpBps: number; // take-profit distance from entry, basis points (+3000 = +30%)
}

export interface PlaceOrderRequest {
  idempotencyKey: string;
  side: Side;
  orderType: OrderType;
  chain: Chain;
  tokenAddress: string;
  tokenSymbol?: string;
  quoteAmount?: number;
  qty?: number;
  sellPct?: number;
  limitPrice?: number;
  stopPrice?: number;
  expiresAt?: string;
  exitPlan?: ExitPlanLevel[];
}

export interface PlaceOrderResponse {
  order: Order;
  position?: Position;
  portfolio: Portfolio;
  achievementsUnlocked: { id: string; name: string }[];
}

export interface TokenOverview {
  chain: Chain;
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceChange: { m5: number; h1: number; h24: number };
  volume24h: number;
  liquidityUsd: number;
  marketCap: number;
  pairCreatedAt?: string;
  holders?: number;
  safety?: { mintAuthority: boolean; freezeAuthority: boolean; lpBurnedPct?: number };
}
