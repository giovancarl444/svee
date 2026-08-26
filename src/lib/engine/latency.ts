import { ENGINE } from "./constants";

/** Samples simulated network latency; caller sleeps this long so the UI feels real. */
export function sampleLatencyMs(): number {
  const { LATENCY_MIN_MS, LATENCY_MAX_MS } = ENGINE;
  return Math.round(LATENCY_MIN_MS + Math.random() * (LATENCY_MAX_MS - LATENCY_MIN_MS));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
