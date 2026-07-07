import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setEnvVar } from './env-file';

describe('setEnvVar (persists a minted token straight into .env)', () => {
  it('replaces an existing key in place and leaves the others intact', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'cortex-env-')), '.env');
    writeFileSync(p, 'A=1\nGMAIL_REFRESH_TOKEN=\nB=2\n');
    setEnvVar('GMAIL_REFRESH_TOKEN', 'tok-xyz', p);
    const out = readFileSync(p, 'utf8');
    expect(out).toContain('GMAIL_REFRESH_TOKEN=tok-xyz');
    expect(out).toContain('A=1');
    expect(out).toContain('B=2');
    // replaced, not appended
    expect(out.match(/GMAIL_REFRESH_TOKEN=/g)?.length).toBe(1);
  });

  it('appends a new key when absent, creating the file if missing', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'cortex-env-')), '.env');
    setEnvVar('OUTLOOK_REFRESH_TOKEN', 'r1', p);
    expect(readFileSync(p, 'utf8')).toContain('OUTLOOK_REFRESH_TOKEN=r1');
  });

  it('does not match a key that is only a prefix of the target', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'cortex-env-')), '.env');
    writeFileSync(p, 'GMAIL_REFRESH_TOKEN_OLD=keep\n');
    setEnvVar('GMAIL_REFRESH_TOKEN', 'new', p);
    const out = readFileSync(p, 'utf8');
    expect(out).toContain('GMAIL_REFRESH_TOKEN_OLD=keep');
    expect(out).toContain('GMAIL_REFRESH_TOKEN=new');
  });
});
