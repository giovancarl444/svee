import Link from 'next/link';
import { getDeepLinkMap, getInboxItems } from '@/lib/queries';
import { fmtDateTime } from '@/lib/format';
import { EmptyState } from '@/app/components/EmptyState';
import { SectionHeader } from '@/app/components/Section';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const rows = await getInboxItems();
  const links = await getDeepLinkMap(rows.map((r) => r.id));

  return (
    <>
      <SectionHeader
        index="03 / STREAM"
        title="Inbox"
        note={rows.length === 0 ? 'empty' : `${rows.length} items`}
      />
      {rows.length === 0 ? (
        <EmptyState
          line="Nothing ingested yet."
          sub="All sources, one chronological stream — Phase 1"
        />
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="hairline">
              <Link href={`/inspect/${r.id}`} className="block pt-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="meta">{r.source}</span>
                  <span className="meta">{fmtDateTime(r.timestamp)}</span>
                </div>
                <p className="mt-1 leading-snug">{r.subject || '(no subject)'}</p>
                <p className="meta mt-1">{r.senderName ?? 'unknown'}</p>
              </Link>
              <div className="flex gap-4 pb-3 pt-1">
                {links.get(r.id) ? (
                  <a
                    href={links.get(r.id) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="tab-index hover:text-ink"
                  >
                    ↗ open
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
