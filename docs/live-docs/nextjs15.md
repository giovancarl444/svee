# Next.js 15 App Router

_Surface:_ Next.js App Router (self-hosted, mobile-first single-operator dashboard). Covers: App Router file conventions, async Server Components for data fetching, Server Actions ("use server") for mutations from a client form, vendored local fonts via next/font/local with zero third-party requests, `output: 'standalone'` for Docker, and cookie-based middleware auth-gating behind a VPN.

## Current version
As of July 2026 the current stable is Next.js 16.2.x LTS (on React 19.2). Next.js 15.x is still supported and its App Router conventions are forward-compatible with 16. Two 2026 deltas the user should know: (1) Turbopack is the default for `next dev` AND `next build` in 16; (2) `middleware.ts` was renamed to `proxy.ts` (exported function `proxy`) in 16 — `middleware.ts` still works but is deprecated. On Next.js 15 you use `middleware.ts`; on 16 prefer `proxy.ts` (a codemod exists). Everything else in this report (file conventions, Server Components, Server Actions, next/font/local, standalone output) is identical across 15 and 16.

## Auth
Model for a single operator behind a VPN: gate everything with an edge/proxy check on a signed session cookie, redirect to /login when absent. Next.js 15: `middleware.ts` exporting `middleware(req)`; Next.js 16: `proxy.ts` exporting `proxy(req)` (Node.js runtime only, no Edge). Read the cookie with `req.cookies.get('session')` and `return NextResponse.redirect(new URL('/login', req.url))` or `NextResponse.next()`. Scope it with a `config.matcher` that excludes /login and static assets. IMPORTANT per official guidance: middleware/proxy checks are "optimistic" only — do NOT treat mere cookie presence as authentication; verify a signed/encrypted session (e.g. jose JWT / iron-session) and additionally enforce auth in a Data Access Layer inside Server Components/Actions. For a single operator on a private network this cookie gate plus a strong shared secret is sufficient; there is no OAuth scope surface here.

## Key APIs
- **App Router special files (app/ dir)** — File-system routing + UI conventions _(layout.tsx (shared, persists across nav; root layout must render <html>/<body>), page.tsx (route UI), loading.tsx (Suspense fallback), error.tsx ('use client' error boundary), not-found.tsx (404 UI), route.ts (Route Handler / API), template.tsx, default.tsx (parallel routes). Folders = segments; [id] dynamic, (group) route groups, _folder private. params/searchParams are async (await them).)_
- **Async Server Components** — Data fetching on the server, no client JS _(Components are Server Components by default; make them `async` and `await fetch(...)` or query the DB directly. `fetch` is cache-controlled via `{ cache: 'force-cache' | 'no-store' }` or `{ next: { revalidate: N, tags: [...] } }`. Add 'use client' only for interactivity.)_
- **next/font/local** — Self-host vendored .woff2 fonts, zero third-party requests _(import localFont from 'next/font/local'; pass `src` (single path or array of {path,weight,style}), `display:'swap'`, `variable:'--font-x'`, `preload:true`. Emits a self-hosted @font-face; files must be committed in the repo and paths are relative to the module. Apply via .className or the CSS variable on <html>.)_
- **Server Actions ('use server')** — Mutations callable from a client <form> or handler _(Add 'use server' at the top of a module (or inline in a Server Component). Signature for form use: `(prevState, formData: FormData) => state`. Pass to <form action={...}> or bind with useActionState. Never define a 'use server' function inside a 'use client' file — keep actions in a separate module.)_
- **useActionState (react)** — Wire a Server Action to a client form with pending + returned state _(const [state, formAction, pending] = useActionState(action, initialState); <form action={formAction}>. Client component ('use client'). Renders validation errors returned by the action.)_
- **revalidatePath / revalidateTag (next/cache)** — Invalidate cached data after a mutation _(Call inside the Server Action after the write: revalidatePath('/dashboard') or revalidateTag('items'). router.refresh() forces a client-side re-fetch of the current route.)_
- **cookies() / headers() (next/headers)** — Read/write cookies & headers in Server Components, Actions, Route Handlers _(Async in 15/16: `const store = await cookies(); store.get/set/delete`. Set httpOnly/secure session cookies here.)_
- **output: 'standalone' (next.config.js)** — Minimal self-contained build for Docker _(Produces .next/standalone with a bundled server.js + traced node_modules. You MUST copy public/ and .next/static/ separately. Run with `node server.js`. Monorepo: set outputFileTracingRoot.)_
- **middleware.ts / proxy.ts** — Edge/proxy request interception for auth-gating & redirects _(Export middleware(req)/proxy(req) returning NextResponse.next()/redirect(); export `config.matcher`. 15 = middleware (Edge or Node); 16 = proxy (Node runtime only).)_

