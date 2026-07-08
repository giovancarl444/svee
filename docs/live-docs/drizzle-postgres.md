# Drizzle ORM + Postgres

_Surface:_ Drizzle ORM + node-postgres (pg) driver for self-hosted PostgreSQL 16, schema-first workflow. Package entrypoints: `drizzle-orm/node-postgres` (runtime), `drizzle-orm/node-postgres/migrator` (programmatic migrate), `drizzle-orm/pg-core` (schema builders: pgTable, pgEnum, uuid, jsonb, timestamp, text, customType, index, uniqueIndex, unique, foreignKey, primaryKey), and `drizzle-kit` (CLI + defineConfig). Drizzle is dialect-typed via `dialect: "postgresql"`; the pg driver is auto-detected from the `drizzle-orm/node-postgres` import.

## Current version
As of July 2026 (npm `latest`): drizzle-orm 0.45.2, drizzle-kit 0.31.10. Driver: pg (node-postgres) 8.22.0, @types/pg 8.20.0 (devDep). Target: PostgreSQL 16 (self-hosted), Node 18+ / TypeScript 5+. Install: `npm i drizzle-orm pg` and `npm i -D drizzle-kit @types/pg`. Note: a Drizzle "v2" line is in the docs (adds a `codec` field plus `fromJson`/`forJsonSelect` on customType and the new relations API) but 0.45.x is the current stable v1-generation release — stick to the v1 customType API (dataType/toDriver/fromDriver) unless you deliberately opt into v2.

## Auth
No app-level auth — this is a direct Postgres TCP connection. Credentials are the Postgres connection string `postgres://user:password@host:5432/dbname`, supplied via `process.env.DATABASE_URL`. For self-hosted PG 16 over TLS, pass `ssl` in the pg Pool options (e.g. `ssl: { ca, rejectUnauthorized: true }`) or `?sslmode=require` in the URL; for a same-host/VPC deploy you can omit SSL. drizzle-kit needs the same `DATABASE_URL` (via `dbCredentials.url`) to run `migrate`/`push`/`pull`. Minimum DB privileges: CONNECT + CREATE on the schema and DML on your tables; the migrator also needs privileges to create its bookkeeping table (`drizzle.__drizzle_migrations` by default).

## Key APIs
- **drizzle({ client: pool, schema, casing })** — Create the DB instance from `drizzle-orm/node-postgres`. Accepts an existing `pg.Pool`/`Client` via `{ client }`, or a URL string `drizzle(process.env.DATABASE_URL)`, or `{ connection: { connectionString, ssl } }`. Pass `schema` for the relational query API and `casing: "snake_case"` for identifier casing. _(For a long-lived app use `new Pool(...)` and `{ client: pool }` so you control pooling/SSL/shutdown.)_
- **migrate(db, { migrationsFolder })** — Programmatically apply pending SQL migrations at startup. Import from `drizzle-orm/node-postgres/migrator`. Idempotent — already-applied files are skipped by consulting the migrations bookkeeping table. _(`migrationsFolder` must match drizzle-kit `out` (default ./drizzle). Run once before serving traffic.)_
- **drizzle-kit generate** — Diff your TypeScript schema against the last snapshot and emit a new timestamped .sql migration + snapshot into `out`. This is the schema-first authoring step. _(`npx drizzle-kit generate`. Add `--name my_change` to label the file.)_
- **drizzle-kit migrate** — CLI application of generated migrations directly against `dbCredentials.url`. Alternative to the programmatic migrate() for CI/CD or manual deploys. _(`npx drizzle-kit migrate`. Use either this OR the in-app migrate(), not both simultaneously for the same run.)_
- **drizzle-kit push / pull / check / studio** — push = apply schema straight to DB without migration files (prototyping only, not for prod); pull = introspect an existing DB into schema; check = detect migration conflicts/races; studio = local data browser. _(Prefer generate+migrate over push for a real PG 16 app so changes are reviewable and reproducible.)_
- **pgTable(name, columns, (t) => [ ...constraints ])** — Table builder from `drizzle-orm/pg-core`. Third arg is a callback returning an ARRAY (current API) of table-level index/constraint builders: index, uniqueIndex, unique, primaryKey, foreignKey. _(The array return form replaced the older object-return form; keep constraints here rather than inline when they are composite.)_
- **Column builders: uuid, jsonb, timestamp, text, integer, pgEnum, customType** — uuid().defaultRandom().primaryKey() → gen_random_uuid PK; jsonb().$type<T>() → typed JSONB; timestamp({ withTimezone: true }).defaultNow() → timestamptz; pgEnum('name',[...]) → native enum type; customType<{data,driverData}>({...}) → arbitrary SQL type such as bytea. _(gen_random_uuid() is built into PG 16 (pgcrypto not required). Use `.$type<T>()` to type jsonb and `.$onUpdate(() => new Date())` for updatedAt.)_

