export { ImapAdapter } from './adapter';
export { imapMessageToNormalized } from './normalize';
export {
  makeImapFetcher,
  buildImapAuth,
  type ImapFetcher,
  type ImapConfig,
  type ImapCheckpoint,
  type ParsedImapMessage,
} from './imap-client';
export {
  makeMicrosoftTokenProvider,
  microsoftAuthUrl,
  exchangeMicrosoftCode,
  OUTLOOK_IMAP_HOST,
  OUTLOOK_IMAP_PORT,
  OUTLOOK_SCOPES,
  type MicrosoftOAuthConfig,
} from './outlook-oauth';
