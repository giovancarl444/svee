export { ImapAdapter } from './adapter';
export { imapMessageToNormalized } from './normalize';
export {
  makeImapFetcher,
  type ImapFetcher,
  type ImapConfig,
  type ImapCheckpoint,
  type ParsedImapMessage,
} from './imap-client';
