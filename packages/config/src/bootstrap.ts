import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * For CLI entrypoints (workers, migrate scripts): load a repo-root `.env` if one
 * exists, walking up from the current directory. No-ops in containers where env
 * is injected directly. NEVER call this from Next.js — Next loads its own env.
 */
export function loadLocalEnv(startDir: string = process.cwd()): void {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      try {
        process.loadEnvFile(candidate);
      } catch {
        /* malformed/unreadable — fall through to process.env as-is */
      }
      return;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
}
