/**
 * The persona-aware façade. One object that owns configuration, the resilient
 * HTTP client, and every resource. This is the public entry point:
 *
 *   const client = ImpactClient.fromEnv();
 *   const partners = await client.partners.list();
 *
 * Resources are lazily nothing-special — plain typed groupings over the same
 * HttpClient + context, so adding a new endpoint is a new small module + one
 * line here (see docs/EXTENDING.md).
 */
import { loadConfig, requireCredentials, activeVersion, type ImpactConfig, type LoadConfigOptions } from "./config.js";
import { HttpClient, type HttpDeps } from "./http.js";
import { createLogger, type Logger } from "./logger.js";
import { createContext, type ImpactContext } from "./context.js";
import { detectPersona, type PersonaDetection } from "./persona-detect.js";

import { ReportsResource } from "../resources/reports.js";
import { ActionsResource } from "../resources/actions.js";
import { ClicksResource } from "../resources/clicks.js";
import { PartnersResource } from "../resources/partners.js";
import { ProgramsResource } from "../resources/programs.js";
import { CatalogsResource } from "../resources/catalogs.js";
import { ConversionsResource } from "../resources/conversions.js";
import { TrackingLinksResource } from "../resources/tracking-links.js";
import { UniqueUrlsResource } from "../resources/unique-urls.js";
import { PromoCodesResource } from "../resources/promo-codes.js";

export interface ImpactClientDeps extends Partial<HttpDeps> {
  logger?: Logger;
}

export class ImpactClient {
  readonly config: ImpactConfig;
  readonly logger: Logger;
  readonly http: HttpClient;
  readonly context: ImpactContext;

  readonly reports: ReportsResource;
  readonly actions: ActionsResource;
  readonly clicks: ClicksResource;
  readonly partners: PartnersResource;
  readonly programs: ProgramsResource;
  readonly catalogs: CatalogsResource;
  readonly conversions: ConversionsResource;
  readonly trackingLinks: TrackingLinksResource;
  readonly uniqueUrls: UniqueUrlsResource;
  readonly promoCodes: PromoCodesResource;

  constructor(config: ImpactConfig, deps: ImpactClientDeps = {}) {
    this.config = config;
    this.logger = deps.logger ?? createLogger(config.logLevel, { comp: "impact", persona: config.persona });
    this.http = new HttpClient(config, { ...deps, logger: this.logger.child({ comp: "http" }) });
    this.context = createContext(this.http, config, this.logger);

    this.reports = new ReportsResource(this.context);
    this.actions = new ActionsResource(this.context);
    this.clicks = new ClicksResource(this.context);
    this.partners = new PartnersResource(this.context);
    this.programs = new ProgramsResource(this.context);
    this.catalogs = new CatalogsResource(this.context);
    this.conversions = new ConversionsResource(this.context);
    this.trackingLinks = new TrackingLinksResource(this.context);
    this.uniqueUrls = new UniqueUrlsResource(this.context);
    this.promoCodes = new PromoCodesResource(this.context);
  }

  /** Build from environment (.env.local / process.env). */
  static fromEnv(opts?: LoadConfigOptions, deps?: ImpactClientDeps): ImpactClient {
    return new ImpactClient(loadConfig(opts), deps);
  }

  /** The base path for the active persona, e.g. `/Advertisers/{SID}`. */
  basePath(): string {
    return this.context.basePath();
  }

  /** The pinned API version for the active persona. */
  version(): string {
    return activeVersion(this.config);
  }

  /** Auto-detect persona by probing Campaigns under each base path (§2). */
  detectPersona(): Promise<PersonaDetection> {
    requireCredentials(this.config);
    return detectPersona(this.http, this.config);
  }

  /**
   * Smoke test: an authenticated GET on Campaigns for the active persona.
   * Returns the HTTP status and a redacted identity string.
   */
  async smoke(): Promise<{ status: number; identity: string }> {
    requireCredentials(this.config);
    const res = await this.http.get<unknown>(this.context.path("Campaigns"), { query: { PageSize: 1 } });
    return { status: res.status, identity: this.http.describeIdentity() };
  }
}
