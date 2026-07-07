/**
 * `npm run twin:channels` — print the channel-readiness matrix: every surface the
 * engine prepares to the last click, the approval it queues, and the single action
 * Sphere performs on approval. The concrete answer to "is everything ready?".
 */
import { channelReadiness } from "../twin/channels.js";

const rows = channelReadiness();
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

console.log("SVEE//TWIN — channel readiness\n");
console.log(pad("CHANNEL", 42), pad("LAYER", 12), pad("APPROVAL", 20), "SPHERE EXECUTES");
console.log("-".repeat(120));
for (const r of rows) {
  console.log(pad(r.channel, 42), pad(r.layer, 12), pad(r.approvalType, 20), r.sphereExecutes);
}
console.log(
  `\nThe twin PREPARES all ${rows.length} channels to the last click and queues an approval.\n` +
    "Sphere (the approved executor, with the credentials) performs the final action — never the twin.",
);