## Incremental sync
The App Router analog of "pull only what changed" is its revalidation/caching model — you invalidate targeted data instead of re-rendering everything. (1) Fetch-level: `fetch(url, { next: { revalidate: 60, tags: ['items'] } })` for time-based or tag-based caching; `{ cache: 'no-store' }` for always-fresh. (2) After a mutation in a Server Action, call `revalidatePath('/dashboard')` or `revalidateTag('items')` from `next/cache` to refresh only affected segments; the client patches in the new RSC payload without a full reload. (3) Client-side, `router.refresh()` re-pulls the current route's server data. (4) Next.js 16 stabilizes Cache Components: `cacheLife()` and `cacheTag()` (the `unstable_` prefix is dropped) plus `'use cache'` for explicit, taggable cached units. For a live dashboard, tag data on fetch and revalidateTag on write for surgical refresh.

## Gotchas
- FONTS — next/font/local is the correct choice for 'no third-party font requests'. It emits a self-hosted @font-face pointing at your vendored .woff2 files; there is no build-time OR runtime network fetch (unlike next/font/google, which downloads at build time). Commit the .woff2 files, make `src` paths relative to the module, and optionally enforce with a CSP `font-src 'self'`.
- SERVER ACTIONS BEHIND A PROXY — Next verifies the request Origin against the Host header to block CSRF on Server Action POSTs. When self-hosting behind a reverse proxy/VPN that rewrites the host, actions get rejected unless the proxy forwards X-Forwarded-Host correctly OR you set `serverActions.allowedOrigins` in next.config (experimental.serverActions.allowedOrigins on 15). Symptom: form submits 403 / 'Invalid Server Actions request'.
- STANDALONE COPY STEP — `.next/standalone` does NOT include public/ or .next/static/. You must COPY both separately in the Dockerfile (`COPY .next/standalone ./`, `COPY .next/static ./.next/static`, `COPY public ./public`) or CSS/JS/images 404.
- STANDALONE BIND ADDRESS — server.js binds to HOSTNAME/PORT env vars; in Docker set `ENV HOSTNAME=0.0.0.0` (and `ENV PORT=3000`), otherwise it may bind to localhost inside the container and be unreachable from the host/VPN.
- MIDDLEWARE→PROXY — on Next.js 16 rename middleware.ts→proxy.ts and the function to `proxy`; it runs on the Node.js runtime only (Edge removed for it). On 15 keep middleware.ts. Don't ship both.
- OPTIMISTIC AUTH — official docs warn middleware/proxy auth is optimistic; verify a signed/encrypted session (jose/iron-session), not just cookie presence, and enforce again in the Data Access Layer. Fine for a single VPN operator but don't treat the edge check as the only gate.
- ASYNC REQUEST APIS — cookies(), headers(), params and searchParams are async in 15/16; you must `await` them or you get a runtime error.
- CLIENT/SERVER BOUNDARY — you cannot declare a 'use server' function inside a 'use client' file. Put Server Actions in their own module and import them into the client form.
- MONOREPO TRACING — if the app is nested in a monorepo, set `outputFileTracingRoot` or standalone will miss workspace files. Files read dynamically at runtime (not statically imported) may also be missed — add them via `outputFileTracingIncludes`.

