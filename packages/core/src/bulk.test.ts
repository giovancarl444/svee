import { describe, expect, it } from 'vitest';
import { isBulk } from './bulk';

const hm = (o: Record<string, string>) =>
  new Map(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));

describe('isBulk', () => {
  it('flags List-Unsubscribe', () => {
    expect(isBulk(hm({ 'list-unsubscribe': '<mailto:u@x>' }))).toBe(true);
  });
  it('flags Precedence: bulk', () => {
    expect(isBulk(hm({ precedence: 'bulk' }))).toBe(true);
  });
  it('flags no-reply senders', () => {
    expect(isBulk(hm({ from: 'Acme <no-reply@acme.com>' }))).toBe(true);
    expect(isBulk(hm({ from: 'notifications@github.com' }))).toBe(true);
  });
  it('flags Auto-Submitted', () => {
    expect(isBulk(hm({ 'auto-submitted': 'auto-generated' }))).toBe(true);
  });
  it('does NOT flag a normal person', () => {
    expect(isBulk(hm({ from: 'Dana Whitfield <dana@acme.com>', subject: 'Q3' }))).toBe(false);
  });
});
