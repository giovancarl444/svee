import 'server-only';

/** Compact, mono-friendly timestamp in the operator's timezone: "07 JUL · 14:32". */
export function fmtDateTime(d: Date): string {
  const tz = process.env.CORTEX_TZ || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('day')} ${get('month')} · ${get('hour')}:${get('minute')}`.toUpperCase();
  } catch {
    return d.toISOString();
  }
}

/** "07 JUL" — date only. */
export function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const tz = process.env.CORTEX_TZ || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: tz,
    })
      .format(date)
      .toUpperCase();
  } catch {
    return String(d);
  }
}
