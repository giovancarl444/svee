import Link from 'next/link';
import { getItemAudit } from '@/lib/queries';
import { fmtDateTime } from '@/lib/format';
import { SectionHeader } from '@/app/components/Section';
import { importanceAction } from '../../actions';

export const dynamic = 'force-dynamic';

const IMPORTANCE_LABEL = ['mute', 'normal', 'important', 'VIP'];

export default async function InspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await getItemAudit(id);

  return (
    <>
      <SectionHeader index="AUDIT / WHAT LEFT THE BOX" title="Inspect" note={audit?.subject ?? id} />

      <Link href="/" className="tab-index hover:text-ink">
        ← back
      </Link>

      {audit?.senderId ? (
        <section className="hairline mt-4 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="meta">sender · {audit.senderName ?? 'unknown'}</span>
            <span className="meta">importance: {IMPORTANCE_LABEL[audit.senderImportance ?? 1]}</span>
          </div>
          <div className="mt-2 flex gap-3">
            {[0, 1, 2, 3].map((lvl) => (
              <form action={importanceAction} key={lvl}>
                <input type="hidden" name="entityId" value={audit.senderId ?? ''} />
                <input type="hidden" name="itemId" value={id} />
                <input type="hidden" name="importance" value={lvl} />
                <button
                  type="submit"
                  className={`tab-index hover:text-ink ${lvl === (audit.senderImportance ?? 1) ? 'text-ink' : ''}`}
                >
                  {IMPORTANCE_LABEL[lvl]}
                </button>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      {!audit || audit.calls.length === 0 ? (
        <p className="editorial mt-8 text-xl text-ink/70">Nothing was sent to Anthropic about this item.</p>
      ) : (
        <ul className="mt-6">
          {audit.calls.map((c, i) => (
            <li key={i} className="hairline py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="meta">{c.purpose}</span>
                <span className="meta">{fmtDateTime(c.createdAt)}</span>
              </div>
              <p className="meta mt-1 normal-case">
                {c.model}
                {c.costEstimate ? ` · $${c.costEstimate}` : ''}
              </p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words border border-ink/12 bg-bone-shadow/40 p-3 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(c.inputSummary, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
