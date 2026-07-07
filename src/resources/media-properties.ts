/**
 * Media Properties (partner/publisher persona): the partner's own tracked
 * properties — websites, apps, paid-search accounts. Not present on the brand
 * persona.
 *
 * VERIFY the path (/Mediapartners/{SID}/MediaProperties) and the envelope key
 * against the Media Properties reference.
 */
import type { ImpactContext } from "../client/context.js";
import { paginate, collect } from "../client/pagination.js";
import type { QueryParams } from "../client/http.js";
import { DATA_KEYS } from "./params.js";
import type { MediaProperty } from "../types/impact.js";

export class MediaPropertiesResource {
  constructor(private readonly ctx: ImpactContext) {}

  iterate(query?: QueryParams): AsyncGenerator<MediaProperty, void, void> {
    return paginate<MediaProperty>(this.ctx.http, this.ctx.path("MediaProperties"), {
      dataKey: DATA_KEYS.mediaProperties,
      pageSize: 500,
      query,
    });
  }

  async list(query?: QueryParams): Promise<MediaProperty[]> {
    return collect(this.iterate(query));
  }

  async get(id: string): Promise<MediaProperty> {
    const res = await this.ctx.http.get<Record<string, unknown>>(this.ctx.path("MediaProperties", id));
    const body = res.data;
    const nested = body[DATA_KEYS.mediaProperties] ?? body.MediaProperty;
    return (Array.isArray(nested) ? nested[0] : (nested ?? body)) as MediaProperty;
  }
}
