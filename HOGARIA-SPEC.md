# HogarIA — Absorption of Basketra into MiCocinAI

Status: **in progress** · Owner: juanjoGonDev · Spec opened: 2026-09-19 · Method: SDD (this file is the contract)

## 1. Why

`MiCocinAI` today plans meals and a pantry. `Basketra` (private, mobile-first, one Node process +
SQLite) turns physical receipts into price observations, keeps shopping lists, and compares
baskets. The user has decided to stop maintaining two apps: **one product at home**, absorbing
Basketra completely and renaming it.

Name: **HogarIA**. Chosen because the roadmap goes beyond food — household tasks, a shared
calendar, external calendars, Home Assistant. `MiCocinAI` becomes the historical name.

The two apps share the interesting surface: a dish knows its ingredients, ingredients cost money at
a store, the pantry knows what is already bought, and the receipt is the evidence. Absorbing gives:

| Joint capability | Feeds from |
| --- | --- |
| Approximate cost of a dish / of a week's plan | `price_observations` + recipe ingredients |
| "Add to shopping list" from a recipe, a plan or the pantry | `shopping_list_items`, `canonical_products` |
| Receipt scan fills the pantry (with expiry dates) | `receipt_items` → `ingredients` |
| Expiry pressure reorders the weekly plan | `ingredients.expiration_date` + planner |
| Pantry stock reduces the estimated basket | `ingredients.quantity` vs `shopping_list_items` |

## 2. Product shape

Nine sections, one screen each, tabs inside, never everything at once.

```
HogarIA
├── Today            (dashboard: meals due, expiries, open list, budget of the week)
├── Plan             (calendar day/week/month — already shipped — + AI planner)
├── Recipes          (existing)
├── Pantry           (existing: ingredients, utensils) + expiry column + "add to list"
├── Shopping         (lists · detail with check-off, swipe, cost preview, store selection)
├── Catalog          (products, variants, aliases, categories tree, EAN)
├── Prices           (price history per product/retailer/store, ticket evidence)
├── Receipts         (capture → OCR → AI → editable review rows → confirm → pantry + prices)
├── Household        (members, invites, tasks [coming], presence)
└── Settings         (tabs: App · AI · Sync · Support)   Support: logs viewer + report a bug
```

Mobile-first, installable (PWA), usable offline, one private instance. No public multi-tenant
ambitions, no payments, no marketplace, no scraping services — the same non-goals Basketra states.

## 3. Copy of Basketra's contracts (verbatim behaviour, adapted to this stack)

### 3.1 AI provider request

`src/ai/provider.ts` is the reference. Reproduce:

- Endpoint: `POST {baseUrl}/chat/completions` (trailing slash normalised). Optional capability
  probe: `GET {baseUrl}/capabilities`; `400 | 404 | 405` ⇒ no capabilities, continue.
- Headers: `authorization: Bearer <key>` only when a key exists; `x-client-request-id: <correlationId>`
  only when the id matches the allowed pattern; session affinity trio
  `x-session-affinity`, `x-session-affinity-keep-open: true`, and `x-session-affinity-final: true`
  on the final turn.
- Body: `{ model, messages: [{role:'system',content},{role:'user',content}], response_format:
  { type: 'json_schema', json_schema: { name, strict: true, schema } }, reasoning?: { effort } }`.
- Attachments (images/PDF) ⇒ `multipart/form-data` with `request` = the JSON above and each
  attachment appended as `files`; enforce a JSON-body byte ceiling and fail with
  `AI_ATTACHMENT_TOO_LARGE` (`413`) instead of silently truncating.
- Response: read with a hard byte cap, then `choices[0].message.content` parsed as JSON. Empty body
  ⇒ `AI_EMPTY_RESPONSE (retryable)`; unparsable ⇒ `AI_INVALID_RESPONSE`; transport failure ⇒
  `AI_UNREACHABLE (retryable)`; HTTP status mapped through a stable taxonomy.
- Providers are **ephemeral**: constructed per operation, `dispose()`d after. No resident worker, no
  daemon, no broker.
- Every AI output is a **proposal**: validated locally, shown editable, persisted only on confirm.
  The model never writes to the database.

### 3.2 Money, quantities, matching

- Money is an **integer number of cents**, always. Never float arithmetic on money; the UI accepts
  and displays euros with two decimals (`es-ES`), never cents.
- Normalised quantities are reduced integer fractions (`{numerator, denominator}`).
- A price observation is **immutable**; correcting it creates a new observation. No silent overwrite
  of historical evidence.
- Matching order: EAN/GTIN → SKU → confirmed alias → historic mapping → deterministic attributes →
  lexical similarity → AI rerank → human confirmation. A confirmed exact match and category are
  reused before asking the AI.
- A price enters history only with a **retailer** and real evidence (ticket, photo, explicit manual
  entry). No evidence ⇒ no observation, and the item still saves.

### 3.3 Cost preview and basket optimisation

