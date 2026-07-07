import type { Category, Direction, NormalizedItem, Recipient, SourceName, Urgency } from '@cortex/core';

/**
 * A fully SYNTHETIC, ground-truth-labeled inbox for the autonomous demo
 * (CORTEX_DEMO=1). Every item here is fictional — no real person, address, or
 * message. Each carries a `label` (the category + urgency a competent triager
 * SHOULD assign); the label is NEVER sent to a model — it is metadata the Phase F
 * benchmark scores the real pipeline against. Items flow through the REAL repo
 * layer (upsertItem → column encryption → bulk/scheduling heuristics → triage),
 * so this exercises the whole pipeline exactly as a live inbox would.
 */
export interface DemoLabel {
  category: Category;
  urgency: Urgency;
}
export interface DemoSeedItem extends NormalizedItem {
  label: DemoLabel;
}

const OPERATOR = { name: 'You', handle: 'operator@cortex.local' };
const HOUR = 3_600_000;

interface Spec {
  source: SourceName;
  id: string;
  thread?: string;
  dir?: Direction; // default 'inbound'
  party: string; // the non-operator display name
  handle: string; // the non-operator handle (email / phone / wa jid)
  subject?: string;
  body: string;
  snippet?: string;
  hoursAgo?: number; // default 6
  at?: Date; // absolute timestamp override (calendar events)
  bulk?: boolean;
  hasAttachments?: boolean;
  category: Category;
  urgency: Urgency;
}

function mk(now: Date, s: Spec): DemoSeedItem {
  const outbound = s.dir === 'outbound';
  const timestamp = s.at ?? new Date(now.getTime() - (s.hoursAgo ?? 6) * HOUR);
  const other = { displayName: s.party, handle: s.handle };
  const recipients: Recipient[] = outbound
    ? [{ kind: 'to', handle: s.handle, name: s.party }]
    : [{ kind: 'to', handle: OPERATOR.handle, name: OPERATOR.name }];
  const snippet = s.snippet ?? s.body.replace(/\s+/g, ' ').trim().slice(0, 240);
  return {
    source: s.source,
    sourceItemId: s.id,
    ...(s.thread ? { sourceThreadId: s.thread } : {}),
    direction: s.dir ?? 'inbound',
    sender: outbound ? { displayName: OPERATOR.name, handle: OPERATOR.handle } : other,
    recipients,
    timestamp,
    ...(s.subject ? { subject: s.subject } : {}),
    bodyText: s.body,
    bodySnippet: snippet,
    hasAttachments: s.hasAttachments ?? false,
    attachments: [],
    ...(s.bulk ? { bulk: true } : {}),
    raw: { demo: true, source: s.source, id: s.id },
    label: { category: s.category, urgency: s.urgency },
  };
}

