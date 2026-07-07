/**
 * Idempotent upsert wrappers: map API objects → rows, drop un-keyable rows,
 * and UPSERT on the natural key. Re-running never duplicates.
 */
import type { Database } from "./db.js";
import {
  actionToRow,
  clickToRow,
  partnerToRow,
  contractToRow,
  catalogItemToRow,
  reportRowToDaily,
} from "./mappers.js";
import type { Action, Click, MediaPartner, Contract, CatalogItem, ReportRow } from "../types/impact.js";

function rows<T>(items: T[], map: (t: T) => import("./db.js").Row | null) {
  return items.map(map).filter((r): r is import("./db.js").Row => r !== null);
}

export const upsertActions = (db: Database, items: Action[]) =>
  db.upsert("actions", rows(items, actionToRow), ["id"]);

export const upsertClicks = (db: Database, items: Click[]) =>
  db.upsert("clicks", rows(items, clickToRow), ["id"]);

export const upsertPartners = (db: Database, items: MediaPartner[]) =>
  db.upsert("partners", rows(items, partnerToRow), ["media_id"]);

export const upsertContracts = (db: Database, items: Contract[]) =>
  db.upsert("contracts", rows(items, contractToRow), ["id"]);

export const upsertCatalogItems = (db: Database, catalogId: string, items: CatalogItem[]) =>
  db.upsert("catalog_items", rows(items, (it) => catalogItemToRow(catalogId, it)), ["catalog_id", "catalog_item_id"]);

export const upsertDailyPerformance = (db: Database, reportRows: ReportRow[]) =>
  db.upsert("daily_performance", rows(reportRows, reportRowToDaily), ["day", "media_id", "campaign_id"]);
