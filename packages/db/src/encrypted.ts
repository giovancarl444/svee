import { customType } from 'drizzle-orm/pg-core';
import { decryptString, encryptString } from './crypto';

/**
 * A Drizzle `text` column that is transparently AES-256-GCM encrypted on write
 * and decrypted on read. Using a custom type (rather than remembering to call
 * encrypt/decrypt at every call site) makes "encrypted at rest" a structural
 * guarantee: there is no code path that writes a body column in plaintext.
 *
 * The ciphertext envelope is produced lazily — importing the schema does NOT
 * require the encryption key; only actually reading/writing a body does.
 */
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value: string): string {
    return encryptString(value);
  },
  fromDriver(value: string): string {
    return decryptString(value);
  },
});