/** Build the labeled synthetic inbox relative to `now` (so deadlines/events are live). */
export function buildDemoInbox(now: Date = new Date()): DemoSeedItem[] {
  const tomorrow = (h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const inDays = (n: number, h = 17) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    d.setHours(h, 0, 0, 0);
    return d;
  };

  return [
    // ---- gmail: action_required with hard deadlines --------------------------
    mk(now, {
      source: 'gmail', id: 'g-lease-001', thread: 't-lease',
      party: 'Marisol Vane (Brightgate Realty)', handle: 'marisol@brightgate-realty.example',
      subject: 'Signed lease renewal needed by tomorrow 5pm',
      body: 'Hi — to hold your current rent we need the signed renewal back by 5pm tomorrow. The DocuSign link expires after that and the unit goes back on the market. Let me know if anything blocks you.',
      hoursAgo: 4, category: 'action_required', urgency: 3,
      snippet: 'To hold your current rent we need the signed renewal back by 5pm tomorrow; the link expires after that.',
    }),
    mk(now, {
      source: 'gmail', id: 'g-invoice-002',
      party: 'Acme Billing', handle: 'billing@acme-tools.example',
      subject: 'Invoice #4021 — $2,400 due Friday',
      body: 'Your invoice #4021 for $2,400.00 is due this Friday. Late payments incur a 3% fee. Pay via the portal or reply to arrange terms.',
      hoursAgo: 20, hasAttachments: true, category: 'financial', urgency: 2,
    }),
    mk(now, {
      source: 'gmail', id: 'g-passport-003',
      party: 'City Passport Office', handle: 'no-reply@passport.gov.example',
      subject: 'Action required: appointment confirmation',
      body: 'You must confirm your passport-renewal appointment within 48 hours or it will be released. Confirm using your reference PR-88213.',
      hoursAgo: 30, category: 'action_required', urgency: 2,
    }),
    // ---- gmail: awaiting_reply (operator is waiting on them) -----------------
    mk(now, {
      source: 'gmail', id: 'g-contract-004', thread: 't-contract', dir: 'outbound',
      party: 'Dana Okafor', handle: 'dana@northwind-legal.example',
      subject: 'Re: Countersignature on the MSA',
      body: 'Dana — sending the fully signed MSA over now. Could you get the countersignature back this week so we can start Monday? Thanks.',
      hoursAgo: 26, category: 'awaiting_reply', urgency: 2,
    }),
    // ---- gmail: newsletter / promo (bulk → pre-model heuristic) --------------
    mk(now, {
      source: 'gmail', id: 'g-news-005', bulk: true,
      party: 'The Terminal Weekly', handle: 'newsletter@terminalweekly.example',
      subject: 'Issue #204: the rise of local models',
      body: 'This week: running LLMs on your own hardware, five CLI tricks, and a reader Q&A. Unsubscribe any time.',
      hoursAgo: 12, category: 'newsletter_promo', urgency: 0,
    }),
    mk(now, {
      source: 'gmail', id: 'g-promo-006', bulk: true,
      party: 'Kettle & Co', handle: 'deals@kettleandco.example',
      subject: '⏰ 30% off ends tonight',
      body: 'Final hours — 30% off sitewide with code WARMUP30. List-Unsubscribe below.',
      hoursAgo: 9, category: 'newsletter_promo', urgency: 0,
    }),
    // ---- gmail: fyi ----------------------------------------------------------
    mk(now, {
      source: 'gmail', id: 'g-receipt-007',
      party: 'Rideshare Receipts', handle: 'receipts@ride.example',
      subject: 'Your Tuesday trip receipt',
      body: 'Trip total $18.40. Thanks for riding. No action needed.',
      hoursAgo: 40, category: 'fyi', urgency: 0,
    }),

    // ---- imap (work / Outlook): action_required + awaiting_reply -------------
    mk(now, {
      source: 'imap', id: 'i-deck-101', thread: 't-deck',
      party: 'Priya Raman', handle: 'priya@ourstartup.example',
      subject: 'Board deck: your slides by Thu EOD',
      body: 'Can you get slides 8–12 (metrics + roadmap) into the board deck by Thursday end of day? Rehearsal is Friday morning.',
      hoursAgo: 5, category: 'action_required', urgency: 2,
    }),
    mk(now, {
      source: 'imap', id: 'i-review-102', dir: 'outbound', thread: 't-review',
      party: 'Sam Lindqvist', handle: 'sam@ourstartup.example',
      subject: 'Re: PR #318 review',
      body: 'Sam — left comments on PR #318, waiting on your changes before I can approve and merge. No rush but ideally before the release cut.',
      hoursAgo: 8, category: 'awaiting_reply', urgency: 1,
    }),
    mk(now, {
      source: 'imap', id: 'i-it-103',
      party: 'IT Security', handle: 'itsec@ourstartup.example',
      subject: 'Reminder: rotate your VPN cert this week',
      body: 'A reminder that VPN certificates expire Sunday. Rotate from the self-service portal; it takes two minutes.',
      hoursAgo: 15, category: 'action_required', urgency: 1,
    }),
    mk(now, {
      source: 'imap', id: 'i-allhands-104', bulk: true,
      party: 'People Ops', handle: 'noreply@ourstartup.example',
      subject: 'All-hands recording + notes',
      body: 'Missed the all-hands? Recording and notes are posted. This is an automated notification.',
      hoursAgo: 22, category: 'newsletter_promo', urgency: 0,
    }),
    mk(now, {
      source: 'imap', id: 'i-1on1-105',
      party: 'Priya Raman', handle: 'priya@ourstartup.example',
      subject: 'Notes from our 1:1',
      body: 'Good chat today — sharing the notes for your reference. Nothing needed from you.',
      hoursAgo: 44, category: 'fyi', urgency: 0,
    }),

    // ---- whatsapp: personal + scheduling + a real ask ------------------------
    mk(now, {
      source: 'whatsapp', id: 'w-dinner-201', thread: 't-dinner',
      party: 'Noah', handle: '15551234567@s.whatsapp.net',
      body: "Still on for dinner Saturday? Booked 7:30 at the ramen place — just confirm and I'll keep it.",
      hoursAgo: 3, category: 'scheduling', urgency: 1,
    }),
    mk(now, {
      source: 'whatsapp', id: 'w-plumber-202',
      party: 'Building Super', handle: '15557654321@s.whatsapp.net',
      body: 'Plumber can come tomorrow between 9 and 11 to fix the leak but I need you to confirm someone will be home.',
      hoursAgo: 2, category: 'action_required', urgency: 2,
    }),
    mk(now, {
      source: 'whatsapp', id: 'w-photo-203',
      party: 'Mum', handle: '15550001111@s.whatsapp.net',
      body: 'Found this photo of you from 2009 😂 no need to reply, just made me smile',
      hoursAgo: 18, category: 'personal', urgency: 0,
    }),
    mk(now, {
      source: 'whatsapp', id: 'w-loan-204', dir: 'outbound',
      party: 'Theo', handle: '15552223333@s.whatsapp.net',
      body: "Hey — did the £40 I sent you last week come through? Just checking, no worries.",
      hoursAgo: 30, category: 'awaiting_reply', urgency: 1,
    }),

    // ---- calendar: tomorrow's events (source=calendar → scheduling heuristic)-
    mk(now, {
      source: 'calendar', id: 'c-standup-301',
      party: 'Team Standup', handle: 'ourstartup.example_standup@group.calendar',
      subject: 'Daily standup',
      body: 'Daily standup — 15 min. Video link in the invite.',
      at: tomorrow(9, 30), category: 'scheduling', urgency: 1,
    }),
    mk(now, {
      source: 'calendar', id: 'c-dentist-302',
      party: 'Dr. Alvarez Dental', handle: 'appointments@alvarezdental.example',
      subject: 'Dentist — cleaning',
      body: 'Cleaning appointment. Please arrive 10 minutes early. Bring your insurance card.',
      at: tomorrow(15, 0), category: 'scheduling', urgency: 2,
    }),

    // ---- more action/financial to give the brief substance -------------------
    mk(now, {
      source: 'gmail', id: 'g-tax-008',
      party: 'Bók Accounting', handle: 'anna@bok-accounting.example',
      subject: 'Docs needed to file before the deadline',
      body: 'To file on time I need your Q2 expense export and the two 1099s. Deadline is the 15th; sooner is better so we can review.',
      at: inDays(6, 17), hoursAgo: 28, category: 'action_required', urgency: 2,
    }),
    mk(now, {
      source: 'gmail', id: 'g-bank-009',
      party: 'Northshore Bank', handle: 'alerts@northshorebank.example',
      subject: 'Large transaction alert: $1,250',
      body: 'A card transaction of $1,250.00 at "TravelFast" was approved. If this was not you, freeze your card in the app.',
      hoursAgo: 7, category: 'financial', urgency: 2,
    }),
    mk(now, {
      source: 'gmail', id: 'g-spam-010',
      party: 'Prize Center', handle: 'winner@luckyprize-blast.example',
      subject: 'CONGRATULATIONS you have been selected!!!',
      body: 'You are today’s lucky winner of a $1000 gift card. Click now to claim before it expires!!! Act fast!!!',
      hoursAgo: 11, category: 'spam_noise', urgency: 0,
    }),
    mk(now, {
      source: 'imap', id: 'i-conf-106',
      party: 'DevConf', handle: 'hello@devconf.example',
      subject: 'Your talk was accepted — confirm by Monday',
      body: 'Congratulations, your talk was accepted! Please confirm your slot by Monday and submit your final title and bio.',
      hoursAgo: 33, category: 'action_required', urgency: 2,
    }),
    mk(now, {
      source: 'gmail', id: 'g-fyi-011',
      party: 'Status Page', handle: 'status@cloudhost.example',
      subject: '[Resolved] Elevated latency in eu-west',
      body: 'The earlier elevated latency in eu-west has been fully resolved. No action needed.',
      hoursAgo: 26, category: 'fyi', urgency: 0,
    }),
    mk(now, {
      source: 'whatsapp', id: 'w-fyi-205',
      party: 'Gym', handle: '15559998888@s.whatsapp.net',
      body: 'Reminder: the pool is closed for maintenance this weekend. See you Monday!',
      hoursAgo: 20, category: 'fyi', urgency: 0,
    }),
    mk(now, {
      source: 'imap', id: 'i-promo-107', bulk: true,
      party: 'JetBrains-ish Deals', handle: 'sales@toolvendor.example',
      subject: 'Renew now and save 25%',
      body: 'Your license renews next month. Renew early and save 25%. Unsubscribe below.',
      hoursAgo: 48, category: 'newsletter_promo', urgency: 0,
    }),
    mk(now, {
      source: 'gmail', id: 'g-reply-012', dir: 'outbound',
      party: 'Recruiter (Halcyon)', handle: 'jobs@halcyon-recruiting.example',
      subject: 'Re: Next steps',
      body: 'Thanks for the update — sent my availability for next week, waiting to hear which slot works on your side.',
      hoursAgo: 34, category: 'awaiting_reply', urgency: 1,
    }),
  ];
}