## Incremental sync
Not a data-sync API. The relevant "checkpoint" concept is migration state: drizzle-kit writes a snapshot per migration under `out/meta/` and records applied migrations in the `__drizzle_migrations` table (schema `drizzle` by default; both configurable under `migrations: { table, schema }`). `generate` computes the delta from the last snapshot; `migrate()`/`drizzle-kit migrate` apply only files whose hash is not yet recorded, so calling migrate() on every boot is safe and only runs new migrations. Roll forward by adding new generated migrations; there is no built-in auto-down — author reverse migrations manually if you need rollback.

## Gotchas
- orm.drizzle.team blocks generic fetchers (returns 403) — browse it normally or use Context7; the doc content is otherwise authoritative.
- Config uses `dbCredentials: { url }` — `url` is the current key, not `connectionString` (that older key is deprecated in the config).
- The pgTable third-argument callback should RETURN AN ARRAY `(t) => [ ... ]`. The old object-return `(t) => ({ ... })` form is deprecated; array is current.
- `uuid().defaultRandom()` emits `gen_random_uuid()`, which is native in PostgreSQL 13+ (so fine on PG 16) — no `CREATE EXTENSION pgcrypto` needed. Only add pgcrypto if you call gen_random_uuid on very old servers.
- node-postgres returns Postgres `bytea` as a Node `Buffer`, so a bytea customType's `driverData` is `Buffer`. For an encrypted column, put encrypt in `toDriver` (returns Buffer) and decrypt in `fromDriver` (receives Buffer).
- There is now a built-in `bytea()` column type in pg-core in recent versions, but for an *encrypted* column you still want customType so you can hook toDriver/fromDriver — built-in bytea does no transform.
- node-postgres returns numeric/`bigint`/`timestamp` as strings by default in some cases; use `timestamp({ mode: 'date' })` (default) vs `{ mode: 'string' }` deliberately, and be aware bigint columns may need a codec/parse.
- Don't run drizzle-kit `push` against production — it bypasses migration files. Use `generate` + `migrate` so every schema change is a reviewable committed .sql file.
- Running migrate() from a large Pool at boot is fine, but do it once before accepting traffic; if you want isolation, run migrations with a short-lived dedicated client/connection and then start the app pool.
- `casing: 'snake_case'` must be set in BOTH drizzle-kit config (so generated SQL is snake_case) and the runtime `drizzle({ ..., casing: 'snake_case' })` (so queries quote the same identifiers) — otherwise runtime queries can mismatch column names. Alternatively give every column an explicit snake_case name string.
- pgEnum creates a native PG enum TYPE; adding/removing enum values later produces ALTER TYPE migrations that can be restrictive (e.g. can't drop a value) — consider a text column + check constraint if the value set churns.

## Canonical pattern
```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: "snake_case",
  verbose: true,
  strict: true,
});

// src/db/schema.ts
import {
  pgTable, pgEnum, uuid, text, jsonb, timestamp,
  customType, index, uniqueIndex, unique,
} from "drizzle-orm/pg-core";

// encrypted bytea via customType: data = app type, driverData = what pg exchanges (Buffer)
export const encryptedBytea = customType<{ data: string; driverData: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(v) { return encrypt(v); },     // string -> ciphertext Buffer
  fromDriver(v) { return decrypt(v); },   // ciphertext Buffer -> string
});

export const roleEnum = pgEnum("role", ["guest", "user", "admin"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),                 // gen_random_uuid()
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("user"),
  profile: jsonb("profile").$type<{ bio?: string; links: string[] }>().notNull().default({ links: [] }),
  secret: encryptedBytea("secret"),                            // encrypted at rest
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("users_email_uq").on(t.email),
]);

export const memberships = pgTable("memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull(),
  role: roleEnum("role").notNull().default("user"),
}, (t) => [
  unique("memberships_user_org_uq").on(t.userId, t.orgId),     // composite UNIQUE
  index("memberships_org_role_idx").on(t.orgId, t.role),       // composite index
]);

// src/db/index.ts  (connection + migrate at startup)
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL /*, ssl: {...} */ });
export const db = drizzle({ client: pool, schema, casing: "snake_case" });
await migrate(db, { migrationsFolder: "./drizzle" });  // idempotent; runs only new migrations

// author changes: npx drizzle-kit generate   then   npx drizzle-kit migrate (or the migrate() above)
```

## Recommendation for CORTEX
For CORTEX's self-hosted PG 16 adapter, pin drizzle-orm ^0.45, drizzle-kit ^0.31, and pg ^8.22 (+ @types/pg dev). Standardize on the schema-first flow: hand-write TypeScript schema, run `drizzle-kit generate` to produce committed, reviewable .sql migrations, and apply them with the programmatic `migrate(db, { migrationsFolder: './drizzle' })` at process startup (idempotent, safe every boot) — reserve `drizzle-kit push` for local prototyping only. Connect with an explicit `new Pool()` wrapped by `drizzle({ client: pool, schema, casing: 'snake_case' })` so you own pooling, SSL, and graceful shutdown; set the same `casing: 'snake_case'` in drizzle.config.ts so generated SQL and runtime queries agree on identifiers. Use `uuid().defaultRandom().primaryKey()` for PKs (native gen_random_uuid on PG 16, no extension), `timestamp({ withTimezone: true }).defaultNow().notNull()` for timestamps (add `.$onUpdate(() => new Date())` for updatedAt), `jsonb().$type<T>()` for typed JSON, and `pgEnum` for stable enumerations (fall back to text+check if the value set will churn). Put unique/composite indexes and foreign keys in the array-return table callback. For the encrypted secret column, use the v1 `customType<{ data; driverData: Buffer }>` returning `'bytea'` with encrypt in `toDriver` / decrypt in `fromDriver`; do NOT adopt the v2 `codec`/`fromJson` customType API until you move to Drizzle v2. Keep the `__drizzle_migrations` bookkeeping table in a dedicated `drizzle` schema (the default) and ensure the deploy DB role can create it.

## Citations
- [Get Started — PostgreSQL (node-postgres connection)](https://orm.drizzle.team/docs/get-started-postgresql)
- [Drizzle with node-postgres driver](https://orm.drizzle.team/docs/connect-node-postgres)
- [Migrations fundamentals (generate + migrate, programmatic migrator)](https://orm.drizzle.team/docs/migrations)
- [drizzle.config.ts — Drizzle Kit configuration file](https://orm.drizzle.team/docs/drizzle-config-file)
- [drizzle-kit generate](https://orm.drizzle.team/docs/drizzle-kit-generate)
- [drizzle-kit migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)
- [PostgreSQL column types (uuid, jsonb, timestamp, bytea, enum)](https://orm.drizzle.team/docs/column-types/pg)
- [Indexes & Constraints (unique, composite, primaryKey, foreignKey)](https://orm.drizzle.team/docs/indexes-constraints)
- [Custom column types (customType helper, dataType/toDriver/fromDriver)](https://orm.drizzle.team/docs/custom-types)
- [SQL schema declaration (pgTable, pgEnum, index/uniqueIndex example)](https://orm.drizzle.team/docs/sql-schema-declaration)
