#!/usr/bin/env bash
# =============================================================================
# CORTEX — one-command autonomous demo: FREE + LOCAL (Ollama) + SYNTHETIC data.
#
#   scripts/bootstrap.sh
#
# Stands up Postgres + the dashboard, points triage/synthesis at a local model,
# seeds a synthetic labeled inbox, runs the real pipeline, and forces a Tomorrow
# Plan brief — entirely on-box, at $0, with no paid API key and no real account.
#
# Idempotent + safe to re-run. NEVER overwrites an existing secret, NEVER prints
# a secret value. Touches only 127.0.0.1.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MODEL="qwen2.5:7b-instruct"
say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

# --- 0. prerequisites --------------------------------------------------------
say "Checking prerequisites"
need() { command -v "$1" >/dev/null 2>&1 || { echo "MISSING: $1 — $2"; exit 1; }; }
need node "install Node >= 22"
need pnpm "npm i -g pnpm"
need ollama "https://ollama.com/download"
if docker compose version >/dev/null 2>&1; then DC="docker compose";
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose";
else echo "MISSING: docker compose / docker-compose"; exit 1; fi
docker info >/dev/null 2>&1 || { echo "Docker daemon not running (try: colima start, or open Docker Desktop)"; exit 1; }
echo "node $(node -v) · pnpm $(pnpm -v) · using: $DC"

# --- 1. deps -----------------------------------------------------------------
say "Installing workspace deps"; pnpm install --silent

# --- 2. .env + secrets (idempotent; never overwrites/echoes a secret) --------
say "Initializing .env"; node scripts/init-env.mjs

# --- 3. local model ----------------------------------------------------------
say "Ensuring local model ($MODEL) is available"
ollama list 2>/dev/null | grep -q "$MODEL" || ollama pull "$MODEL"
curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1 || { echo "Ollama not serving on :11434 — run 'ollama serve'"; exit 1; }

# --- 4. datastore + dashboard (built on first run, reused after) -------------
say "Bringing up db + migrate + dashboard (127.0.0.1 only)"
$DC up -d db migrate dashboard

say "Waiting for Postgres health + migrations"
for _ in $(seq 1 40); do
  docker inspect --format '{{.State.Health.Status}}' cortex-db-1 2>/dev/null | grep -q healthy && break; sleep 2
done
for _ in $(seq 1 40); do
  status=$(docker inspect --format '{{.State.Status}}' cortex-migrate-1 2>/dev/null || echo "")
  if [ "$status" = "exited" ]; then
    code=$(docker inspect --format '{{.State.ExitCode}}' cortex-migrate-1 2>/dev/null || echo 1)
    [ "$code" = "0" ] || { echo "migrate failed (exit $code)"; docker logs cortex-migrate-1 | tail -20; exit 1; }
    break
  fi
  sleep 2
done

say "Waiting for the dashboard"
for _ in $(seq 1 40); do curl -fsS -o /dev/null http://127.0.0.1:3000/login 2>/dev/null && break; sleep 2; done

# --- 5. seed + run the pipeline (HOST workers reach Ollama + published PG) ----
say "Running the pipeline on the synthetic inbox (ingest → triage → escalate → loops)"
pnpm --filter @cortex/workers sync
say "Forcing the Tomorrow Plan brief"
pnpm --filter @cortex/workers synthesize

# --- 6. done -----------------------------------------------------------------
say "Done — CORTEX is live and populated"
cat <<EOF

  Dashboard:   http://127.0.0.1:3000
  Login:       operator@cortex.local  /  ${CORTEX_DEMO_PASSWORD:-cortex-demo-2026}   (throwaway demo credential)
  Benchmark:   pnpm --filter @cortex/workers benchmark
  Screenshots: demo/screenshots/
  Report:      demo/REPORT.md

  Everything above ran locally, on synthetic data, at \$0 — no paid API key, no real account.
EOF
