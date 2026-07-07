/**
 * Reports & report exports.
 *
 * Two surfaces:
 *   - list()            -> report metadata (ids you're allowed to run)
 *   - runExport(id,...) -> a report's rows, via the deferred submit→poll→download
 *                          helper (auto-handles sync small reports too)
 *
 * `performance()` is a convenience that DISCOVERS a performance report id from
 * the metadata at runtime (rather than hard-coding a guessed id) and runs it —
 * so it stays correct even though the exact report id could not be verified in
 * this build.
 */
import type { ImpactContext } from "../client/context.js";
import { paginate, collect } from "../client/pagination.js";
import { runDeferredExport, type DownloadFormat } from "../client/deferred.js";
import { REPORT_PARAMS, DATA_KEYS } from "./params.js";
import { toImpactDateTime, lastNDays, type DateRange } from "../util/date.js";
import type { ReportMeta, ReportRow } from "../types/impact.js";

export interface RunExportOptions {
  params?: Record<string, string | number>;
  downloadAs?: DownloadFormat;
  /** Envelope key holding the rows in the downloaded result. Auto-detected if omitted. */
  dataKey?: string;
}

export class ReportsResource {
  constructor(private readonly ctx: ImpactContext) {}

  /** List the reports this account may run via the API. */
  async list(): Promise<ReportMeta[]> {
    return collect(
      paginate<ReportMeta>(this.ctx.http, this.ctx.path("Reports"), { dataKey: DATA_KEYS.reports }),
    );
  }

  /** Find a report whose metadata matches a predicate (e.g. name contains "performance"). */
  async find(predicate: (r: ReportMeta) => boolean): Promise<ReportMeta | undefined> {
    const all = await this.list();
    return all.find(predicate);
  }

  /**
   * Run a report export by id and return its rows. Uses the deferred helper, so
   * both synchronous (small) and queued (large) reports resolve through one path.
   *
   * Uses /{base}/Reports/{id} (run report → JSON records). Confirmed against a
   * live partner account that /ReportExport/{id} returns 500; the run endpoint
   * returns data directly (the deferred helper still handles a queued response
   * if the server chooses to defer a large report).
   */
  async runExport(reportId: string, options: RunExportOptions = {}): Promise<ReportRow[]> {
    const query: Record<string, string | number> = {
      [REPORT_PARAMS.resultFormat]: "JSON",
      ...options.params,
    };
    const result = await runDeferredExport<Record<string, unknown>>(
      this.ctx.http,
      this.ctx.path("Reports", reportId),
      {
        query,
        pollIntervalMs: this.ctx.config.deferred.pollIntervalMs,
        maxWaitMs: this.ctx.config.deferred.maxWaitMs,
        downloadAs: options.downloadAs ?? "json",
        logger: this.ctx.logger,
      },
    );
    return extractRows(result.data, options.dataKey);
  }

  /** Build the standard date-range params for a report run. */
  dateParams(range: DateRange): Record<string, string> {
    return {
      [REPORT_PARAMS.startDate]: toImpactDateTime(range.start),
      [REPORT_PARAMS.endDate]: toImpactDateTime(range.end),
      [REPORT_PARAMS.timezone]: this.ctx.config.defaultTimezone,
    };
  }

  /**
   * Convenience: run a partner/performance report for the last N days.
   * Discovers the report id from metadata unless one is supplied.
   */
  async performance(opts: { days?: number; reportId?: string; range?: DateRange } = {}): Promise<ReportRow[]> {
    const range = opts.range ?? lastNDays(opts.days ?? 30);
    let reportId = opts.reportId;
    if (!reportId) {
      const meta = await this.find(
        (r) => /performance/i.test(String(r.Name ?? "")) && String(r.ApiAccessible ?? "true") !== "false",
      );
      if (!meta?.Id) {
        throw new Error(
          "Could not auto-discover a performance report id. Pass { reportId } (list() shows available ids).",
        );
      }
      reportId = meta.Id;
      this.ctx.logger.info("reports: discovered performance report", { reportId, name: meta.Name });
    }
    return this.runExport(reportId, { params: this.dateParams(range) });
  }
}

function extractRows(payload: unknown, dataKey?: string): ReportRow[] {
  if (Array.isArray(payload)) return payload as ReportRow[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (dataKey && Array.isArray(obj[dataKey])) return obj[dataKey] as ReportRow[];
    for (const [k, v] of Object.entries(obj)) {
      if (!k.startsWith("@") && Array.isArray(v)) return v as ReportRow[];
    }
  }
  return [];
}
