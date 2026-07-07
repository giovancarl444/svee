// Build demo/proof-pack.html — a single, self-contained page (screenshots inlined
// as base64, no external assets) tying together the proof: what was stood up, the
// generated brief, the scored benchmark, and the mobile screenshots.
//
//   node scripts/build-proof-pack.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = join(ROOT, 'demo');
const SHOTS = join(DEMO, 'screenshots');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Minimal markdown pipe-table → HTML table. */
function tableToHtml(md) {
  const rows = md.trim().split('\n').filter((l) => l.trim().startsWith('|'));
  if (rows.length < 2) return `<pre>${esc(md)}</pre>`;
  const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const th = head.map((h) => `<th>${esc(h)}</th>`).join('');
  const trs = body
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c).replace(/`([^`]+)`/g, '<code>$1</code>')}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

const shotLabels = {
  'cortex-01-login.png': 'Login gate (auth enforced)',
  'cortex-02-priority.png': 'Priority — 10 items, model action-summaries',
  'cortex-03-tomorrow.png': 'Tomorrow — the generated brief',
  'cortex-04-inbox.png': 'Inbox',
  'cortex-05-loops.png': 'Open loops',
  'cortex-06-connectors.png': 'Connectors / Signals',
  'cortex-07-inspect.png': 'Audit — "what left the box" ($0)',
  'cortex-08-inspect-nomodelcall.png': 'Heuristic item — zero api_calls',
};

const shots = existsSync(SHOTS)
  ? readdirSync(SHOTS).filter((f) => f.endsWith('.png')).sort()
  : [];
const gallery = shots
  .map((f) => {
    const b64 = readFileSync(join(SHOTS, f)).toString('base64');
    return `<figure><img alt="${esc(f)}" src="data:image/png;base64,${b64}"><figcaption>${esc(shotLabels[f] ?? f)}</figcaption></figure>`;
  })
  .join('\n');

const benchmark = existsSync(join(DEMO, 'benchmark.md'))
  ? tableToHtml(readFileSync(join(DEMO, 'benchmark.md'), 'utf8').split('\n').filter((l) => l.includes('|')).join('\n'))
  : '<p><em>run <code>pnpm --filter @cortex/workers benchmark</code> to populate.</em></p>';

const brief = existsSync(join(DEMO, 'tomorrow-brief.md'))
  ? esc(readFileSync(join(DEMO, 'tomorrow-brief.md'), 'utf8'))
  : '(brief not exported)';

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CORTEX — proof of life</title>
<style>
  :root{--bg:#f4f3ee;--ink:#1a1a18;--mut:#6b6a63;--line:#dcdad2;--accent:#b4451f}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:960px;margin:0 auto;padding:48px 20px 96px}
  h1{font-size:34px;letter-spacing:-.5px;margin:0 0 4px}
  .sub{color:var(--mut);margin:0 0 32px}
  h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:44px 0 14px;border-bottom:1px solid var(--line);padding-bottom:8px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
  .stat{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .stat b{display:block;font-size:24px;letter-spacing:-.5px}
  .stat span{color:var(--mut);font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line)}
  th{background:#efeee7;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
  tr:last-child td{border-bottom:0}
  code{background:#eceae2;padding:1px 5px;border-radius:4px;font-size:.92em}
  pre{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px;white-space:pre-wrap;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px}
  figure{margin:0}
  figure img{width:100%;border:1px solid var(--line);border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  figcaption{color:var(--mut);font-size:12px;margin-top:7px;text-align:center}
  .accent{color:var(--accent)}
  .note{color:var(--mut);font-size:13px}
</style></head>
<body><div class="wrap">
  <h1>CORTEX <span class="accent">·</span> proof of life</h1>
  <p class="sub">The stack, stood up and run live for the first time — synthetic data, a local model, <b>$0</b>, on 127.0.0.1.</p>

  <h2>The run, in numbers</h2>
  <div class="stats">
    <div class="stat"><b>26</b><span>synthetic items ingested</span></div>
    <div class="stat"><b>35</b><span>classifications (incl. tier-2)</span></div>
    <div class="stat"><b>10</b><span>open loops</span></div>
    <div class="stat"><b>1</b><span>Tomorrow Plan brief</span></div>
    <div class="stat"><b>31</b><span>model calls (audited)</span></div>
    <div class="stat"><b class="accent">$0.000000</b><span>total model cost</span></div>
  </div>
  <p class="note">Model: Ollama <code>qwen2.5:7b-instruct</code>, fully on-box · Postgres 16 · Next.js 15 dashboard · read-only, no send path.</p>

  <h2>Scored local-model benchmark</h2>
  ${benchmark}
  <p class="note">Same ground-truth-labeled inbox, same redaction payload + triage schema for every model. Category accuracy over all attempted items; a model that returns no valid structured output scores as wrong.</p>

  <h2>The generated Tomorrow Plan (real brief, local model)</h2>
  <pre>${brief}</pre>

  <h2>What left the box (privacy invariant)</h2>
  <pre>api_calls.input_summary  ==  redaction-builder output  ==  {
  source, sender_display, sender_importance, timestamp, subject, snippet(&le;500)
}
0 rows leak body_text / a full chain · body at rest = AES-256-GCM ciphertext · holds for the local model.</pre>

  <h2>Screenshots (382px mobile, synthetic data)</h2>
  <div class="gallery">${gallery}</div>

  <p class="note" style="margin-top:40px">Reproduce end-to-end: <code>scripts/bootstrap.sh</code> · full write-up: <code>demo/REPORT.md</code></p>
</div></body></html>
`;

writeFileSync(join(DEMO, 'proof-pack.html'), html);
console.log(`wrote demo/proof-pack.html (${shots.length} screenshots inlined, ${(html.length / 1024).toFixed(0)} KB)`);
