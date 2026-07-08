import { getLatestBrief } from '@/lib/queries';
import { fmtDate } from '@/lib/format';
import { EmptyState } from '@/app/components/EmptyState';
import { Markdown } from '@/app/components/Markdown';
import { SectionHeader } from '@/app/components/Section';

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
        <EmptyState line="No plan yet." sub="The nightly synthesis writes this each evening" />
      ) : (
        <article className="hairline pt-6">
          <Markdown content={brief.contentMd} />
        </article>
      )}
    </>
  );
}
