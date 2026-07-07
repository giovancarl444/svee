/**
 * Actions = tracked conversions/events. Read layer: list (paginated), get one,
 * and an incremental "since a date" helper for sync watermarks.
 */
import type { ImpactContext } from "../client/context.js";
import { paginate, collect } from "../client/pagination.js";
import type { QueryParams } from "../client/http.js";
import { ACTION_PARAMS, DATA_KEYS } from "./params.js";
import { toImpactDateTime } from "../util/date.js";
import type { Action } from "../types/impact.js";

export interface ActionListFilters {
  startDate?: Date;
  endDate?: Date;
  campaignId?: string;
  mediaId?: string;
  actionTrackerId?: string;
  state?: string;
  pageSize?: number;
  /** Any additional/experimental params passed straight through. */
  extra?: QueryParams;
}

export class ActionsResource {
  constructor(private readonly ctx: ImpactContext) {}

  /** Async iterator over all matching actions (transparently paged). */
  iterate(filters: ActionListFilters = {}): AsyncGenerator<Action, void, void> {
    return paginate<Action>(this.ctx.http, this.ctx.path("Actions"), {
      dataKey: DATA_KEYS.actions,
      pageSize: filters.pageSize ?? 500,
      query: this.buildQuery(filters),
    });
  }

  /** Collect matching actions into an array (optionally capped). */
  async list(filters: ActionListFilters = {}, limit = Infinity): Promise<Action[]> {
    return collect(this.iterate(filters), limit);
  }

  /** Fetch a single action by impact id. */
  async get(actionId: string): Promise<Action> {
    const res = await this.ctx.http.get<Record<string, unknown>>(this.ctx.path("Actions", actionId));
    // Detail endpoints sometimes wrap the object under its resource key.
    const body = res.data as Record<string, unknown>;
    const nested = body[DATA_KEYS.actions] ?? body.Action;
    return (Array.isArray(nested) ? nested[0] : (nested ?? body)) as Action;
  }

  /** Incremental pull: everything since `since` (for sync watermarks). */
  iterateSince(since: Date, filters: Omit<ActionListFilters, "startDate"> = {}): AsyncGenerator<Action, void, void> {
    return this.iterate({ ...filters, startDate: since });
  }

  private buildQuery(filters: ActionListFilters): QueryParams {
    const q: QueryParams = { ...filters.extra };
    if (filters.startDate) q[ACTION_PARAMS.startDate] = toImpactDateTime(filters.startDate);
    if (filters.endDate) q[ACTION_PARAMS.endDate] = toImpactDateTime(filters.endDate);
    if (filters.campaignId) q[ACTION_PARAMS.campaignId] = filters.campaignId;
    if (filters.mediaId) q[ACTION_PARAMS.mediaId] = filters.mediaId;
    if (filters.actionTrackerId) q[ACTION_PARAMS.actionTrackerId] = filters.actionTrackerId;
    if (filters.state) q[ACTION_PARAMS.state] = filters.state;
    return q;
  }
}
