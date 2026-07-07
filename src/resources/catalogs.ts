/**
 * Product catalogs and their items. Item counts can be large, so items are
 * always exposed as an async iterator.
 */
import type { ImpactContext } from "../client/context.js";
import { paginate, collect } from "../client/pagination.js";
import type { QueryParams } from "../client/http.js";
import { DATA_KEYS } from "./params.js";
import type { Catalog, CatalogItem } from "../types/impact.js";

export class CatalogsResource {
  constructor(private readonly ctx: ImpactContext) {}

  /** All catalogs for this account. */
  async list(query?: QueryParams): Promise<Catalog[]> {
    return collect(
      paginate<Catalog>(this.ctx.http, this.ctx.path("Catalogs"), { dataKey: DATA_KEYS.catalogs, query }),
    );
  }

  async get(catalogId: string): Promise<Catalog> {
    const res = await this.ctx.http.get<Record<string, unknown>>(this.ctx.path("Catalogs", catalogId));
    const body = res.data;
    const nested = body[DATA_KEYS.catalogs] ?? body.Catalog;
    return (Array.isArray(nested) ? nested[0] : (nested ?? body)) as Catalog;
  }

  /** Iterate every item in a catalog (transparently paged). */
  items(catalogId: string, query?: QueryParams): AsyncGenerator<CatalogItem, void, void> {
    return paginate<CatalogItem>(this.ctx.http, this.ctx.path("Catalogs", catalogId, "Items"), {
      dataKey: DATA_KEYS.catalogItems,
      pageSize: 1000,
      query,
    });
  }

  async listItems(catalogId: string, limit = Infinity, query?: QueryParams): Promise<CatalogItem[]> {
    return collect(this.items(catalogId, query), limit);
  }
}