Reference: `src/infrastructure/shopping-estimate.ts` + offers/optimization.

- Per line: resolve the effective store for the list (explicit selection, else last used, else the
  nearest known store), then the **latest confirmed observation** for that product/variant at that
  retailer ⇒ `estimatedTotalMinor`, or `status: 'unpriced'` with a reason (`price-missing`,
  `no-store`, `ambiguous-product`).
- List total = sum of priced lines only; unpriced lines are listed separately with their reason — a
  quote never pretends to be complete.
- Plans: `single-retailer` (one store, fewest trips), `balanced`, `maximum-saving` (split across
  retailers). Exhaustive over retailer subsets while the set is small; bounded and deterministic
  otherwise. Each run persists `optimization_runs` + `optimization_plans` + items with the inputs it
  used, so a plan is re-derivable and never silently re-priced.
- Prime/free-delivery only zeroes transport with valid evidence or a user-confirmed rule.

### 3.4 Durable AI queue

Reference: `src/receipts/durable-job-store.ts` + `durable-runner.ts`.

- Table `ai_jobs`: `id, kind, payload_json, status(queued|running|completed|failed|cancelled),
  attempts, max_attempts, run_after, lease_expires_at, response_id, remote_status, error_code,
  error_message, created_at, updated_at, finished_at`.
- Transitions: `queued → running` takes a lease with a deadline; a worker that dies leaves
  `running` rows which are swept at startup to `failed` + `RECEIPT_EXTRACTION_INTERRUPTED` (or
  re-queued when attempts remain) — recovery is automatic, never manual.
- Backoff per kind; `max_attempts` from Settings; single-process cooperative scheduling with a
  concurrency cap from Settings (receipt validation concurrency 1..8).
- REST: `POST /api/ai/jobs` (create, returns the id), `GET /api/ai/jobs/:id`,
  `DELETE /api/ai/jobs/:id` (cancel), `POST /api/ai/jobs/recover`. Progress reaches the client via
  SSE invalidations, not polling.
- The queue is the only path to the provider for heavy work (receipt extraction, basket
  optimisation, weekly plan): a request handler never blocks on the model.

### 3.5 Realtime and concurrency

Reference: `src/realtime/` + the CAS rules in `spec.md`.

- REST stays authoritative for reads and writes. SSE (`GET /api/realtime`) carries **invalidations
  only**: `entity`, `mutation`, `id`, `version`, `timestamp` — no product names, prices, receipts,
  coordinates or secrets.
- Client: one stream while the document is visible, closed when hidden, re-sync on `visibilitychange`
  and on reconnect; bursts coalesced; no domain polling.
- `shopping_lists` / `shopping_list_items` (and later pantry rows) carry an integer `version`; writes
  are compare-and-swap inside the same transaction; a stale write gets `409` with a stable code plus
  the current canonical row so the UI can show local vs remote and "Use mine" retries on the new
  version. Reordering requires the list version and is rejected if the order moved underneath.

### 3.6 Receipt pipeline with expiry

`capture(s) → OCR (ephemeral provider) → AI verify → editable rows → confirm`, as Basketra does, plus
the joint behaviour the user asked for:

- JPEG/PNG: local OCR first (Spanish), evidence kept and recoverable; when a provider is configured
  it always continues with AI verification — no toggle exposing a half-baked mode. PDF: provider or
  manual review.
- Review UI: one editable row per line (description, quantity, unit, unit price, total in euros,
  **expiry date** when present). Never a transcription textarea as the primary control.
