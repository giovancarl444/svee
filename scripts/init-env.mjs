// Idempotent .env initializer for the CORTEX autonomous demo.
//
// - Creates .env from .env.example if absent.
// - Sets the FREE-LOCAL profile (Ollama qwen2.5:7b-instruct) + demo config.
// - Generates each secret ONLY if blank/placeholder — NEVER overwrites an existing
//   secret, NEVER prints a secret value (only masked confirmation).
// - The operator password hash is `$$`-escaped so docker-compose interpolation
//   does not eat the scrypt `$` delimiters. Demo password: $CORTEX_DEMO_PASSWORD
//   (default "cortex-demo-2026") — a throwaway that gates only the local synthetic
//   dashboard.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');
const EXAMPLE = join(ROOT, '.env.example');
const DEMO_PASSWORD = process.env.CORTEX_DEMO_PASSWORD || 'cortex-demo-2026';
const PLACEHOLDERS = new Set(['', 'change-me-in-a-real-env']);

if (!existsSync(ENV_PATH)) {
  copyFileSync(EXAMPLE, ENV_PATH);
  console.log('created .env from .env.example');
}

const lines = readFileSync(ENV_PATH, 'utf8').split('\n');
const idx = {};
lines.forEach((ln, i) => {
  const m = ln.match(/^([A-Z0-9_]+)=/);
  if (m) idx[m[1]] = i;
});
const get = (k) => (idx[k] == null ? undefined : lines[idx[k]].slice(k.length + 1));
const set = (k, v) => {
  const l = `${k}=${v}`;
  if (idx[k] != null) lines[idx[k]] = l;
  else {
    lines.push(l);
    idx[k] = lines.length - 1;
  }
};
const isBlank = (k) => {
  const v = get(k);
  return v === undefined || PLACEHOLDERS.has(v.trim());
};

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// --- non-secret config: the free, local, autonomous profile --------------------
set('NODE_ENV', 'development');
set('CORTEX_TZ', tz);
set('CORTEX_MODEL_PROVIDER', 'openai');
set('CORTEX_OPENAI_BASE_URL', 'http://localhost:11434/v1');
set('CORTEX_OPENAI_API_KEY', 'ollama');
set('CORTEX_MODEL_TRIAGE', 'qwen2.5:7b-instruct');
set('CORTEX_MODEL_ESCALATE', 'qwen2.5:7b-instruct');
set('CORTEX_MODEL_SYNTHESIS', 'qwen2.5:7b-instruct');
set('CORTEX_OPERATOR_EMAIL', 'operator@cortex.local');
set('CORTEX_DEMO', '1');
// wa-bridge's compose guard needs a non-empty token even though it never starts.
if (isBlank('WHATSAPP_BRIDGE_TOKEN')) set('WHATSAPP_BRIDGE_TOKEN', 'demo-unused-placeholder');

// --- secrets: generate ONLY if blank; never overwrite, never print -------------
const generated = [];
if (isBlank('POSTGRES_PASSWORD')) {
  const pw = randomBytes(16).toString('hex');
  set('POSTGRES_PASSWORD', pw);
  set('DATABASE_URL', `postgres://cortex:${pw}@localhost:5432/cortex`);
  generated.push('POSTGRES_PASSWORD', 'DATABASE_URL');
}
if (isBlank('CORTEX_ENCRYPTION_KEY')) {
  set('CORTEX_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  generated.push('CORTEX_ENCRYPTION_KEY');
}
if (isBlank('CORTEX_AUTH_SECRET')) {
  set('CORTEX_AUTH_SECRET', randomBytes(32).toString('base64'));
  generated.push('CORTEX_AUTH_SECRET');
}
if (isBlank('CORTEX_OPERATOR_PASSWORD_HASH')) {
  const salt = randomBytes(16);
  const hash = scryptSync(DEMO_PASSWORD, salt, 32);
  // `$$` so docker-compose interpolation yields the literal scrypt `$` delimiters.
  const stored = `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`.replace(/\$/g, '$$$$');
  set('CORTEX_OPERATOR_PASSWORD_HASH', stored);
  generated.push('CORTEX_OPERATOR_PASSWORD_HASH');
}

writeFileSync(ENV_PATH, lines.join('\n'));

console.log(`TZ=${tz}  provider=ollama/qwen2.5:7b-instruct  demo=on`);
console.log(`secrets generated this run: ${generated.join(', ') || '(none — all already present, left untouched)'}`);
console.log('operator login: operator@cortex.local / ' + DEMO_PASSWORD + '  (throwaway demo credential)');
