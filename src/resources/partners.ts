/**
 * Partners (brand/advertiser persona): the media partners you work with, plus
 * their contracts. On the partner persona you'd use `programs.ts` instead.
 */
import type { ImpactContext } from "../client/context.js";
import { paginate, collect } from "../client/pagination.js";
import type { QueryParams } from "../client/http.js";
import { DATA_KEYS } from "./params.js";
import type { MediaPartner, Contract } from "../types/impact.js";

export class PartnersResource {
  constructor(private readonly ctx: ImpactContext) {}

  /** All media partners for this advertiser. */
  iterate(query?: QueryParams): AsyncGenerator<MediaPartner, void, void> {
    return paginate<MediaPartner>(this.ctx.http, this.ctx.path("MediaPartners"), {
      dataKey: DATA_KEYS.mediaPartners,
      pageSize: 500,
      query,
    });
  }

  async list(query?: QueryParams): Promise<MediaPartner[]> {
    return collect(this.iterate(query));
  }

  async get(mediaId: string): Promise<MediaPartner> {
    const res = await this.ctx.http.get<Record<string, unknown>>(this.ctx.path("MediaPartners", mediaId));
    const body = res.data;
    const nested = body[DATA_KEYS.mediaPartners] ?? body.MediaPartner;
    return (Array.isArray(nested) ? nested[0] : (nested ?? body)) as MediaPartner;
  }

  /** Contracts (partnership agreements) for this advertiser. */
  contracts(query?: QueryParams): AsyncGenerator<Contract, void, void> {
    return paginate<Contract>(this.ctx.http, this.ctx.path("Contracts"), {
      dataKey: DATA_KEYS.contracts,
      pageSize: 500,
      query,
    });
  }

  async listContracts(query?: QueryParams): Promise<Contract[]> {
    return collect(this.contracts(query));
  }
}
