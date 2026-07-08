import type { ReactNode } from 'react';

/** The numbered, high-contrast section header used at the top of every view. */
export function SectionHeader({
  index,
  title,
  note,
}: {
  index: string;
  title: string;
  note?: ReactNode;
}) {
  return (
    <div className="pt-1 pb-6">
      <span className="tab-index">{index}</span>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      {note ? <p className="tab-index mt-2">{note}</p> : null}
    </div>
  );
}
