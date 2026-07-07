import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Path to the repo-root `.env` (…/apps/workers/src/env-file.ts → up 3 dirs). */
export function repoEnvPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../.env');
}

/**
 * Set (or replace) a single `KEY=value` line in `.env`, creating the file if
 * absent. Used by the OAuth flows to persist a minted refresh token straight into
 * `.env` so the operator never copies anything. The caller MUST NOT log the value
 * (Constraint §3) — this writes it to `.env` and nowhere else.
 */
export function setEnvVar(key: string, value: string, envPath: string = repoEnvPath()): void {
  const line = `${key}=${value}`;
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `${line}\n`);
    return;
  }
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const i = lines.findIndex((l) => l.match(/^([A-Z0-9_]+)=/)?.[1] === key);
  if (i >= 0) lines[i] = line;
  else {
    // keep a single trailing newline tidy
    if (lines.length && lines[lines.length - 1] === '') lines.splice(lines.length - 1, 0, line);
    else lines.push(line);
  }
  writeFileSync(envPath, lines.join('\n'));
}
