import { apiOk } from "@/lib/api/respond";
import { historyLength } from "@/lib/market-data/history";

export const dynamic = "force-dynamic";

/** GET /api/debug/history — recorder buffer sizes (dev diagnostics). */
export async function GET() {
  const g = globalThis as typeof globalThis & {
    __sveePriceHistory?: Map<string, unknown[]>;
  };
  const sizes: Record<string, number> = {};
  for (const [k, v] of g.__sveePriceHistory ?? []) {
    sizes[k] = v.length;
  }
  return apiOk({
    buffers: sizes,
    hasGlobal: Boolean(g.__sveePriceHistory),
    historyLengthProbe: historyLength(
      "solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    ),
  });
}
