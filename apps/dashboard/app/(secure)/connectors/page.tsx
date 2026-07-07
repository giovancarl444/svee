import { SOURCES } from '@cortex/core';
import { getConnectors, getDbHealth, getRecentApiCalls } from '@/lib/queries';
import { fmtDateTime } from '@/lib/format';
import { SectionHeader } from '@/app/components/Section';

export const dynamic = 'force-dynamic';

export default async function ConnectorsPage() {
  const [health, connectors, apiCalls] = await Promise.all([
    getDbHealth(),
    getConnectors(),
    getRecentApiCalls(),
  ]);

  const bySource = new Map(connectors.map((c) => [c.source, c]));

  return (
    <>
      <SectionHeader index="05 / SIGNALS" title="Connectors" note="health · auth · what left the box" />

      {/* Datastore health */}
      <section className="hairline py-4">
        <div className="flex items-baseline justify-between">
          <span className="meta">datastore</span>
          <span className={`meta ${health.ok ? 'text-ink' : 'text-signal'}`}>
            {health.ok ? 'CONNECTED' : 'UNREACHABLE'}
          </span>
        </div>
        {!health.ok && health.error ? (
          <p className="meta mt-2 normal-case text-signal">{health.error}</p>
        ) : null}
      </section>

      {/* Per-adapter status (one row per known source; all disconnected in Phase 0) */}
      <section className="pt-6">
        <span className="meta">adapters</span>
        <ul className="mt-2">
          {SOURCES.map((source) => {
            const c = bySource.get(source);
            const connected = Boolean(c?.enabled);
            return (
              <li key={source} className="hairline flex items-baseline justify-between py-3">
                <span className="font-medium">{source}</span>
                <span className="meta">
                  {c?.lastError ? (
                    <span className="text-signal">{c.lastError}</span>
                  ) : connected ? (
                    `SYNCED ${c?.lastSyncAt ? fmtDateTime(c.lastSyncAt) : '—'}`
                  ) : (
                    'not connected'
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* The "what left the box" audit log (Constraint §2/§10) */}
      <section className="pt-8">
        <span className="meta">api calls · sent to anthropic</span>
        {apiCalls.length === 0 ? (
          <p className="editorial mt-3 text-xl text-ink/70">Nothing has left the box yet.</p>
        ) : (
          <ul className="mt-2">
            {apiCalls.map((a) => (
              <li key={a.id} className="hairline py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="meta">{a.purpose}</span>
                  <span className="meta">{fmtDateTime(a.createdAt)}</span>
                </div>
                <p className="meta mt-1 normal-case">
                  {a.model}
                  {a.costEstimate ? ` · $${a.costEstimate}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
