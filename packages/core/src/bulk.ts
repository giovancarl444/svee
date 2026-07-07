/**
 * Cheap header heuristics to detect bulk/automated mail BEFORE spending a model
 * call (spec §6: "Don't pay Haiku to tell you a newsletter is a newsletter").
 * Shared by every email adapter (Gmail, IMAP). Operates on a lowercased header map.
 */
export function isBulk(headers: Map<string, string>): boolean {
  // The single strongest signal: a one-click unsubscribe header.
  if (headers.has('list-unsubscribe') || headers.has('list-id')) return true;

  const precedence = headers.get('precedence')?.toLowerCase();
  if (precedence === 'bulk' || precedence === 'list' || precedence === 'junk') return true;

  const autoSubmitted = headers.get('auto-submitted')?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;

  // Common automated-sender patterns.
  const from = headers.get('from')?.toLowerCase() ?? '';
  if (/\bno-?reply@|\bdo-?not-?reply@|\bnoreply@|\bnotifications?@|\bmailer-daemon@/.test(from)) {
    return true;
  }

  // Bulk marketing platforms stamp these.
  if (headers.has('x-campaign') || headers.has('x-mailgun-sid') || headers.has('feedback-id')) {
    return true;
  }

  return false;
}
