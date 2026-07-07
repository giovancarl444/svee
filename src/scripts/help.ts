/** Shared CLI help strings. */
export const CREDENTIAL_HELP = [
  "",
  "────────────────────────────────────────────────────────────────────────",
  " Missing impact.com credentials.",
  "",
  " 1. cp .env.local.example .env.local",
  " 2. Paste your SID + token into these lines in .env.local:",
  "",
  "        IMPACT_ACCOUNT_SID=<from app.impact.com → Settings → Technical → API>",
  "        IMPACT_AUTH_TOKEN=<paired auth token>",
  "",
  "    (AccountSID = Basic-auth username, AuthToken = password.)",
  " 3. Re-run this command.",
  "",
  " Nothing is committed: .env.local is gitignored.",
  "────────────────────────────────────────────────────────────────────────",
  "",
].join("\n");
