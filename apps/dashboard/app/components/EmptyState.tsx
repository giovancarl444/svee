/** The calm, editorial empty state — Instrument Serif italic, per the aesthetic. */
export function EmptyState({ line, sub }: { line: string; sub?: string }) {
  return (
    <div className="hairline pt-8">
      <p className="editorial text-2xl leading-snug text-ink/80">{line}</p>
      {sub ? <p className="tab-index mt-4">{sub}</p> : null}
    </div>
  );
}
