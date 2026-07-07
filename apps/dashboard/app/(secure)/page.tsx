import Link from 'next/link';
import { getPriorityItems } from '@/lib/queries';
import { fmtDateTime } from '@/lib/format';
import { EmptyState } from '@/app/components/EmptyState';
import { SectionHeader } from '@/app/components/Section';
import { doneAction, snoozeAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const rows = await getPriorityItems();
  const count = rows.length;

  return (
    <>
      <SectionHeader
        index="01 / PRIORITY"
        title="Today"
        note={count === 0 ? 'clear' : `${count} need${count === 1 ? 's' : ''} you`}
      />
      {count === 0 ? (
        <EmptyState line="Nothing needs you right now." sub="Connect Gmail to begin — Phase 1" />
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="hairline">
              <Link href={`/inspect/${r.id}`} className="block pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="meta">{r.source}</span>
                  <span className="meta">{fmtDateTime(r.timestamp)}</span>
                </div>
                <p className="mt-2 font-medium leading-snug">
                  {r.actionSummary || r.subject || '(no summary)'}
                </p>
                <p className="meta mt-1">
                  {r.senderName ?? 'unknown'}
                  {r.urgency >= 3 ? <span className="ml-2 text-signal">· NOW</span> : null}
                </p>
              </Link>
              <div className="flex gap-4 pt-2 pb-4">
                <form action={doneAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="tab-index hover:text-ink">
                    ✓ done
                  </button>
                </form>
                <form action={snoozeAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="hours" value="24" />
                  <button type="submit" className="tab-index hover:text-ink">
                    ⤓ snooze 1d
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
