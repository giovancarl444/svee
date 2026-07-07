/**
 * The shared context every resource module receives. Depending on the concrete
 * ImpactClient through a narrow interface (rather than the class) keeps resource
 * modules free of import cycles and trivially unit-testable with a fake context.
 */
import type { HttpClient } from "./http.js";
import type { ImpactConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { basePathFor } from "./persona.js";

export interface ImpactContext {
  readonly http: HttpClient;
  readonly config: ImpactConfig;
  readonly logger: Logger;
  /** Persona+SID-scoped base path, e.g. `/Advertisers/{SID}`. */
  basePath(): string;
  /** Join resource segments onto the base path: `path("Actions", id)`. */
  path(...segments: Array<string | number>): string;
}

export function createContext(http: HttpClient, config: ImpactConfig, logger: Logger): ImpactContext {
  const base = basePathFor(config.persona, config.accountSid);
  return {
    http,
    config,
    logger,
    basePath: () => base,
    path: (...segments) => {
      const tail = segments
        .map((s) => String(s).replace(/^\/+|\/+$/g, ""))
        .filter((s) => s.length)
        .join("/");
      return tail ? `${base}/${tail}` : base;
    },
  };
}
