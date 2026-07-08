import { getOpenLoops } from '@/lib/queries';
import { fmtDate } from '@/lib/format';
import { EmptyState } from '@/app/components/EmptyState';
import { SectionHeader } from '@/app/components/Section';

export const dynamic = 'force-dynamic';

const LOOP_LABEL: Record<string, string> = {
  awaiting_reply_from_operator: 'you owe a reply',
  awaiting_reply_from_them: 'waiting on them',
  commitment_made: 'you committed',
  deadline_pending: 'deadline',
};

export default async function LoopsPage() {
  const rows = await getOpenLoops();
  const now = Date.now();

  return (
    <>
      <SectionHeader
        index="04 / OPEN"
        title="Loops"
        note={rows.length === 0 ? 'none open' : `${rows.length} open`}
      />
      {rows.length === 0 ? (
        <EmptyState line="No open loops." sub="What's owed, waiting, or overdue — Phase 2" />
      ) : (
        <ul>
          {rows.map((r) => {
            const overdue = r.dueAt ? r.dueAt.getTime() < now : false;
            return (
              <li key={r.id} className="hairline py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="meta">{LOOP_LABEL[r.type] ?? r.type}</span>
                  {r.dueAt ? (
                    <span className={`meta ${overdue ? 'text-signal' : ''}`}>
                      {overdue ? 'OVERDUE · ' : ''}
                      {fmtDate(r.dueAt)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 leading-snug">{r.description}</p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
