/**
 * Load environment files for CLI/script entry points. `.env.local` wins over
 * `.env` (dotenv does not override already-set vars, so load local first).
 * Library consumers who manage their own env need not call this.
 */
import { config as dotenv } from "dotenv";

let loaded = false;

export function loadEnvFiles(): void {
  if (loaded) return;
  dotenv({ path: ".env.local" });
  dotenv({ path: ".env" });
  loaded = true;
}
