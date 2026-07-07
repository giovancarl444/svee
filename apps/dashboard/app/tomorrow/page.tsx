import { getLatestBrief } from '../../lib/queries';
import { fmtDate } from '../../lib/format';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/Section';

export const dynamic = 'force-dynamic';

export default async function TomorrowPage() {
  const brief = await getLatestBrief();

  return (
    <>
      <SectionHeader
        index="02 / PLAN"
        title="Tomorrow"
        note={brief ? `generated ${fmtDate(brief.createdAt)} · ${brief.model}` : 'not generated yet'}
      />
      {!brief ? (
        <EmptyState
          line="No plan yet."
          sub="The nightly synthesis writes this — Phase 2"
        />
      ) : (
        // Phase 2 renders content_md as markdown; plain for now.
        <article className="hairline whitespace-pre-wrap pt-8 leading-relaxed">
          {brief.contentMd}
        </article>
      )}
    </>
  );
}