## Canonical pattern
```ts
// ── 1. VENDORED LOCAL FONT (zero third-party requests) ──
// app/fonts.ts   — .woff2 files committed under app/fonts/
import localFont from 'next/font/local'
export const sans = localFont({
  src: [
    { path: './fonts/Inter-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Inter-Medium.woff2',  weight: '500', style: 'normal' },
    { path: './fonts/Inter-Bold.woff2',    weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-sans', // exposes a CSS var
  preload: true,
})

// app/layout.tsx  (root layout MUST render <html>/<body>)
import { sans } from './fonts'
import './globals.css'
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className={sans.className}>{children}</body>
    </html>
  )
}
// globals.css:  body { font-family: var(--font-sans), system-ui, sans-serif; }

// ── 2. SERVER ACTION + CLIENT FORM ──
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
const Schema = z.object({ name: z.string().min(1) })
export async function createItem(_prev: { message: string }, formData: FormData) {
  const parsed = Schema.safeParse({ name: formData.get('name') })
  if (!parsed.success) return { message: 'Invalid input' }
  await db.item.create({ data: parsed.data })   // your DB write
  revalidatePath('/dashboard')                   // surgical cache refresh
  return { message: 'Saved' }
}

// app/dashboard/item-form.tsx  (client component calling the action)
'use client'
import { useActionState } from 'react'
import { createItem } from '@/app/actions'
export function ItemForm() {
  const [state, formAction, pending] = useActionState(createItem, { message: '' })
  return (
    <form action={formAction}>
      <input name="name" required />
      <button disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
      {state.message && <p aria-live="polite">{state.message}</p>}
    </form>
  )
}

// ── 3. AUTH GATE (Next 15: middleware.ts; Next 16: rename to proxy.ts / fn proxy) ──
import { NextRequest, NextResponse } from 'next/server'
export function middleware(req: NextRequest) {
  const session = req.cookies.get('session')?.value
  if (!session) return NextResponse.redirect(new URL('/login', req.url))
  return NextResponse.next()
}
export const config = {
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico).*)'],
}

// ── 4. next.config.js + Dockerfile essentials for self-host ──
// next.config.js:  module.exports = { output: 'standalone' }
// Dockerfile (runner stage):
//   COPY --from=builder /app/public ./public
//   COPY --from=builder /app/.next/standalone ./
//   COPY --from=builder /app/.next/static ./.next/static
//   ENV HOSTNAME=0.0.0.0 PORT=3000
//   CMD ["node", "server.js"]
```

## Recommendation for CORTEX
Build the dashboard on the App Router with a Server-Component-first data flow and Server Actions for every mutation — this keeps client JS minimal (good for mobile) and removes the need for a separate API layer. Concretely for CORTEX/this app: (1) Fonts — vendor 2-3 .woff2 weights under app/fonts/ and load them with next/font/local using a CSS variable (`variable: '--font-sans'`, `display:'swap'`, `preload:true`); this guarantees zero third-party font requests, and add a CSP `font-src 'self'` to enforce it. (2) Data — fetch inside async Server Components; tag fetches (`next.tags`) and call `revalidateTag`/`revalidatePath` from actions so the dashboard refreshes surgically. (3) Mutations — put all `'use server'` actions in a dedicated module, drive forms with `useActionState` for pending state and returned validation errors. (4) Auth — a `middleware.ts` (15) / `proxy.ts` (16) that redirects on a missing signed session cookie is the right weight for a single operator behind a VPN; back it with a jose/iron-session encrypted cookie and re-check in the action layer — don't rely on cookie presence alone. (5) Deploy — set `output: 'standalone'`, use the multi-stage with-docker Dockerfile, remember to copy public/ and .next/static/ separately and set `ENV HOSTNAME=0.0.0.0`. Target Next.js 16.2.x LTS for a new 2026 build (Turbopack default, Node-runtime proxy, stable Cache Components); if you must stay on 15, the only source change is middleware.ts↔proxy.ts and you keep the Edge runtime option. One self-host gotcha to configure up front: behind your reverse proxy, ensure X-Forwarded-Host is passed or set `serverActions.allowedOrigins`, or Server Action POSTs will 403.

## Citations
- [Next.js Docs — App Router: File-system conventions](https://nextjs.org/docs/app/api-reference/file-conventions)
- [Next.js Docs — Getting Started: Fetching Data (async Server Components)](https://nextjs.org/docs/app/getting-started/fetching-data)
- [Next.js Docs — Getting Started: Updating Data (Server Actions)](https://nextjs.org/docs/app/getting-started/updating-data)
- [Next.js Docs — Directives: use server](https://nextjs.org/docs/app/api-reference/directives/use-server)
- [Next.js Docs — Getting Started: Fonts (next/font/local)](https://nextjs.org/docs/app/getting-started/fonts)
- [Next.js Docs — Component API: Font](https://nextjs.org/docs/app/api-reference/components/font)
- [Next.js Docs — next.config.js: output (standalone)](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Next.js Example — with-docker (standalone Dockerfile)](https://github.com/vercel/next.js/tree/canary/examples/with-docker)
- [Next.js Docs — File Conventions: middleware.ts](https://nextjs.org/docs/app/api-reference/file-conventions/middleware)
- [Next.js Docs — Renaming Middleware to Proxy (v16)](https://nextjs.org/docs/messages/middleware-to-proxy)
- [Next.js Docs — Upgrading: Version 16](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js Docs — Guides: Authentication (optimistic middleware + DAL)](https://nextjs.org/docs/app/guides/authentication)
- [Next.js Docs — Functions: revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
- [Next.js Blog — Next.js 16 (Turbopack default, Cache Components)](https://nextjs.org/blog/next-16)
