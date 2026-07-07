/**
 * `npm run twin:execute` — the executor entrypoint. Reads APPROVED approval rows
 * (Svee tapped approve, e.g. via Sphere/Cortex), builds a typed ExecutionPlan for
 * each, and hands them to the wired SphereExecutor.
 *
 * The twin ships with `StagingSphere`, which is INERT: it never performs the final
 * action — it returns a handoff. Swap in a real `SphereExecutor` (with credentials)
 * to actually submit/send on approval. This script is the seam where that happens.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadTwinConfig } from "../twin/config.js";
import { createTwinDatabase, approvedApprovals } from "../twin/store.js";
import { StagingSphere, planFromApproval, type SphereExecutor } from "../twin/sphere.js";
import type { ApprovalRequest } from "../twin/contracts.js";

/** Reconstruct an ApprovalRequest from a persisted twin_approvals row. */
function approvalFromRow(row: Record<string, unknown>): ApprovalRequest {
  const payload = (row.payload ?? {}) as {
    cover_letter?: string;
    screening_answers?: Array<{ q: string; a: string }>;
    missing_fields?: string[];
  };
  return {
    id: String(row.id),
    type: row.type as ApprovalRequest["type"],
    company: String(row.company ?? ""),
    role: String(row.role ?? ""),
    url: String(row.url ?? ""),
    channel: String(row.channel ?? ""),
    cv_variant: (row.cv_variant as ApprovalRequest["cv_variant"]) ?? null,
    cover_letter: payload.cover_letter ?? "",
    screening_answers: payload.screening_answers ?? [],
    missing_fields: payload.missing_fields ?? [],
    fit_score: Number(row.fit_score ?? 0),
    action_on_approve: String(row.action_on_approve ?? ""),
  };
}

async function main() {
  loadEnvFiles();
  const config = loadTwinConfig();
  if (config.db.driver === "none") {
    console.error("DB not configured. Set DB + DATABASE_URL to read the approval queue.");
    process.exit(1);
  }

  // Swap StagingSphere for your real executor here.
  const sphere: SphereExecutor = new StagingSphere();

  const db = createTwinDatabase(config);
  try {
    const rows = await approvedApprovals(db);
    if (!rows.length) {
      console.log("No approved actions to execute. (Approve rows in the queue first.)");
      return;
    }
    for (const row of rows) {
      const approval = approvalFromRow(row as Record<string, unknown>);
      const plan = planFromApproval(approval);
      const res = await sphere.execute(plan, { approved: true, live: config.live });
      console.log(`${plan.channel} · ${plan.action} · ${approval.company} — ${res.note}`);
      // A real SphereExecutor that actually performed the action would then call
      // markApprovalExecuted(db, plan.approvalId). StagingSphere performs nothing.
    }
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
