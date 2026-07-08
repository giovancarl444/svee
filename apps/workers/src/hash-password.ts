import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

/**
 * Generate CORTEX_OPERATOR_PASSWORD_HASH for the dashboard login. scrypt (built
 * into Node — no dependency). Format: `scrypt$<salt-b64>$<hash-b64>`. We never
 * store the plaintext password (Constraint §10).
 */
async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = (await rl.question('operator password: ')).trim();
  rl.close();
  if (!pw) throw new Error('empty password');

  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 32);
  console.log('\nAdd to your .env:\n');
  console.log(`CORTEX_OPERATOR_PASSWORD_HASH=scrypt$${salt.toString('base64')}$${hash.toString('base64')}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