- On confirm: price observations (immutable, with the ticket's store), catalog projection, and —
  new — `pantry` writes: any line whose product resolves to a pantry ingredient type inserts or
  tops up stock with `expiration_date` from the receipt (`Best before`, `Use by`, `Consumir antes
  de`, `CAD`, `FECHA DE CONSUMO PREFERENTE`), and shows what was added.
- Deleting a capture from a draft never deletes stored evidence unless it is unreferenced.

## 4. Everything from the UI, nothing from env

Runtime settings live in SQLite (`runtime_settings`, one row `id='instance'`) and are edited under
**Settings**. Reference: `src/infrastructure/runtime-settings.ts` (typed defaults, validated ranges,
masking of secrets).

Target list for MiCocinAI — every one of these stops being read from `process.env`:

| Key | Default | Bounds |
| --- | --- | --- |
| `listenPort` | `3000` | 1–65535, applied on restart |
| `corsOrigins` | same-origin | list, blank disables |
| `jwtSecret` | generated on first boot, stored | never returned to the client |
| `jwtExpiresIn`, `refreshTokenExpiresIn` | `15m`, `30d` | duration strings |
| `bcryptRounds` | `10` | 8–15 |
| `rateLimitEnabled`, `rateLimitWindowMs`, `rateLimitMax` | on, `60000`, `300` | used by CI/e2e via API |
| `aiBaseUrl`, `aiApiKey`, `aiModel` | empty | validated URLs, key masked (`••••abcd`) |
| `aiTimeoutMs`, `aiMaxRetries` | `30000`, `1` | 1–10 retries |
| `aiQueueConcurrency`, `aiJobMaxAttempts`, `aiJobBackoffMs` | `1`, `3`, `5000` | bounded |
| `ocrEnabled`, `ocrLanguage` | on, `spa` | |
| `maxBodyBytes` | `32 MiB` | 1 KiB–512 MiB |
| `dbWalMode`, `dbCacheSizeKb`, `dbBusyTimeoutMs` | on, `-64000`, `5000` | |
| `memoryWarnMb`, `memoryCriticalMb`, `memoryCheckMs` | thresholds | |
| `logMaxLines`, `logMaxBytes`, `logRetentionDays`, `logLevel` | `10000`, `40 MiB`, `7`, `info` | |
| `syncIntervalMs`, `syncRetryBackoffMs`, `outboxMaxItems` | `15000`, `2000`, `500` | |
| `pwaCacheName` | derived from version | read-only, shown in UI |
| `offlineEnabled`, `featureShopping`, `featureReceipts`, `featurePrices`, `featureTasks` | on | kill-switches |
| `supportRepoUrl` | `https://github.com/juanjoGonDev/MiCocinAI` | used by report-a-bug |
| `currency`, `locale` | `EUR`, `es-ES` | |

Only **bootstrap** may come from the environment, and only for values needed before the database can
be opened: `DATABASE_PATH` (default `./data/hogaria.sqlite` — the existing file is adopted on first
boot, never renamed under the user's feet). `NODE_ENV` stops being read: `production` is inferred
from the build the client loads plus `settings.env`, and a missing value defaults to development.

Rules: typed defaults + explicit validators per key; a PUT patches only supplied keys; secret keys are
write-only through the API (never echoed, only `configured` + a tail mask); ranges are enforced
server-side with stable error codes; changes that need a restart say so in the UI and expose a
"restart to apply" state. Settings are **per instance**, shared by household members, with a
`updated_at` and a diff view.

## 5. Offline, caching and versioning

The rule: **the device is a first-class store; the server is the arbiter.**

1. Every mutation writes locally first (localStorage) and renders immediately, then flushes to the
   server through an **outbox**. The local copy is kept until a `2xx` ack arrives — never dropped on
   send, only on confirmation.
2. Namespaced keys: `hogar:outbox:v1`, `hogar:cache:v1:<entity>`, `hogar:settings:v1`,
   `hogar:session:v1`. Budgeted: a soft cap (2 MiB) with least-useful-first eviction, and eviction
   never removes an unsent outbox entry (it fails loudly with a visible "storage full" warning
   instead). Every outbox entry carries `clientId` (idempotency key) so a retry cannot double-apply.
3. Reads: cached canonical payloads with `entityVersion`; on open/reconnect, re-fetch canonical
   state and reconcile — local unsent edits win over the cached copy but are marked "pending" and
   can conflict (`409` flow from §3.5).
4. A background hook flushes the outbox on `online`, on `visibilitychange`, and on a timer from
   Settings; overlapping flushes are impossible (single in-flight per entity).
5. Cache API: the Angular service worker (`@angular/service-worker`, a dependency that was never
   wired up) with `ngsw-config.json` — `shell` group prefetches `index.html`/`manifest.json`/all
   `*.js`+`*.css`, `assets` group is lazy-on-install and prefetched on update, and API reads use
   `freshness` (`/api/health`, `/api/preferences`) so a stale response is only a fallback. ngsw
   builds one cache per manifest hash (`cacheName = this.cache.name`, prefix supplied by the worker)
   and, on activation, deletes every other cache (`caches.delete(...)`, verified in the emitted
   `ngsw-worker.js`) — a new build therefore forces a clean cache: Basketra's
   `__BASKETRA_VERSION__` trick without a templating step. `@angular/build` v19
   takes `"serviceWorker": "ngsw-config.json"` (a **path**, not a boolean) and writes
   `ngsw-worker.js`, `safety-worker.js`, `worker-basic.min.js` and `ngsw.json` (v1: `index`,
   `assetGroups`, `dataGroups`, `hashTable`, `navigationUrls`, `navigationRequestStrategy:
   performance`) into `dist/browser`. `SwUpdate` surfaces "new version available" with **Activate
   now** (activate + clear + reload); a Settings toggle controls silent auto-activation. Because the
   cache name only changes when an asset changes, releases must bump `version` in
   `frontend/package.json`, mirrored in `environments/environment.ts` until a build-time injection
   lands (P6).
6. `GET /api/meta` (P1) answers `{ version, build, serverTime, ready, cacheName }`; until it exists
   the About card reads `GET /api/health` + `environment.version`. The client derives uptime from one
   `serverTime` and never polls diagnostics per second.

## 6. Logs: one funnel, one viewer, one report

`todas las entradas pasan por el mismo sitio` — `LogService` (`core/services/log.service.ts`, already
the SSE viewer) becomes the **only** logging surface:

- `log(level, event, data?)` with levels `trace|debug|info|success|warn|error`; every call stamps
  `ts`, `level`, `source: 'client'`, `session`, `appVersion`, `route`, `seq`.
- Redaction before anything is stored or sent: bearer/JWT-shaped strings, `api_key`, `password`,
  emails of other users, file paths. Values are truncated; an event is capped (2 KiB encoded, like
  Basketra's `MAX_EVENT_BYTES`).
- `console.*` of app code is replaced by the service; a boot-time bridge keeps third-party noise out
  but routes `window.onerror` and `unhandledrejection` in as `error` events.
- Client events persist to `hogar:logs:v1` (bounded ring, newest first) so an offline crash is still
  reportable; they are POSTed to the server in batches (existing `/api/logs` ingest + `GET /api/logs`
  + SSE) which validates the closed schema and drops anything unknown — server and client events end
  up in one queryable stream with a `source` field, rotation by line/byte ceilings and oldest-archive
  removal.
- The viewer (`/logs`) keeps its filters (level, source, pause, autoscroll) and gains: saved views,
  `only errors`, and a per-line expand for `data`.
- **Report a bug** is its own section (`/report`): it composes the markdown (version, build, UA,
  viewport, online/offline, settings hash, last N log lines, reproduction notes as written by the
  user), then offers *Open issue* (`{supportRepoUrl}/issues/new?title=…&body=…`, which works for a
  signed-in GitHub user against the public repo) and *Copy to clipboard* as the always-available
  fallback (`navigator.clipboard` with a `execCommand` fallback and a "copied" confirmation). The
  report never contains the AI key, tokens, or other members' emails (asserted by a test).

## 7. UI rules

- Minimal: one idea per screen; tabs, pagination and filters instead of scrolling walls. Tabs,
  subviews, page, search, filters and sort live in query params (existing `core/utils/tab-url.ts`),
  defaults omitted from generated URLs; transient state (drafts, dialogs, bulk selection) never does.
- Depth-aware surfaces: header compact, primary action single and obvious, secondary actions revealed
  on hover/focus-within (calendar precedent).
- Gestures on mobile, from Basketra's lists: short right swipe toggles checked, short left swipe
  reveals edit/delete, past the red threshold delete on release with **Undo**. Every gesture has an
  equivalent button for pointer, keyboard and assistive tech; button-delete keeps its confirmation.
- Icons: inline SVG in a sprite (`assets/icons.svg`), `currentColor`, no emoji in new surfaces (the
  existing nav emoji migrate in phase P2). Every SVG gets `aria-hidden` unless it is the only label.
- Animations: `@keyframes` with explicit `from`/`to` only (no implicit 50% frames), durations from
  tokens (`--duration-*`), `prefers-reduced-motion` disables transform/opacity loops. Skeletons, the
  thin top progress bar and the spinner introduced in the calendar are the reference style.
- Numbers/currency/dates via `es-ES` helpers in one util (the `Intl` grouping separator is **not**
  guaranteed in every browser build — tests must tolerate `2100` and `2.100`).
- Bilingual: every new string goes into both `es`/`en` dictionaries, and no test asserts a translated
  label (CI resolves `en` sometimes).

## 8. Rename to HogarIA

Done in steps so nothing breaks under review:

- **P0 (this round)**: user-facing only — `environment.appName`, `index.html` title +
  `theme-color` + `apple-mobile-web-app-title`, `manifest.json` `name`/`short_name`, header/footer
  text, README heading with an alias note. Storage keys become `hogar:*` with a one-shot read-migrate
  from `mi-cocinai:*` (tokens included, so nobody logs out).
- **P1**: docs and titles (`SETUP.md`, `RUN.md`, `DESIGN-SYSTEM.md` heading, `CHANGELOG.md` entry),
  `DATABASE_PATH` default `data/hogaria.sqlite` with adoption of the existing file.
- **P2**: npm workspace package names (`@hogaria/web`, `@hogaria/server`) **together with**
  `.github/workflows/ci.yml` (`pnpm --filter …`), `Makefile`, `scripts/*`, `playwright.config.ts`
  and `Dockerfile*` — one atomic commit, because CI filters break silently.
- **P3**: repo rename is the user's click (GitHub settings); the app must not assume its own URL —
  `supportRepoUrl` in Settings covers it, and `gh` in CI is the only thing that needs the new name.

The GitHub repo keeps `MiCocinAI` until P3; nothing in code hardcodes the owner/repo except the
`supportRepoUrl` default.

## 8b. From a cooking level to a household profile

The signup form asked for a **cooking level** (beginner / intermediate / expert) and nothing
consumed it: the AI prompt was driven by a separate `detailLevel`, and the household view only
printed a label. With shopping lists, prices, tickets, the pantry and (soon) household tasks, one
cooking-only question no longer describes the user. The concept moves, it does not disappear.

**Contract**

- `users.cooking_level` gains a fourth value, `none` ("apenas cocino"), as a plain TEXT value with no
  CHECK constraint — so no migration, and old rows keep working. Enums updated in
  `schemas/auth.schema.ts`, `schemas/household.schema.ts` and `utils/taste-profile.ts`, plus the
  `CookingLevel` union and `COOKING_LEVEL_LABELS` on the client.
- `users.preferences` JSON gains `profile.modules: HomeModule[]` with the closed set
  `meals | pantry | shopping | receipts | home`, validated and de-duplicated server-side (unknown
  values dropped, max 8). No new column, same merge rule as `taste`/`onboarding`.
- `GET|PATCH /api/auth/taste` now exchanges `profile: { cookingLevel, modules }` as well: one
  round-trip for the tour and for Preferences, `cooking_level` staying the only source for the level
  (Preferences never replaces the whole preferences blob, so it cannot wipe theme/language).
- **The level has to do something.** `detailLevelForCookingLevel(level)` maps `none|beginner → basic`,
  `intermediate → intermediate`, `expert → expert`, and `POST /api/ai/generate-recipe`
  (`/multiple` too) uses it **only when the request omits `detailLevel`**: an explicit choice from the
  recipe UI still wins. That is the whole point of asking.
- Modules drive what HogarIA highlights (dashboard cards, which sections the tour mentions); the three
  not shipped yet are listed with a *pronto/soon* mark so the picker is honest about the roadmap.

**Where it lives**

- Signup stops configuring the product: the register form is name, email, password only. It lands in
  the tour, which keeps the level as its **first** step ("Perfil") next to the module picker — five
  short questions, skippable, editable later.
- **Preferencias › Perfil** is the section to change it later (first tab, `?tab=profile`), with the
  same controls, the derived AI detail level shown as text, and the standard dirty/discard/save
  behaviour of that page. `detailLevel` itself remains in Settings: the profile only *suggests* it.

**Acceptance**

- Register → tour step 1 of 5 = Perfil; choosing a level and two modules and finishing persists both
  (`GET /api/auth/taste` returns them) and survives a reload of Preferencias › Perfil.
- `cooking_level = 'none'` is accepted by `/api/auth/profile` and renders as "Apenas cocino" in the
  household member list.
- With `cooking_level = 'beginner'` and no `detailLevel` in the request, the generated prompt contains
  `Nivel de detalle: basic`; with `expert`, `Nivel de detalle: expert`; with an explicit
  `detailLevel: 'expert'` and level `beginner`, the explicit value wins.
- Skipping the tour keeps defaults (`beginner`, no modules) and never blocks the dashboard.

### Checklist for this feature
- [ ] Server: `none` in every enum, `profile.modules` validated in `taste-profile.ts`, `profile` in the
      response, `detailLevelForCookingLevel` + its use in the two AI routes, unit tests.
- [ ] Client: `CookingLevel`/labels, `home-profile.ts` model with the module options, service patch.
- [ ] Signup without the level block; tour step *Perfil* (level + modules) and 5-step copy.
- [ ] Preferencias › Perfil tab (first), dirty tracking including the profile, save/discard.
- [ ] e2e re-linked (onboarding 5 steps, preferences default tab) + the profile surviving a reload.

## 9. Data model additions

New tables (SQLite, `PRAGMA foreign_keys = ON`, WAL, busy timeout, indexes on every FK and date):

`retailers`, `stores` (with optional lat/lon and `source`), `canonical_products`, `product_variants`,
`product_aliases`, `categories` (self-referencing `parent_id`, `color`, fallback `category_unknown`),
`retailer_listings`, `price_observations`, `external_evidence`, `receipts`, `receipt_captures`,
`receipt_extractions`, `receipt_items`, `receipt_corrections`, `shopping_lists`, `shopping_list_items`,
`optimization_runs`, `optimization_plans`, `optimization_plan_items`, `runtime_settings`, `ai_jobs`,
`sync_conflicts`.

Existing tables are extended, not replaced: `ingredients` gains `expiry_source`, `receipt_item_id`,
`list_item_id` and `store_id`; `recipes` gain `estimated_cost_minor` (derived, cached with the
observation ids used); `meals` may link a `receipt_item_id` for "we ate this, it cost X". Money
columns are `INTEGER` cents, `CHECK (col >= 0)`. Timestamps are ISO-8601 TEXT. Migrations are
numbered, additive, never rewritten, and each ships with a "migrate an old DB, assert data survives"
test — the same discipline used for `weekly_calendars.household_id`.

## 10. Backend/API surface

Hono routers, `authMiddleware` on all of them, `{ success, data }` envelope (existing convention):

```
GET|PUT   /api/settings                      runtime settings (public projection) / patch
GET|POST  /api/ai/jobs · GET|DELETE /api/ai/jobs/:id · POST /api/ai/jobs/recover
POST      /api/ai/test                       provider probe (configured|unreachable|unauthorized|slow|ok)
GET       /api/shopping-lists · POST          create
GET|PATCH|DELETE /api/shopping-lists/:id      version/CAS
POST      /api/shopping-lists/:id/items · PATCH|DELETE /items/:itemId
PUT       /api/shopping-lists/:id/order       full order, guarded by list version
PUT       /api/shopping-lists/:id/store       store selection for the estimate
GET       /api/shopping-lists/:id/estimate    per-line + totals + unpriced reasons
POST      /api/shopping-lists/:id/items/bulk  pantry-aware paste/split
GET|POST  /api/products · /api/products/suggestions · /api/products/photo-proposal
GET|POST  /api/categories · /api/categories/suggest · PATCH /api/categories/:id
GET|POST  /api/stores/suggestions · /api/stores/nearby (Overpass, opt-in, bounded, cancellable)
GET|POST  /api/retailers/suggestions
POST      /api/receipts/extract · /api/receipts/validate · /api/receipts/confirm
POST      /api/files · GET /api/files/:id     evidence store (validated type/size/signature)
POST      /api/optimization-runs
GET       /api/realtime                       SSE invalidations
GET       /api/meta · /health · /readiness
```

Every list endpoint: `limit`/`offset` or cursor `page`, `sort`, `q`, and entity filters; unknown or
out-of-range values are clamped, never forwarded. Writes accept only allowlisted fields (the schema
layer already does this with zod) and every enum is validated before it reaches SQL.

## 11. Tests

- **Unit** (`src/domain` equivalents): money parse/format round-trip incl. `es-ES` separators,
  fraction reduction, matching priority order, estimate (priced/unpriced/no-store), plan selection,
  CAS 409, outbox replay/idempotency, redaction, log event size cap.
- **Server integration** (vitest, `DATABASE_PATH=':memory:'`): migration from the pre-absorption
  schema keeps data; receipt confirm writes observations + pantry stock + expiry; queue sweeps
  interrupted jobs; `PUT /api/settings` masks secrets and enforces ranges.
- **E2E** (Playwright, chromium in CI): list CRUD offline→sync, swipe toggle, cost preview shows a
  partial total with reasons, receipt review rows edit and confirm into the pantry, Settings tabs
  persist and mask, Support section copies a redacted report, PWA shell loads with the network
  offline. Assertions use ids/hrefs, never translated text.
- **CI**: Type Check · Server Tests · Production Build · E2E stay green on every push; a phase is not
  done while the suite is red.

## 12. Checklist

Every box is a PR-sized commit. `[x]` only when its tests are green in CI.

### P0 · Groundwork, branding, foundations
- [ ] Spec committed and PR updated (this document).
- [x] Branding rename: `appName`, `index.html` (title, description, apple/application name),
      `manifest.json` (name, id, description, shortcuts), auth layout title, global stylesheet header,
      README heading + alias note, `frontend/package.json` 1.1.0.
- [x] `hogar:v1:*` storage keys with a one-shot read-migrate from the legacy bare keys
      (`auth_token`, `refresh_token`, `current_user`, `theme`, `language`) and from `recipeapp_*`;
      legacy keys are kept so a rollback still works and nobody is logged out.
- [x] PWA wired: `frontend/ngsw-config.json` (shell prefetch: `index.html`, `manifest.json`,
      `favicon.ico`, `*.css`, `*.js`; assets lazy/prefetch-on-update; `freshness` for
      `/api/health` + `/api/preferences`), `"serviceWorker": "ngsw-config.json"` in the production
      configuration, `index.csr.html` excluded (this build has no SSR). Verified in `dist/browser`:
      `ngsw-worker.js` + `ngsw.json` with 61 hashed entries, and the `provideServiceWorker` call that
      already existed now has a worker to register.
- [ ] `LogService` is the only funnel: levels, stamp, redaction, size cap, localStorage ring,
      `window.onerror`/`unhandledrejection` bridge, batched POST to `/api/logs`.
- [ ] Log viewer: level + source filters, only-errors, pause, expandable payload, saved view.
- [ ] New **Support** section (`/report`): generated markdown report, *Open issue*, *Copy to
      clipboard* fallback, redaction assertion in tests, nav entry, tabs in URL.
- [ ] `SwUpdate` prompt with *Activate now* + Settings auto-activate toggle (delivered with the
      Support section, next commit).
- [ ] `GET /api/meta` (version, build, serverTime, ready, cacheName) + About card showing
      version/uptime, no per-second polling.
- [ ] Rename the Angular project key `recipeapp` (and `defaultProject`) together with the workspace
      package names — one commit, because `ng` invocations in CI and the Makefile depend on it.
- [ ] App-wide icon sprite + first pass of SVG icons replacing emoji in the nav.
- [ ] Animation tokens documented and a `from`/`to`-only lint note in DESIGN-SYSTEM.md.

### P1 · Runtime configuration (no env)
- [ ] `runtime_settings` table + typed defaults + validators + `runtime_settings.spec.ts`.
- [ ] `GET|PUT /api/settings` with masked secrets, `configured` flags, `restartRequired` state.
- [ ] Server reads nothing but `DATABASE_PATH`; every other `process.env` reference removed.
- [ ] Rate limiter, CORS, bcrypt rounds, JWT lifetimes, memory monitor, DB pragmas, AI timeout and
      retries driven by the stored row (live where safe, next-boot where not).
- [ ] e2e: `globalSetup` disables the limiter through the API instead of `DISABLE_RATE_LIMIT` env.
- [ ] Settings section, tab **App**: identity, cache/version, feature flags, limits; tab **AI**:
      base URL, key (write-only), model, timeout, retries, queue concurrency; **Test connection**
      with the six states (absent, loopback-in-docker, unreachable, unauthorized, slow, ok).
- [ ] `ai_configs` (existing) folded into the same UI or explicitly retired in favour of
      `runtime_settings` — decision recorded here, then executed.

### P2 · Catalog, prices, stores
- [ ] Migrations for retailers/stores/canonical_products/variants/aliases/categories/
      retailer_listings/price_observations/external_evidence.
- [ ] Repositories + routes; FTS5 search for products, hierarchy-aware category list with the
      `category_unknown` fallback, immutable observation writes.
- [ ] `src/domain/money.ts` (cents + fractions + `es-ES` formatting) shared by client and server.
- [ ] Catalog section: tabs (Products · Categories · Stores), search, filters, pagination, row
      actions; product detail as a bottom sheet with editable metadata (name, brand, EAN, package,
      aliases, category).
- [ ] Prices section: per-product history table, delta vs previous, evidence thumbnail, "correct
      price" = new observation, chart in CSS only (no chart library).
- [ ] Quick capture (photo → proposal → preview → confirm) with no persistence before confirm.
- [ ] Nearby stores via Overpass: opt-in button only, bounded, cancellable, OpenStreetMap
      attribution, nothing persisted until confirmed.

### P3 · Shopping lists
- [ ] `shopping_lists` / `shopping_list_items` with `version`, `completed`, `completed_at`,
      `quantity` fraction, `unit`, `exact|substitutable`, link to a variant.
- [ ] List management view (all lists, create/rename/delete, useful summary) separate from the list
      detail (pending first, completed secondary, grouped by category when confirmed).
- [ ] Add/edit sheet with progressive disclosure; quantity steppers with validated bounds;
      transactional full-order writes guarded by the list version.
- [ ] Swipe gestures + Undo, with button equivalents and confirmation on button-delete.
- [ ] Realtime invalidations, deep-link restoration (`/shopping?tab=…&page=…&q=…&sort=…`), stale-edit
      409 with local-vs-remote comparison.
- [ ] Cost preview per list: totals, per-line prices, unpriced reasons, store switcher, "what the
      pantry already covers" reduction with an explicit "still add it" escape.

### P4 · Receipts, OCR and the queue
- [ ] `ai_jobs` + durable runner (lease, attempts, startup sweep) + REST + SSE progress.
- [ ] `receipts*` tables and the evidence file store (type/size/signature validation).
- [ ] OCR provider abstraction, ephemeral, Spanish; failure keeps the draft and says so.
- [ ] `POST /api/receipts/extract|validate|confirm` with idempotent confirm and arithmetic re-check.
- [ ] Review UI: editable rows (description, qty, unit, unit price, total in euros, expiry), add and
      remove rows, thumbnails per capture, PDF fallback text, undo-friendly.
- [ ] Ticket header: store, payment status/method, notes, taxes, discount — all optional, validated.
- [ ] Confirm projects lines to catalog + price observations (with the ticket's `store_id`) **and**
      into the pantry with `expiration_date`.
- [ ] History section (`ticket-history`): list of tickets with filters (store, period, amount),
      detail with evidence, "re-open for review" without losing corrections.

### P5 · Joint features (the reason to merge)
- [ ] Dish cost: recipe/plan line shows `≈ 3,40 €` from ingredient prices, with the observation dates
      used on hover; never presented as a quote.
- [ ] "Add missing ingredients to the shopping list" from a recipe, a planned meal, or the whole
      week's plan; pantry covers subtract, prices attach when known.
- [ ] Expiry pressure: planner prefers ingredients expiring sooner; "eat this today" chip in Today.
- [ ] "Bought from receipt" marks planned meals and links the evidence.
- [ ] Today: expiring within N days (N in Settings), open list totals vs weekly budget, next planned
      meal, pending AI jobs with a jump into the queue view.
- [ ] Queue view: running/queued/failed with retry, filters and pagination.

### P6 · Offline, sync, resilience
- [ ] localStorage cache layer with budgets, eviction rules and quota warnings.
- [ ] Outbox: enqueue on mutation, flush on online/visibility/timer, keep-until-acked, idempotency
      keys, no overlapping sends per entity.
- [ ] Conflict surfacing (409) with "mine / theirs" resolution UI.
- [ ] `sync_conflicts` audit rows for post-mortems.
- [ ] Adaptive heartbeat (15 s healthy, 2 s disconnected, 4 s timeout, none while hidden) and a
      visible connection chip that recovers without a reload.
- [ ] Read-only offline modes for every section, with the "pending sync" badge.

### P7 · Hardening and polish
- [ ] Log rotation server-side with the same caps as the client; retention from Settings.
- [ ] Redaction tests for both sides; no secret in any log, URL or error payload.
- [ ] Accessibility pass: focus order in sheets, `aria-current`, gesture equivalents, contrast in the
      dark theme, 44 px targets.
- [ ] i18n completion for every new string (`es` + `en`), no test asserting translated text.
- [ ] Empty/loading/error states per section (calendar pattern), skeletons only on first load.
- [ ] Budgets: per-chunk size limits in `angular.json`, lazy sections, no new runtime dependency
      without a recorded reason.
- [ ] Docs: `SETUP.md` (no env section), `RUN.md`, `SECURITY.md` (secrets, access boundary),
      `CHANGELOG.md`.

### P8 · Rename completion
- [ ] Workspace package names + every `pnpm --filter`, script, Dockerfile, Makefile and workflow
      updated in one commit.
- [ ] `data/hogaria.sqlite` default with adoption of the previous file.
- [ ] Repo renamed by the human; `supportRepoUrl` verified; CI re-verified green.

## 13. Coming soon (deliberately not in this program)

- **Household tasks**: assignments, rotations, due windows, points for kids, per-member load chart.
- **Shared calendar** beyond meals: events per member, recurrence, availability, "who cooks".
- **External calendars**: subscribe (ICS/webcal) and two-way sync with Google Calendar, plus a
  generic CalDAV adapter; conflict policy per calendar; OAuth from the UI, tokens in the settings
  store.
- **Home Assistant**: REST/WebSocket bridge — publish expiring ingredients and the shopping list as
  entities, receive notifications on fridge-door/stock events, expose "start plan" as a service call.
- **Devices**: smart-fridge and scale imports; barcode scanning via the device camera with the
  EAN lookup done locally.
- **Budgets**: weekly/monthly spend vs income, store-level price trend alerts, "this brand got 18 %
  dearer since June".
- **Multi-household**: one instance serving several homes with per-home scoping and joins.
- **Community prices**: opt-in, aggregated, privacy-reviewed publishing of anonymised observations.
- **Native shell**: TWA/Capacitor once the PWA is stable.
- Languages beyond `es`/`en`, other currencies, other units (lb/oz), tablet layouts.

## 14. Risks

1. **Package/CI coupling** — renaming workspace packages breaks `pnpm --filter` silently: P2 of the
   rename must land as one commit with the workflow. Kept out of P0 for exactly this reason.
2. **localStorage is not a database** — quota (typically 5 MB) and eviction force the budget rules in
   §5; if the outbox grows past the cap, the UI blocks new offline edits rather than losing them.
3. **OCR/AI cost and latency** — one shared queue, bounded concurrency, `max_attempts`, and kill
   switches in Settings; a missing provider keeps every manual flow available.
4. **Money arithmetic** — float anywhere is a bug; cents only, tested at the boundary.
5. **Two histories of truth** — during the merge, `pantry` and `shopping_list_items` must not both
   invent products; the catalog is the join point, and unconfirmed AI output never persists.
6. **Session/DB rename while live** — the migration adopts the existing SQLite file and the old
   storage keys; nothing deletes, and every migration ships with a keep-data test.
7. **Review size** — the program is one PR by request, so phase boundaries are commit boundaries and
   each phase is revertible alone.

## 15. Definition of done

A phase is done when: types and lint pass, migrations run on an old database without data loss,
server tests are green, the e2e suite is green in CI (chromium), the section works offline as
specified, every string is translated, nothing reads env that §4 says must not, and this file's
checkbox plus the PR body reflect reality. The product is done when P0–P8 are checked, Basketra is
feature-complete inside HogarIA (its docs list the same), and a human has tested it from their own
device — the merge stays theirs.

## 16. Agent constraints

- Atomic commits, English messages, pushed to the PR as they land; the PR body mirrors the checklist.
- Never merge without an explicit human yes in chat — defaults to no, even under "work autonomously".
- Every command runs with an explicit timeout; no unbounded waits.
- No native browser dialogs (`alert`/`confirm`/`prompt`): `ConfirmService` + `app-confirm-dialog`.
- Tabs/filters/pages in the URL through `core/utils/tab-url.ts`, defaults omitted.
- No new runtime dependency without writing down why in this file.
- The sandbox has no browser: visual verification is the human's preview, functional verification is
  CI. Never claim a look-and-feel change as "verified" on a build alone.
