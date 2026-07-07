/**
 * Deferred (async) job runner for impact.com report/export endpoints.
 *
 * Large exports do NOT come back on the first call. The pattern is:
 *   1. submit  -> server returns a job envelope: { Status: "QUEUED", QueuedUri }
 *   2. poll     QueuedUri until Status is terminal (COMPLETED | FAILED | ...)
 *   3. download ResultUri when COMPLETED
 *
 * Some report requests answer synchronously (small result sets). This helper
 * detects that (a data array present, or Status already COMPLETED) and skips
 * straight to the result, so callers use one code path for both.
 *
 * VERIFY (docs egress blocked in this build): confirm the job field names
 * (Status / QueuedUri / ResultUri) and the status vocabulary against
 * .../reference/report-export + Deferred Response Overview. Centralised in
 * JOB / STATUS below.
 */
import type { HttpClient, QueryParams } from "./http.js";
import { ImpactError } from "./errors.js";
import type { Logger } from "./logger.js";
import { nullLogger } from "./logger.js";

export const JOB = {
  status: "Status",
  queuedUri: "QueuedUri",
  resultUri: "ResultUri",
  jobId: "Id",
} as const;

export const STATUS = {
  queued: ["QUEUED", "PENDING"],
  running: ["RUNNING", "PROCESSING", "IN_PROGRESS", "STARTED"],
  completed: ["COMPLETED", "SUCCESS", "SUCCEEDED", "DONE"],
  failed: ["FAILED", "ERROR", "CANCELED", "CANCELLED", "EXPIRED"],
} as const;

export interface JobEnvelope {
  [key: string]: unknown;
}

export type DownloadFormat = "json" | "text";

export interface DeferredOptions {
  query?: QueryParams;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  /** How to parse the downloaded result. CSV/TSV -> "text". */
  downloadAs?: DownloadFormat;
  logger?: Logger;
  /** Injectable sleep for tests (defaults to real setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock for deadline math (defaults to Date.now). */
  now?: () => number;
}

export interface DeferredResult<T> {
  data: T;
  /** How many poll iterations were performed (0 = returned synchronously). */
  polls: number;
  status: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function classify(status: string): "queued" | "running" | "completed" | "failed" | "unknown" {
  const s = status.toUpperCase();
  if ((STATUS.completed as readonly string[]).includes(s)) return "completed";
  if ((STATUS.failed as readonly string[]).includes(s)) return "failed";
  if ((STATUS.running as readonly string[]).includes(s)) return "running";
  if ((STATUS.queued as readonly string[]).includes(s)) return "queued";
  return "unknown";
}

function statusOf(env: JobEnvelope): string | undefined {
  const v = env[JOB.status];
  return typeof v === "string" ? v : undefined;
}

function looksSynchronous(env: JobEnvelope): boolean {
  // No job status field AND at least one array property => data came back inline.
  if (statusOf(env)) return false;
  return Object.entries(env).some(([k, v]) => !k.startsWith("@") && Array.isArray(v));
}

/**
 * Submit a deferred export and resolve with the downloaded result.
 * Works uniformly whether the endpoint responds synchronously or queues a job.
 */
export async function runDeferredExport<T = unknown>(
  http: HttpClient,
  submitPath: string,
  opts: DeferredOptions = {},
): Promise<DeferredResult<T>> {
  const pollIntervalMs = opts.pollIntervalMs ?? 2_000;
  const maxWaitMs = opts.maxWaitMs ?? 300_000;
  const downloadAs = opts.downloadAs ?? "json";
  const logger = opts.logger ?? nullLogger;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;

  const submit = await http.get<JobEnvelope>(submitPath, opts.query ? { query: opts.query } : {});
  const env = submit.data;

  if (looksSynchronous(env)) {
    logger.debug("deferred: synchronous response", { path: submitPath });
    return { data: env as unknown as T, polls: 0, status: "COMPLETED" };
  }

  const deadline = now() + maxWaitMs;
  let current = env;
  let polls = 0;

  for (;;) {
    const status = statusOf(current) ?? "UNKNOWN";
    const phase = classify(status);
    logger.debug("deferred: status", { path: submitPath, status, phase, polls });

    if (phase === "completed") {
      const resultUri = readUri(current, JOB.resultUri);
      if (!resultUri) {
        // Some endpoints inline the result under COMPLETED with no ResultUri.
        return { data: current as unknown as T, polls, status };
      }
      const data = await download<T>(http, resultUri, downloadAs);
      return { data, polls, status };
    }
    if (phase === "failed") {
      throw new ImpactError("server", `Deferred job ended with status ${status}.`, {
        path: submitPath,
        body: JSON.stringify(current).slice(0, 500),
      });
    }

    if (now() >= deadline) {
      throw new ImpactError(
        "deferred_timeout",
        `Deferred job did not complete within ${maxWaitMs}ms (last status: ${status}).`,
        { path: submitPath },
      );
    }

    const pollUri = readUri(current, JOB.queuedUri) ?? submitPath;
    // Bounded backoff: linear-ish growth capped so we keep polling near the deadline.
    const wait = Math.min(pollIntervalMs * (1 + polls * 0.25), Math.max(0, deadline - now()));
    await sleep(wait);
    polls++;
    const next = await http.get<JobEnvelope>(pollUri, {});
    current = next.data;
  }
}

function readUri(env: JobEnvelope, key: string): string | undefined {
  const v = env[key];
  return typeof v === "string" && v.trim().length ? v.trim() : undefined;
}

async function download<T>(http: HttpClient, uri: string, as: DownloadFormat): Promise<T> {
  if (as === "text") {
    const res = await http.get<string>(uri, { parse: "text", accept: "text/csv" });
    return res.data as unknown as T;
  }
  const res = await http.get<T>(uri, { accept: "application/json" });
  return res.data;
}
