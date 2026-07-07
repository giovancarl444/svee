/**
 * Public API surface for the impact.com integration library.
 */
export { ImpactClient } from "./client/impact-client.js";
export { loadConfig, requireCredentials, hasCredentials, activeVersion } from "./client/config.js";
export type { ImpactConfig, VersionStrategy } from "./client/config.js";
export { HttpClient, parseRetryAfter } from "./client/http.js";
export type { HttpResponse, RequestOptions, QueryParams } from "./client/http.js";
export { ImpactError, isImpactError } from "./client/errors.js";
export type { ImpactErrorKind } from "./client/errors.js";
export { createLogger, nullLogger, redact, redactSecret } from "./client/logger.js";
export type { Logger, LogLevel } from "./client/logger.js";
export { paginate, collect, pageMeta } from "./client/pagination.js";
export { runDeferredExport } from "./client/deferred.js";
export { detectPersona } from "./client/persona-detect.js";
export type { PersonaDetection, PersonaProbe } from "./client/persona-detect.js";
export { basePathFor, PERSONA_BASE_SEGMENT, PERSONAS } from "./client/persona.js";
export type { Persona } from "./client/persona.js";

export * from "./types/impact.js";
