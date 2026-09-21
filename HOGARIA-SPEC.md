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
- [x] Server: `none` in every enum (one definition in `utils/taste-profile`, imported by the auth and
      household schemas), `profile.modules` validated, `profile` in the response,
      `detailLevelForCookingLevel` used by the two AI routes, six unit tests.
- [x] Client: single `home-profile.ts` model (`user.model` and `household.model` re-export the level so
      the three copies cannot drift), shared `app-home-profile-picker`, service patch.
- [x] Signup without the level block (note about what comes next); tour step *Perfil* first, 5 steps,
      copy and logo about the house, progressive save guarded by the initial load.
- [x] Preferencias › Perfil as the default tab, dirty tracking/save/discard covering the profile.
- [x] e2e re-linked (5 steps, default tab, two tests now explicit about `?tab=allergies`) + the
      profile surviving a reload. Green in CI at `ad0eee4` (Type Check · Server Tests · Build · E2E).

Note for the icon pass (P0): the new picker uses an inline SVG check and no emoji, while the existing
Preferencias tab strip keeps its emoji labels — they are replaced together with the nav in the sprite
commit, so the tab row stays visually consistent until then. Test hooks are attributes
(`[data-level]`, `label[data-module]`, `input[data-module-input]`), never label copy: hints repeat
words across options and `hasText` already resolved to two elements.

## 8c. Configuración vs Preferencias: qué se configura donde, y en caliente

Two rules the user set, and they are binding for everything that follows:

1. **Parity**: everything the tour asks must be editable outside the tour. No answer may exist only in
   `/onboarding`.
2. **Modules are an app concern, not a diner concern**: which sections of HogarIA are switched on lives
   in **Configuración** (`/settings`), next to theme and language. Kitchen and body — cooking level,
   allergies, tastes, goal — live in **Preferencias** (`/preferences`).

| Pregunta del tour | Dónde se cambia después | Dueño del dato |
| --- | --- | --- |
| Qué secciones quieres llevar (módulos) | **Configuración › Módulos** | `users.preferences.profile.modules` (flag de la app, por cuenta) |
| Nivel de cocina | **Preferencias › Perfil** | `users.cooking_level` |
| Alergias e intolerancias | Preferencias › Alergias | `preferences.taste.allergies` |
| Gustos y aversiones | Preferencias › Gustos | `preferences.taste.likes/dislikes` |
| Objetivo | Preferencias › Objetivo | `preferences.taste.goal` |
| Con qué utensilios cuentas | **Despensa › Utensilios** (marcar es editar; el tour solo enlaza) | `utensils.available` |

`app.name` and the header mark are the brand; the preferences section icon stops being a salad bowl
(🥗) because the section is not about food any more: it is the person's profile (👤). Where a section
is a household-wide switch (`theme`, `language`, `modules`) it belongs to Configuración; where it
describes one diner, to Preferencias. If a future question is about the *house*, it gets its own tab
in Configuración, never a new page.

### Activation without reloading

`ModulesService` (`core/services/modules.service.ts`) is the only consumer of `profile.modules`:

- `enabled: computed<HomeModule[]>` — derived from `TasteProfileService`, so a change in Configuración
  re-renders the nav and the section entries immediately. **No reload, no re-navigation, no toast
  required.**
- `available: Record<HomeModule, boolean>` — what this build actually ships. Enabling a module that is
  not available is legal and persisted (that is what *pronto* means: switch it on today, it appears by
  itself when the build that contains it is activated). Nav shows it only while `!available && enabled`
  as a *pronto* row, never a 404.
- `visible(path)` — the gate used by the sidebar and the dashboard cards. Rule that keeps the app
  usable: **an empty selection means "everything available"**. Nobody loses `Recetas` or `Despensa`
  because they skipped the tour; a non-empty selection filters.
- Writes go through `TasteProfileService.save` and roll back the optimistic value if the PATCH fails,
  with an error toast; a module can be enabled and disabled repeatedly with no extra request per click
  (the toggle is debounced per module).
- A section that gets switched off while you are inside it stays reachable (the route is not
  unmounted mid-life); the nav entry disappears on the next render. Losing the user's place under
  their feet is worse than a stale entry.

`shopping`, `receipts` and `home` (housework) stay `available: false` until their phases (P2, P4,
Coming soon) land, so what ships today with the picker is the mechanism, not three empty pages.

## 8d. Rename: the code says HogarIA now

The branding round changed what the user sees; this one changes what the developer sees, in one commit
per surface so a revert is possible:

- npm workspace packages: `frontend` → `@hogaria/web`, `server` → `@hogaria/server`, root
  `recipeapp` → `hogaria`. **Everything that filters by name moves with it**: root `package.json`
  scripts, `.github/workflows/ci.yml` (`pnpm --filter …` × 6), `Makefile`, `Dockerfile`,
  `Dockerfile.dev`, `docker-compose.yml`, `docker-compose.dev.yml`, `playwright.config.ts`,
  `knip` config, `.github/dependabot.yml` directory entries. A `pnpm --filter frontend` that silently
  matches nothing is the failure mode to avoid here.
- Angular workspace: project key `recipeapp` → `hogaria` in `frontend/angular.json` (and `baseHref` /
  output names if present); `ng` invocations do not pass `--project`, so the rename is safe once the
  file is consistent.
- Database: default `DATABASE_PATH` becomes `data/hogaria.sqlite`; on first boot, if the new file is
  absent and a legacy `mi-cocinai.db` / `recipeapp.db` exists, the server **adopts** it (rename, not
  copy) and logs it. Never silently start an empty database under the user's feet. Covered by tests
  (`:memory:`, new file, legacy adoption, missing directory, WAL toggle).
- Strings that still say the old name: `app.name` in both dictionaries, the `logs.component` copy, the
  environment comments, README/SETUP/RUN/SECURITY/PROGRESS/COMPLETED/DESIGN-SYSTEM headings,
  `recipe-app-sdd.md` (kept as history: it gets a banner pointing at `HOGARIA-SPEC.md`, it is not
  rewritten). `storage.service.ts` keeps the literal `recipeapp_` legacy prefix — that is the migration
  path, not the brand.
- Manifest/icon identity: name (done in the branding round), `favicon.ico` **created** (the current
  `<link rel="icon">` points at a file that does not exist in the repo), `apple-touch-icon.png`, and
  the eight PWA sizes regenerated from the new mark.

### Iconography of HogarIA

One mark: **a house with a robot brain inside** — flat, two tones (primary `#F97316`, ink
`#1C1917`), no text, no gradients, readable at 32 px, safe inside a maskable circle (10 % padding on
each side). Deliverables: `icon-512.png` as the source of truth; `convert`-generated 72/96/128/144/
152/192/384; `apple-touch-icon-180.png`; `favicon.ico` (16/32/48); `favicon-32.png`,
`favicon-192.png`; a `maskable` variant with the safe padding; and `icon.svg` for the in-app mark. All
sizes produced in the repo, never at runtime.

## 8e. Shopping list & prices: the mobile interaction contract

The API existed and the module switch did nothing, which is the worst possible state for a feature
flag: it promises a screen that is not there. This section is the contract the UI implements — the
numbers below are not taste, they are the ones the tests assert.

**Routes and shape.** `/shopping` is the tray (create, open, finish, delete; `?tab=hechas` for the
history) and `/shopping/:id` is the list itself. The module registry owns `/shopping`, so switching
the module off removes the link and keeps the route alive (same rule as every other section). Nothing
else lives in the list: no filters stacked on filters, no cards inside a card — the sections of the
supermarket are the only grouping, and `Otros` always lands last.

**Gestures (and their visible twins).**

| Gesture | Effect | Twin for anyone who does not swipe |
| --- | --- | --- |
| swipe left, up to 56 px | the rail peeks out: `Editar · Quitar` | the ⋯ button on every row |
| swipe left past **60 %** of the row | runs `Quitar` on release | `Quitar` inside the sheet |
| swipe right ≥ max(56 px, 35 %) | `+1` unit | the quantity stepper in the sheet |
| long press **350 ms** | multi-select mode with a contextual toolbar | `Seleccionar todo` + tapping rows |
| tap the row | toggles the check | the checkbox itself, 30 px |

Vertical movement wins over horizontal: if the finger goes down the page, that is a scroll and the
row must not move. A tap that followed a long press is swallowed (250 ms window), or every "select"
would also toggle a check.

**Undo.** Anything that removes rows answers with a bottom bar carrying `Deshacer` and a countdown
that drains over exactly `duration` ms (the same number the timer uses, so the bar cannot lie). The
window is **6 s**; the endpoint behind it is `POST …/items/:itemId/restore` — items die with
`deleted_at`, which is why this is cheap. Deleting a *list* is not undoable (its rows are gone) so it
asks first, through `ConfirmService`, never a native dialog.

**A gesture is not a tap.** Chrome fires a `click` on whatever is under the finger when a drag ends,
so the row that was just swiped would also be toggled, opened or marked. The directive answers with
two mechanisms that are not interchangeable: a `swipeRemove` that *committed* makes the row deaf to the
pointer for 250 ms (`pointer-events: none`, removed by a timer), and a swipe that only *revealed* the
rail raises a one-use flag the component's own tap handler consumes. Timers are never the discriminator
— 200 ms and 250 ms windows both lost in CI, because the click can arrive later than the gesture by an
amount that depends on how fast the runner is. A swipe may also start **on** a row button (the far right
is where a thumb grabs): only the checkbox and text inputs carry `data-gesture-stop`, because there the
tap is the whole interaction; a button that opens a sheet keeps its click and gets the guard that the
sheet refuses a row that no longer exists.

**Autosave.** Every field commits **400 ms** after the last keystroke, per row key, and the header
says `Guardando…` / `Guardado`. Writes go through a keyed queue: tapping one checkbox four times is
one intention, not four requests, and `PATCH /lists/:id/items/:id` for the same row replaces the
pending patch instead of stacking. When the network is gone the queue keeps the operation and retries
on `online`; local state stays the visible truth meanwhile. A `409` (`LIST_VERSION_CONFLICT`) never
wins by brute force — the list is re-read and the person is told another device changed it.

**Money.** Cents in the wire, comma-decimal in the keyboard: `1,20` is 1.20 €, `1.290` is 1290 € and
`1.290,50` is 1290.50 €. An empty price is `null` and paints as `—`; `0` is a real, free line. A unit
price above 100 000 € is a slipped finger and gets rejected as invalid input, not stored. A line
stores the price **per unit**, the estimate multiplies by `quantity`, and the footer total is the only
number that ever adds across lines.

### Checklist for this feature

- [x] Tray: create, open, finish (undoable, reopens through the same PATCH), delete (confirmed),
      progress bar and money summary per row, tabs in the URL.
- [x] Detail: add line (`2 Leche`, `1kg Tomates`), paste-a-whole-list sheet (`items/bulk`), pending /
      in-the-cart tabs, category grouping, per-line price chip, estimate with per-line source
      (`manual` / `observed` / `unpriced`) and the count of lines without a price.
- [x] Gestures with the thresholds above, plus multi-select toolbar (marcar, quitar with one undo bar
      that restores every row), `Seleccionar todo`, `Vaciar carro` (undoable).
- [x] Autosave at 400 ms, keyed write queue with retry on `online`, 409 handled by re-reading.
- [x] Toasts gained `action`, `position` and `countdown` (additive; every existing call site untouched).
- [x] `checked` crosses the wire as a boolean and is accepted as `0`/`1` too — the API paints that
      column as an integer, and a client that echoes back what it read must be able to mark a row.
- [x] The undo bar is unconditional on a removal: if the request never made it the bar is still there,
      the restore 404s and the service says so, instead of the person losing a line with no recourse.
- [ ] Drag to reorder (`PUT …/order` exists and is covered by route tests; the UI still orders by
      section + `position`).
- [ ] "What the pantry already covers" reduction and the store switcher inside the cost preview.
- [ ] A price catalogue screen (history per product and store); today prices are read and written only
      through the list and `/complete`.

## 8f. Round 6: the list becomes a tool, and the calendar becomes the house's

Five things asked for, all of them the same complaint seen from different sides: the shopping list
works, but it is not yet *efficient* on a phone with one hand and it does not exploit the width a
desktop offers. And the calendar is still "the meal plan" when the house has a lot more to put in it.

### Icon button rule (small beats wordy)

`Pendientes (3)` and `Seleccionar todo` as text buttons is what eats a phone: they wrap, they push the
row content, and half the row is left unusable. The rule now:

> **If a control's meaning is a gesture everyone knows, it is an icon, not a word.** 18 px glyph,
> 40 px hit area, `aria-label` + `title` mandatory. If the meaning is *not* universal (quitar,
> terminar, vaciar carro) the icon travels **with** its word, or the row reveals it in the rail.

Emoji are out for controls: `⋯` and `✎` are typographic, drawn by whatever font the device has, and they
render at three different sizes across Android/iOS/desktop. They are replaced by `app-ui-icon`, a
standalone component with a hand-authored registry of 24×24 `path`s in Material geometry (check,
indeterminate-check, cart, list, pencil, trash, plus, camera, filter, chevron-left/right, close, people,
clock, tag, percent, order). No icon dependency is added — a registry in one file is auditable, offline
and themeable with `currentColor`, and it does not need a network install.

### Renaming a title must not get stuck

The inline rename opened a bare `<input>` with autosave and no way out: Escape did nothing, and a tap
anywhere else left the field on screen mid-row. Inline editing now owns its whole lifecycle:

- ✓ commits, ✕ reverts, `Enter` commits, `Escape` reverts, and blur **commits only if the value is
  dirty** (otherwise it just closes: leaving a field must never invent a write).
- while it is open, the row's gestures are off (`[appSwipeRow]="false"` / the sheet blocks them) — a
  swipe starting inside a text field is selection, not deletion;
- a failed rename rolls the visible name back and says so (the 409 path already re-reads the list).
- the same ✕ is added to the tray's create form, which had "Cancelar" only while the form was open
  by accident after a validation error.

### The tray is a table, with filters and pagination

Desktop `/shopping` shows: name + store, a progress bar with `x/y`, line count, money, last touched,
and who touched it. Sorting is on the header (name / importe / tocada), direction toggles, `?sort=&dir=`.
Filters, all of them **server-side** (`GET /lists?q=&store=&minTotal=&from=&to=&status=&sort=&dir=&limit=&offset=`
answering `{ data, page: { total, limit, offset } }`):

| Filtro | Control | URL |
| --- | --- | --- |
| Texto en nombre o línea | input con ✕ para limpiar | `q` |
| Supermercado (local) | `app-ui-dropdown` de los que existen en datos | `store` |
| Importe mínimo | input de €. Mismo parser de dinero que una línea | `min` |
| Toca/hasta | dos `input type=date` | `from`, `to` |
| Estado | tabs Activas / Terminadas (ya existía) | `tab` |
| Página y tamaño | ‹ › + 10/20/50, el tamaño se recuerda en `localStorage` | `page`, `size` |

On a phone the filter row collapses to one `Filtros` icon button with a count badge, opening a sheet
with the same controls and `Aplicar` / `Borrar todo`. Nothing lives twice: the URL is the state, the
sheet writes to it, the server reads from it. Filtering server-side is not a purity thing — a house with
90 archived lists must not download 90 lists to hide 89.

### Units are picked, not typed

`kg`, `u`, `ud`, `1`, `pac` typed free is how a list ends up grouping the same thing three ways.
`app-unit-picker` is a themed combobox (not a native `select`, which cannot carry the theme): grouped
catalogue (**peso** g/kg, **volumen** ml/l, **unidad** u/paquete/caja/lata/botella/docena/medias…), search
as you type, `↑↓ Enter Esc`, `role="combobox"` + `aria-expanded` + `aria-activedescendant`, an
`Otra…` escape hatch that keeps the free text (the catalogue is a convenience, never a cage) and the 6
last used units pinned on top from `localStorage`. The catalogue lives in one file
(`shared/models/units.ts`) and is used by the add-line parser, the edit sheet, the paste sheet and the
photo review sheet, so a unit is spelled the same place everywhere.

### Discounts and offers, Basketra-style

One `Descuentos` section per list, collapsed by default, with a header chip stating what is applied
(`-5 %` / `-2,00 €` / `3×2 en 2 líneas`). Two kinds, because they are two different real things:

- **Offer on a line** — `buy`/`take` (3×2, 2×1, or custom). Paid units are
  `payable = floor(qty / buy) * take + min(qty % buy, take)`. Five units of a 3×2 pay four: one full
  pack of three costs two, and the two leftovers are still two. The row's chip shows the offer next to the price (`6,50 €/ud · 3×2`).
- **Discount on the list** — `amount` (cents) or `percent` (basis points, so 12,5 % is 1250, never a
  float), and `appliesTo`: `all`, or `upToQuantity` with a unit cap ("2 € de descuento en las primeras
  3 unidades"). The cap consumes paid units in `position` order, which is what a cashier does.

`/estimate` grows a `discount` block: `subtotalMinor` (as today), `offerSavingsMinor`, `discountMinor`,
`totalMinor`. Rounding is half-up on cents at the **total**, never per line (per line it would leak a
cent and make the sum disagree with the visible numbers). A total can never go below 0 and a discount
above the subtotal is clamped and *says so* in the UI instead of silently eating the difference. Money
rules from §8e hold: cents on the wire, comma decimal on the keyboard.

### Adding by photo, with the AI as the clerk

Two calls, on purpose — a model that misreads must not silently rewrite the list:

1. `POST /lists/:id/photo/analyze` with `{ image: <dataURL>, mode: 'auto'|'ticket'|'shelf', note? }`.
   The server builds the prompt with (a) the **category catalogue as JSON** — `[{ "name", "color" }]`
   from the household's own categories, colours included so the model can echo one it recognised — and
   (b) the **expected response shape**, spelled out literally, plus the money and unit rules. It calls
   the active `ai_configs` row (the same `base_url`/`api_key`/`model`/`timeout` the recipe generator
   uses, now extracted to `utils/ai-client.ts` so there is exactly one place that talks to a provider)
   and **validates the answer with zod** (`photoLinesSchema`). It writes nothing and returns the lines
   with a `confidence` each.
2. `POST /lists/:id/items/apply` — what the person confirmed, line by line (edit, drop, keep),
   `category` included; `createCategory: true` is what adds a category with the colour the model
   proposed. Reuses the merge-by-`product_key` behaviour of `POST /items`, so a photo of a shelf does not
   duplicate the milk that is already pending.

Errors are specific because the user has to act on them: no active AI config → `409` with
`data.redirect = '/settings/ai'`; a reply that is not JSON → `422` with the model's first 200 characters
(for the log section, not for the toast); image too big → `413`; a line the model invented a price for
with no digits → it arrives with `priceMinor: null` and lands in "sin precio", which is honest.

### Live for the household, and who touched what

- `shopping_list_items.added_by` / `.updated_by`, `shopping_lists.updated_by`, and
  `shopping_list_events (list_id, user_id, user_name, action, item_name, created_at)` written on every
  mutation — the audit trail is a table, not a log line: "quién ha añadido qué" has to be queryable per
  list and readable a month later.
- `GET /lists/:id/events?limit=` feeds a "Quién ha tocado qué" sheet.
- **SSE** `GET /api/shopping/stream/:listId` broadcasts `{ type: 'items' | 'list', by, at }` to the rest
  of the household; the client **refetches** on a message instead of trusting the payload, so a missed
  event costs a stale row until the next write, never a wrong list. `EventSource` cannot set headers, so
  the stream accepts `?access_token=`, the auth middleware allows it **only** on that GET, and the
  request logger masks it — a token in a URL is a token in a log file otherwise.

### The calendar is the house's

`calendar_events (id, household_id, user_id, title, kind, date, start_time, end_time, all_day, color,
notes, source, source_id, created_at, updated_at)` with `kind ∈ meal | shopping | home | appointment |
personal | other`, CRUD on `/api/calendar/events`, and meals projected as `kind: 'meal'` (source
`meal`, `source_id`) so the plan that already exists shows up without duplicating a row per meal.

The existing month/week/day views keep their structure and gain: a **kind filter row** (chips with the
event colour, `?kinds=meal,home`, empty = everything), a `Hoy` button, `‹ ›` around the range title, and
in month cells the pills overflow into `+2 más` with the hidden ones listed on click. Events are
household-visible by default (that is the point of a house calendar) and per-member ownership is kept on
the row, painted as the author's initial in week/day views.

Recurrence, availability, ICS sync and "who cooks" stay in §13 — this round makes the calendar *general*,
not a scheduler.

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

## 11d. CI: a five-minute budget, and no silence

Two rules, and the second one only exists because of how the first was broken once.

**Budget.** No job may run over five minutes, so the work that is not testing happens once:
`install` runs `pnpm install --frozen-lockfile` plus `playwright install --with-deps chromium` and
*publishes* `node_modules` and `~/.cache/ms-playwright` through `actions/cache/save@v4`. Every other
job restores those keys and only falls back to installing when the restore missed (`if:
steps.nm.outputs.cache-hit != 'true'`). The key carries `hashFiles('pnpm-lock.yaml')`,
`github.run_id` and `github.run_attempt`, so a cache is never reused across commits and a retry never
poisons the next run. The e2e suite runs as four shards (`--shard=i/4`) with two workers each — the
count is hardcoded in the matrix, see below — and the dev-server cold compile is paid once in
`globalSetup`, not per test. Per-test timeout is 90 s in CI: 120 s turned five real failures into
sixty-nine waiting ones.

**No silence.** A workflow file GitHub cannot *validate* does not fail red: it produces a 0-second run
named after the file path and **no checks on the pull request at all**. That is how a broken CI passed
for several pushes. `make ci:yaml` (`scripts/check-workflows.mjs`, dependency-free) is the guard, and
it checks the three things that actually hurt:

- an unquoted scalar containing `: ` (YAML opens a map there and the whole file dies);
- tabs;
- expressions whose context does not exist where they were written — `runner.*` and `hashFiles()` in
  the workflow-level `env:` (they are only available inside a job, e.g. in a step's `with:`), and
  `strategy.*` in a job `name:` (use `matrix.<key>`; the shard total lives in the matrix, so it is
  written where it is decided).

**A failure has to be readable to count as a failure.** On `failure()` the e2e job uploads
`test-results/` (trace plus `error-context.md`), but the artifact store is not reachable from every
environment — `gh run download` against the blob endpoint dies with an EOF that no retry fixes. The
channel that always arrives is the annotation the reporter publishes, so a gesture test puts its
evidence *inside the assertion message*: the row's text, the visible toasts, the last handful of
`/api/shopping` responses and any `pageerror` Angular threw. That is what turned three
«element(s) not found» into one sentence: a `PATCH` where a `DELETE` belonged.

**Backticks do not belong inside a SQL or `styles:` template literal.** A comment written with
`` `column` `` inside `db.exec(`…`)` (or an Angular `styles: [`…`]`) terminates the string, and what
comes back is either a `TS1005 ',' expected` in a file that looks untouched or
`Failed to resolve styles at position 1` from the Angular compiler. It has bitten three times in this
repo; the rule is to write comments in SQL and in `styles` without a single backtick.

One more inherited trap, same family: with `"packageManager": "pnpm@10.15.0"` in `package.json`,
passing `version:` to `pnpm/action-setup@v4` is an input error — the version is written once, in the
manifest.

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
- [x] `shopping_lists` / `shopping_list_items` with `version`, `completed`, `completed_at`,
      `quantity` fraction, `unit` — plus `product_key` for merging lines and a soft `deleted_at` that
      is what makes "Undo" a call and not a resurrection. (`exact|substitutable` and the variant link
      wait for the catalogue in P2.)
- [x] List management view (all lists, create/rename/delete, useful summary) separate from the list
      detail (pending first, completed secondary, grouped by supermarket section) — see §8e.
- [x] Add/edit sheet with progressive disclosure; the sheet saves as you type (400 ms) and the row
      never shows a "Guardar" button. Transactional full-order writes exist on the server
      (`PUT …/order` + `version`); the drag that drives them is still open.
- [x] Swipe gestures + Undo, with button equivalents and confirmation on button-delete (§8e).
- [x] Autosave, keyed write queue with retry on `online`, stale-edit 409 that re-reads instead of
      winning. Realtime invalidation (SSE) is not wired: a second device converges on the next load.
- [ ] Cost preview per list: totals, per-line prices and unpriced reasons are shipped; the store
      switcher and the "what the pantry already covers" reduction are not.

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

## 11b. Test reporting: see everything, like vitest

`playwright.config.ts` uses a project reporter, `tools/reporters/hogaria-reporter.mjs`, that prints
what jest/vitest print and what `list` leaves out:

- **Run header**: seed, workers, projects, `--grep`, total tests, and the rerun command for failures.
- **One line per test**, tree-shaped on the `describe` path:
  `✓ Preferencias › el perfil del hogar se cambia aquí (2.4s)` — status glyph, title path, duration,
  `[project]` when several run, `(retried ×1)` when it took a retry, and the test's **data seed**
  (the e2e users are generated: `e2e-<seed>-<slug>@example.com`) so a run can be traced back to its
  rows. The seed is `E2E_SEED` when set (CI pins it per run) and `Date.now().toString(36)` otherwise;
  it is also written to `test-results/hogaria-run.json` with the counts.
- **Failure concentration before the summary** (the part that saves scrolling): for each failed test —
  title path, `file:line`, the assertion that broke with expected vs received, the first frame of the
  stack, the page URL and the actions of the last 5 seconds from the trace/attachment, plus the video
  and screenshot paths. Then the counts.
- **Summary**: passed / failed / flaky / skipped, total wall time, and the five slowest tests, so a
  regression in duration is visible without opening the HTML report.
- Kept: `html` (open: never in CI), `json` for `scripts/ci-e2e-summary.mjs` (annotations), `junit` for
  anyone who wants the XML. `list` is dropped because this reporter supersedes it.
- `globalSetup` writes the seed into `process.env` before the web server starts so backend logs of the
  same run can be grepped by it.

E2E ambition: every user-visible behaviour gets a test in the suite that owns it (the calendar, tab
URL and confirm-dialog specs are the model: flow + persistence + a11y hooks + the empty/loading/error
state). The suite runs on `chromium` in CI for wall-time reasons; all three projects run locally and in
`workflow_dispatch`.

## 11c. Coverage: a floor, not a poster

- Server (vitest + v8): `statements/branches/functions/lines ≥ 70` **per file** and ≥ 80 globally,
  with the `text`, `html`, `lcov` and `json-summary` reporters, so `server/coverage/index.html` is the
  visualization and the CI `Server Tests` job runs `test:coverage` and uploads the report as an
  artifact. The instrumentation ramp is honest: files enter `coverage.include` when they get a spec,
  and thresholds **never go down**; `database.ts`, `memory-monitor.ts` and `seed-data.ts` get the tests
  they need to clear the floor instead of being excluded.
- New pure code (models, mappers, the modules service, the reporter helpers) is expected at **100 %**
  of its statements and branches — including the edges: unknown module ids, malformed persisted JSON,
  PATCH failure rollback, double toggle, `:memory:` vs file, legacy database adoption.
- Frontend unit tests run in a non-blocking CI job (`continue-on-error`) until the suite is trustworthy
  in CI; UI coverage continues to be enforced where it is real: the Playwright suite. Flipping the FE
  job to blocking is a P7 item, with its own coverage thresholds in `karma.conf`.
- `pnpm test:coverage` is the one command for both; `pnpm --filter @hogaria/server run test:coverage`
  prints the table.

## 12b. Checklist for this round

- [x] Spec: this text (parity table, sections, live activation, rename, icons, reporter, coverage).
- [x] `ModulesService` + `home-profile` model at 100 % coverage, unit tests with the edges above
      (16 tests: optimistic toggle, rollback + `MODULE_SAVE_FAILED`, *pronto* not linked, `canSwitchOff`,
      `resetSelection`, registry consistency).
- [x] Configuración: **Módulos** section (available on/off, *pronto* ones pre-enableable, live nav);
      Preferencias › Perfil keeps only the cooking level; preferences icon → 👤; `.settings-group`
      count and the section i18n updated (6 keys × 2 languages).
- [x] `tools/reporters/hogaria-e2e-reporter.js` + `E2E_SEED` plumbing + reporter list in the config; run
      header, per-test lines, failure concentration, summary, `test-results/hogaria-run.json`.
      Shipped as **CommonJS**, not `.mjs`: Playwright `require`s reporter files and the repo has no
      `"type": "module"`; an ESM reporter would need a build step for one file.
- [x] Coverage: `perFile: true` at 70 % for the four metrics (a per-file floor *implies* the global one,
      and it is the one that was hiding `database.ts` at 41 % of branches); reporters text+html+lcov+
      json-summary; CI runs `test:coverage` and uploads `server/coverage/` even when the gate fails; the
      three files under the floor got tests instead of an exclusion (memory-monitor 100 %, seed-data 100/96,
      database 73 with the adoption tests). The include list is a ramp and says who is missing and when.
- [x] Rename: workspace packages (`@hogaria/web`, `@hogaria/server`, root `hogaria`) + every `--filter`
      (root scripts, CI, Makefile), Angular project key `hogaria`, `DATABASE_PATH` default
      `data/hogaria.sqlite` with legacy adoption (7 tests on a tmpdir), i18n brand strings, docs headings,
      container names, Dockerfile/compose/`.npmrc`/dependabot headers, setup and start banners.
      Left on purpose: the GitHub repo name and the `recipeapp_` localStorage key.
- [x] Icons: generated mark (`design/hogaria-icon-source.png` + `design/README.md` with the exact
      derivation), all PWA sizes really at their size, `favicon.ico` (was a declared 404), `apple-touch-icon`,
      maskable variant at 80 %, `purpose: any|maskable` split, `index.html` links, dead `shortcuts`/
      `screenshots` references removed. **`icon.svg` is not wired**: without `potrace`/`inkscape` in the
      project, a hand-made SVG would be a second, almost-but-not-quite logo; that is now a Coming-soon item.
- [x] e2e: modules toggle visible in the nav without reload; pre-enabling a *pronto* module persists
      and does not create a route; the Configuración tabs travel in the URL; the tour's parity
      assertions (each answer readable in its section). New `tests/e2e/pwa-assets.spec.ts` also asserts that
      every declared manifest icon is served **and** that its PNG measures what `sizes` claims.
- [x] PR body and `PROGRESS.md` updated; nothing merged.

## 12c. Checklist for round 5 — the list, on a phone

- [x] `shopping.model.ts`: the two money conversions as pure functions (`parseMoneyToMinor` handles
      `1,20` / `1.290` / `1.290,50` / `3,999` → 4,00 and returns `null` instead of guessing), category
      grouping with `Otros` last, `formatQuantity` that stays silent on a single unit. Verified with a
      20-case table before anything touched the DOM.
- [x] `ShoppingService`: signals per screen, optimistic toggle/+1/patch, keyed retry queue flushed on
      `online`, 409 → re-read the list and say so, and one endpoint shape copied from the server rather
      than invented (`items/bulk` takes `lines`, `order` takes `itemIds` + `version`, PATCH a list takes
      `version`, `GET /lists/:id` returns the list **with** its items inline).
- [x] `SwipeRowDirective` + `LongPressDirective` with the thresholds exported as constants and the
      geometry as pure functions (`swipeState`, `isQuickPlus`) so the 56 px / 60 % / 350 ms contract is
      testable without a finger.
- [x] Tray and detail screens (§8e checklists), including the paste-a-list sheet and the estimate
      breakdown with the source of every price.
- [x] Toasts grew `action` + `countdown` + `position`; the countdown bar animates over the same
      `duration` the dismissal timer uses, and the bottom stack is where an `Deshacer` lives.
- [x] Module flipped to available with its real path, navigation entry (sidebar and bottom bar), i18n
      keys for both languages, and the e2e that used `shopping` as the *pronto* example moved to
      `receipts` so the "activating what does not exist" rule keeps being tested.
- [x] `tests/e2e/shopping-lists.spec.ts`: 14 cases × 3 projects driving real pointer drags (reveal,
      commit-at-60 %, +1 to the right, long press into multi-select) and the undo bar.
- [x] Coverage ramp: the three shopping server files moved into `COVERED` (they were already above the
      floor); the frontend got its pure logic under `frontend/src/app/shared/**` specs.
- [ ] Not in this round: SSE invalidation, drag-to-reorder UI, price catalogue, receipts/OCR.
- [x] CI: the workflow file was invalid since the cache/shard round (expressions in the workflow-level
      `env`), which is why no check appeared on the PR. Fixed, and `make ci:yaml` now refuses that class
      of mistake instead of trusting a red job to show up. See §11d.
- [x] Three rounds of CI to make the gestures honest, all of them real bugs the tests found: the residual
      `click` after a swipe (200 ms windows lost to a slow runner → one-use flag + 250 ms deaf row), the
      ⋯ vetoing a swipe that started on it (which is where a thumb starts), and `remove()` deciding
      whether the undo bar appeared from a response that had not arrived yet.
- [x] `booleanish` now accepts the `0`/`1` the API itself prints. Marking a checkbox was silently
      un-persisting itself since the feature was born: `checked: 1` fell outside the union, zod answered
      400, the optimistic tick flipped back on the next read, and `Vaciar carro` found nothing to
      remove. Route test covers both spellings and refuses `2`.
- [x] Budget holds: install 58s · server 14s · typecheck 28s · build 35s · e2e shards 1m29s / 1m44s /
      1m11s / 2m0s — 381 Playwright tests (14 of them shopping) in four parallel jobs, every one under
      five minutes.

## 12d. Round 6 checklist — the list becomes a tool

Same rule as every other box: `[x]` only when its tests are green in CI, and the first commit of the
round is this checklist. What changed while building it is written next to the box, not hidden: the
spec is the record, including of where reality disagreed with it.

- [x] `app-ui-icon` (`ui/icon/icon-paths.ts` + `IconComponent`): 68 Material *baseline* glyphs as path
      data in TS, `currentColor`, generated by `scripts/icons.mjs` from `@material-icons/svg` and it
      refuses to write an empty file. `name` is a *type*, so a wrong icon name does not compile. No new
      runtime dependency, no font, nothing to fetch — which is what makes it survive offline. Detail
      tabs, `Seleccionar todo`, `⋯`, `✎`, the back arrow, the pending/cart mark and every tray action
      are icons now, inside `app-icon-button` (32/40/48 px hit area, `:active` scale, `aria-label` +
      `<title>` from the same `label`).
- [x] Inline rename owns its lifecycle: ✓ and ✕ buttons, Enter commits, Escape cancels *and undoes the
      auto-saved text*, blur commits only when dirty. Detail header and tray rows. The tray no longer
      has a swipe rail (its two actions are the icons in the row), so there is no gesture to suppress
      there; in the detail, gestures live on the row face and never on the title.
- [x] Custom picker, not a native `select`: `app-picker` — colour per option, type-to-filter above 8
      options, `allowCustom` so a unit that is not in the catalogue is a value and not a lost keystroke,
      listbox/option roles with `aria-selected`, arrows/Enter/Escape/Home/End, click-outside, and the
      trigger always showing what is inside. Used by units (15 formats), sections, photo mode, page size
      and the tray filters. *Not* `shared/models/units.ts` with recents: the catalogue lives with the
      screen that owns it and recents went to §13 — a `localStorage` list of units is a guess about how
      people shop that we have not earned yet.
- [x] Tray as a table: Lista / Tienda / Progreso / Total / Actualizado / acciones, header sorting with
      `aria-sort`, filters (text across lists *and* items, store, importe ≥, desde/hasta, estado) and
      10/25/50 pagination **all in the URL**, resolved in SQL with `COUNT(*) OVER ()` for the total; the
      `Filtros` button carries an active-count badge and the whole row reflows into a two-line card below
      720 px with `data-label` as the inline caption.
- [x] Money: `promo_buy`/`promo_take` per line, one list discount per list (`kind: 'amount'|'percent'`,
      `scope: 'all'|'firstUnits'` + `first_units`, `label`), the payable-unit maths in `utils/list-discount.ts`
      as pure functions, `discount` + per-line share in `/estimate`, half-up on the total and largest
      remainder for the split, clamp at 0 with `reason: 'clampedToZero'` said out loud. Naming debt: this
      spec said `appliesTo: 'upToQuantity'`; the code is `scope: 'firstUnits'` because `scope` is what the
      items PATCH already used for "que se aplica a", and `firstUnits` says what the number counts.
- [x] Photo ingestion: `POST /lists/:id/photo/analyze` (prompt carries the household catalogue as JSON —
      name *and* colour — and the exact reply shape; `photoLinesSchema` validates; cents in `priceMinor`;
      "no inventes precios"; nothing is written) → review sheet (checkbox per line, editable name/qty/price,
      proposed section, `baja confianza`, warnings) → `POST /lists/:id/items/apply` (creates the category
      when the model asks, merges through the same rule as a manual add). Four errors with four answers:
      409 + `data.redirect: /settings/ai`, 422 + `sample` (and the sample is forwarded to the log viewer),
      422 + zod issues, 400/413 for the file itself.
- [x] Categories as data: `shopping_categories` (name, `key`, colour, position) seeded from what the UI had
      hard-coded, `GET/POST /categories`, household-wide once it exists, colour painted on the group headers,
      the chips, the picker and the photo review. `utils/photo-prompt.spec.ts` asserts that the example shown
      to the model *parses with the schema that validates the answer*.
- [x] Live + authorship: `added_by`/`updated_by` (a merge paints who merged), `shopping_list_events` +
      `describeEvent` (the sentence is the server's), `GET /lists/:id/events`, SSE `GET /api/shopping/stream/
      lists/:id` and `/stream/tray` with `?access_token=` accepted *only* there and masked in the log, 15 s
      heartbeats, cap of 24 listeners with eviction; the client refetches on invalidation (it never paints
      the payload), the row shows the author's initials with the name in the tooltip, and "Quién ha tocado
      qué" is a sheet with avatars.
- [x] General calendar: `calendar_events` + CRUD, `kind` per suelta, `sharedWithHousehold` (only the author
      edits or deletes, and the read says `editable`), `allDay` clearing the times, meals **projected as a
      layer and not as rows** — `kind: 'meal'` is rejected by the POST with `MEAL_COMES_FROM_THE_PLAN`, so the
      weekly plan stays the only owner of what we eat; layer chips (Comidas + 5 kinds) with the kind colour,
      in the URL as `?layers=`, `Hoy` and ‹ › with the range title, `+n más` overflow in month cells, and an
      agenda strip under the grid for the anchored day.
- [ ] `PUT …/order` still has no drag UI: the endpoint works and the list keeps `position`, but a reorder
      handle that only moves items inside their section is a gesture of its own and it did not fit the round.
- [x] e2e for the new surfaces: `tests/e2e/shopping-round6.spec.ts` covers table headers and sorting through
      the URL, search across items, the filter badge and clearing it, pagination and page size, rename with
      Escape, icon marking, select-all, the 3×2 chip surviving a reload and removing itself, the 10 % discount
      moving the total and being removable, the photo sheet refusing to write without an AI config (and
      pointing at it), the calendar layers with a created event, a discount aimed at one product, and a calendar
      that must not ask for the same window of events twice. Not covered: drag reorder, picker recents
      (neither exists yet) — and note these specs could not be *executed* in this sandbox (no Chrome binary),
      so CI is the place where they turn green or red. Every `data-test` they use is now *checked* by
      `scripts/check-ui.mjs` rather than trusted.
- [x] §13 updated: recurrence and availability stay out, plus what this round consciously left behind.

## 12e. Round 7 checklist — the things that were quietly wrong

Round 6 shipped with three bugs that only show up on a phone or on the second click, plus a vocabulary
mismatch. The rule stays: `[x]` when the test is green, and here also *how* it was verified, because in
this sandbox the frontend runner does not exist and pretending otherwise is how a box lies.

- [x] "Ver todas" in the tray showed nothing. `status=all` is a *filter* value, not a value of the column,
      and the query was asking for `l.status = 'all'`. The schema now carries `LIST_STATUSES | 'all'` and the
      route has the three branches written out: no status → active+archived, a status → that one, `all` → no
      condition at all. Route test `la pestaña «todas» mezcla activas y terminadas` (server, green).
- [x] The calendar asked for the house events in a loop — dozens of requests, then 429 — because `visibleRange`
      was a `computed` derived from `days()`, `days()` reads the events, and the `effect()` that loads the events
      writes what `days()` reads: a feedback cycle wearing a date picker. Fixed in two places, both of which
      matter: `visibleRange` is computed from `anchor()`/`view()` with `monthGrid`/`weekDays` (the grid no
      longer depends on the data painted inside it), and `loadHouseholdEvents(from, to)` remembers the window
      it already fetched and ignores a repeat. Frontend: type-checked and built, no runner here.
- [x] An editable control always has a way out: `✕` on the inline rename (round 6) is now also a visible close
      on the three bottom sheets of the detail (`discount-close`, `photo-close`, `audit-close`) — the backdrop
      has always closed them, but "swipe away somewhere" is not an affordance you can see.
- [x] `app-checkbox` (`ui/checkbox/`): `button[role=checkbox]` with `aria-checked`, the Material check inside a
      box, `disabled`, and a 40 px hit area. It replaces the two bare `<input type=checkbox>` of the event sheet;
      the bare `<select>` of the event *kind* became an `app-picker`, so the type of an event carries its colour
      like everything else. Frontend spec written (`checkbox.component.spec.ts`), not executed here.
- [x] `app-picker` opens **upwards** when it does not fit below: inside a sheet with `overflow-y: auto` the panel
      was cut at the bottom edge and the last options of the list were physically unreachable. `flipForRoom()`
      measures on open and again once the search box has focus, because that is when a sheet may have scrolled.
- [x] Discount per product or per section — the shape of the signs in a real aisle («2 € de descuento en jamón»).
      `scope: 'all' | 'firstUnits' | 'product' | 'category'` + `target`; `MoneyLine` gains `productKey` and
      `category`, `isEligibleForDiscount()` compares *normalised* keys (NFD, no accents, lowercase) so "Jamón"
      and "jamon" are the same product, the base of the maths *and* the split both shrink to the matching lines,
      and a promised discount with no line that matches says `reason: 'noMatchingLine'` instead of pretending.
      `describeDiscount` writes "… en Jamon Serrano". The schema requires `target` (`DiscountTargetRequired`) the
      moment a scope promises a target, and the sheet refuses to save before asking the server.
- [x] Storage: the `CHECK` of `shopping_list_discounts` only knew two scopes, so the new ones could not be
      written on an existing database. `database.ts` ships the rebuild of that table (copy, drop, rename) when
      the stored SQL does not mention `'product'`, plus `target TEXT`; a fresh install gets the new shape
      directly. Five server route tests cover it (product only, whole aisle, 400 without target, forgetting the
      target when going back to the basket, and the estimate admitting it matched nothing) — green, `189 tests`.
- [x] Vocabulary: the sheet said "suelta". The pills and the sheet title say `Evento`, the type is `Tipo`, and
      the only `suelta` left in the calendar files is the Spanish adjective in "tarjetas sueltas" — which is
      about loose cards, not about the feature.
- [x] `scripts/check-ui.mjs`, wired into CI (Type Check job) and `make ci:ui`: no emoji in `frontend/src`, no
      native `<select>` outside `ui/`, no `ui/` component left unmounted, every `data-test` an e2e spec asks for
      existing in the app (the invented-selector failure mode that bit this project twice), and no direct call
      from the browser to an AI provider. It carries a **debt list** — 22 files with emoji and 5 with a native
      select, all of them pre-existing screens — that may only shrink: when a file stops offending, the guard
      says so in the log and the entry is deleted in the same commit. Verified by breaking things on purpose.
- [ ] `tests/e2e/shopping-round6.spec.ts` still cannot be executed in this sandbox (no Chromium), and the two
      new tests in it (the product discount and the request count) are therefore *read-and-checked*, not run.
      The first CI run is the one that turns them green.


## 12f. Round 8 checklist — why the app locked itself out

The user's report was one sentence with two halves: *still* too many requests, and *I cannot test
anything or see the logs in the UI*. Both are the same bug with two faces, and neither was in the
calendar: it was the request budget of the whole API, the only layer with no test —the e2e suite runs
with the limiter switched off, and the middleware lived in the same file that opens the port.

- [x] `createApp(options)` in `server/src/app.ts`: the middleware and the routes stopped being
      inseparable from `listen()`. Without this, testing the limiter meant booting a server, which is
      why nobody had ever done it. `index.ts` is now the binary: probe the `dist`, build the app, serve.
- [x] The limit is per **session**, not per `unknown`. `keyGenerator` fell back to a single shared
      bucket whenever the proxy did not set `x-forwarded-for` —which is every preview, and a lot of home
      nginx setups— so one tab in a loop locked out the entire household, including `/api/logs`. Key
      derived from the bearer token (FNV-1a, no material from the token in the key); credentials keep the
      tight IP buckets they had.
- [x] Diagnostics are outside the budget: `/api/logs*`, `/api/health*` and any `/stream` path never
      consume the quota (server test: six hits on `/api/logs` with a bucket of 1 and no 429). Blocking the
      screen you use to understand a lockout is not a defence.
- [x] A 429 now says when to come back (`Retry-After`, read from the draft-6 `RateLimit` header, exposed
      through CORS) and logs **one** line per window into the store, so the viewer shows the throttle
      instead of the user guessing it. `rateLimitFromEnv` refuses `max=0` (returns the default and warns)
      because `0` is how people write "disable" and how an app ends up with no limit at all.
- [x] The node server can serve the built frontend (`resolveStaticAsset` + `resolveStaticDir`): hashed
      chunks cached for a year, `index.html` never cached, SPA deep links to `index.html`, a missing
      `.js` a real JSON 404 (never HTML —that is the «Unexpected token '<'» blank screen), and `..`
      refused. The Dockerfile was already copying `frontend/dist` to `./public` with a `CMD node` that
      could not read it.
- [x] `core/sse.ts`: one resilient client for the two live surfaces (log viewer, shopping stream). The
      browser reconnects a failed `EventSource` once a second forever; this closes it, backs off
      (1 s → 2 → 5 → 10 → 30), gives up after N tries and says so, stops while the tab is hidden and
      makes a single attempt on return. Frontend spec: five cases (Jasmine, fake clock).
- [x] `log-store.onLogEntry()` is the single fan-out, and `addLog` calls it: previously only the browser's
      `POST /api/logs` broadcast, so every server `console.*` line entered the ring buffer and nobody told
      the live tail —the viewer looked dead while the server was talking. Verified against the built binary
      with a live `curl -N` of `/api/logs/stream` (the marker appeared without reloading).
- [x] Error interceptor: one toast per status and window (30 s for a 429, 4 s for the rest), with the wait
      written in the message. A wall of identical toasts is how the screen becomes unusable — «no me deja
      probar nada».
- [x] CI runs the **whole project**: `playwright.full-stack.config.ts` boots `node server/dist/index.js`
      (prod build, limiter ON, SSE intact) and `tests/e2e/full-stack/` covers serving + deep links, the
      request budget of the calendar and the cart, the live log tail, and the limiter contract (429 with
      `Retry-After`, diagnostics unaffected, quota recovers, other sessions untouched). Same command
      locally: `pnpm run test:e2e:full-stack`, or `make test-e2e-full-stack`.
- [x] `tsconfig.e2e.json` + `pnpm run typecheck:e2e` + a CI step: Playwright transpiles without checking
      types, and the first run of this found a `toHaveCount(0, { message })` whose "message" option does
      not exist —the failure the author wanted to label has been unlabeled ever since.
- [x] `server/src/app.spec.ts` (9) and `server/src/utils/log-store.spec.ts` (3) are the first tests of
      those two layers; `pnpm --filter @hogaria/server test` is green at 202.
- [ ] The four full-stack specs could not be *executed* here (no Chromium in the sandbox); what was
      executed is the same thing by hand with `curl` against the built server: HTML at `/`, 200 for a real
      chunk, JSON 404 for a missing one, `index.html` for `/shopping/una-lista`, SSE with the live marker,
      the 600-per-minute cut with `Retry-After: 47`, and `/api/health` + `/api/logs` answering the whole
      time the probe bucket was blocked. CI is where they run as Playwright.
- [ ] Limits are still configured with env, not from `/settings` —there is no `runtime_settings` table
      yet (§10), and a rate limit is the wrong first consumer of a feature that does not exist.


## 12g. Round 9 checklist — a discount that can name several products, and a purchase that cannot close without prices

Three things from the user, and only one of them was cosmetic: the agenda under the calendar had a second
add button and no styling at all; the discount still could not say "2,50 € on these four products"; and
closing a purchase was free to invent nothing and learn nothing — you could mark a list as paid with lines
that had no price, and the price that *was* recorded did not know which shop it belonged to, although the
same milk has another name and another price at Mercadona than at Lidl.

- [x] `shopping_list_discounts.targets` (JSON array of product keys or section names) next to the legacy
      `target`. The engine gets a set instead of a string: `isEligibleForDiscount` matches `product_key` or
      the name's key, `basketMoney` builds its base from the matching lines, and `describeDiscount` writes
      «2,50 € en jamón, queso · +2 más» so what the shelf promised and what the basket applied are the same
      sentence. A discount that can only ever hit one product is a discount nobody can type at the till.
- [x] `discountSchema` accepts `targets` and only requires a target of some kind when the scope promises
      one; the `PUT` stores both shapes and the `GET` reads them back, so an old row (single `target`) keeps
      working with no data migration.
- [x] The discount sheet picks products **from the list** (rows with section, quantity and price, checkbox
      multi-select, "toda la sección X") instead of one free-text `app-picker`; the bar's affordance stops
      being a bare percent icon and says «Descuento · no aplicado» / «Descuento · 2,50 € en …»; and the
      multi-selection toolbar offers «Descuento a estas N líneas», which opens the same sheet pre-targeted.
      One editor, three ways in — the sheet is not where the discount is decided, the aisle is.
- [x] `POST /lists/:id/complete` refuses what it cannot learn from: if a bought line has no price, 409
      `PRICES_MISSING` with the offending lines (id, name, quantity, unit) and the count. Not a warning in
      the toast — the app has been asked to *remember prices* by closing the list, and closing it with holes
      is how the next estimate comes back wrong.
- [x] Prices can arrive *with* the close: `POST /lists/:id/complete { prices: [{ itemId, priceMinor,
      quantity?, store?, productName? }] }` writes each one onto its line and records the observation in the
      same transaction, so "pago y apunto lo que he pagado" is one tap and not a race between two calls.
      `quantity`/`productName` exist because a receipt says what was paid for what was carried, under the
      name the shop printed.
- [x] A price without a shop is not a price: `prices[].store` or the list's `store`, and with neither, 409
      `STORE_REQUIRED` with a hint naming where to set it. This is what "el precio del producto por el
      establecimiento" means as a constraint the server can check.
- [x] `estimate` resolves the observed price **for the list's shop first**, then falls back to the most
      recent one from any shop and marks the line `otherStore` with the shop's name. Two rows in
      `price_observations` for one `product_key` are the point of the table, and reading `ORDER BY
      observed_at DESC LIMIT 1` across all of them was silently pricing the house's milk with Lidl money.
- [x] Same product, different name: `PATCH /lists/:id/items/:itemId` accepts `productKey`, so a line can
      declare itself to be the product the house already tracks, whatever the shelf calls it. `GET /prices`
      filters by `store`/`productKey`, and `GET /prices/products?q=` returns the known products with their
      variants (name per shop, price, observations) to feed the picker and the per-shop price chips.
- [x] The agenda is a section: its own card with padding and rhythm, a title that says the day in relative
      words, rows that are not the 11 px variant built for a month cell, and an empty state that offers
      something to do. `[data-test="agenda-add"]` disappears — the header's «+ Evento» is the only add
      button and it opens the modal with the day in view prefilled, so nothing is lost by removing it.
- [x] Tests: `list-discount.spec.ts` for the set semantics and the plural description; `shopping.routes.spec.ts`
      for storing `targets`, the two 409s of `complete`, prices written by the close, per-shop resolution and
      the `productKey` link; `tests/e2e/full-stack/` and the dev suite for the flows that only exist in the
      browser (discount on two products, close blocked until the prices are in).
- [ ] Still env-configured, not `/settings`-configured: the completion rules are code, and the list
      of "shops this house uses" comes from the `shopping_lists.store` column, not from a catalog
      table. A `stores` table with its own name per product (and a barcode) is the next step, and it
      is in §13 rather than here because it needs a UI of its own.
- [ ] The four money flows in `tests/e2e/full-stack/shopping-money.spec.ts` typecheck (`pnpm run
      typecheck:e2e`) but were not *executed* here —no Chromium in the sandbox—, so CI is where they
      turn green. What was executed: the 22 new vitest cases (224 green in total), the prod build,
      `tsc` of app and spec, `check-ui` at 126 files with the removed `discount-row` caught by the
      guard itself, and the discount/multi-target behaviour read back from the API by hand.


## 12h. Round 10 checklist — one control per decision, a discount that belongs to the line, and clocks that mean what they say

Four things from the screenshot of the line sheet, and the fourth was app-wide.

### The line sheet (units) — done

- [x] The unit control is **one** control. The quick chips (`ud kg L pack`) and the picker below
      repeated the same value twice, and a row that offers the same choice twice is a row that
      disagrees with itself the moment one of the two is stale. Both are gone; the sheet has
      `app-unit-picker` and nothing else for that decision.
- [x] Families: the picker groups by what is being measured —peso, volumen, unidades, envase,
      medida de cocina— and choosing the family **selects its default unit** (Peso → kg, Volumen
      → L, Unidades → ud). Refining inside the family is one more tap, not another control, and
      writing «bote de 400 g» by hand keeps working because a unit that is not in the catalog is a
      unit someone actually uses. `unit-families.ts` holds the data and `canonicalUnit`, shared
      with the paste parser so «1kg Tomates» and «1 KG Tomates» are the same row.
- [x] `app-unit-picker` is a component that wraps `app-picker` (the trigger that always says the
      value, the filter, the keyboard, `allowCustom`) instead of a fourth copy of the pattern. It
      also names the family it resolved to under the trigger, because «kg» alone is a number
      without a story. The photo review has no unit control yet —its units come from the model—
      so the picker has one consumer today, which is what the sheet needed.

### The line discount — done

- [x] `shopping_list_items` gained `disc_kind`, `disc_value_minor`, `disc_percent_bps`,
      `disc_units` via `addColumnIfMissing`. Four columns and not one JSON blob: `estimate` sums
      them for the header in one pass, and a blob has to be parsed per row to do arithmetic.
- [x] `applyLineDiscount` in `utils/list-discount.ts`, applied **after** the offer and **before**
      the basket coupon, which is the order a till uses: `3x2 → -10 % sobre 2 unidades → -2,50 €
      de la cesta`. Applied in the other order, the same receipt gives a different number, and
      there is no way to argue with it afterwards. The percent is taken on what is *paid* (with a
      3x2 on six units, 5 % of four units' worth), because that is what the sign at the shelf
      means.
- [x] Percent or amount over the first N units (`disc_units`) exists because that is a real sign
      («50 % en la segunda unidad», «2 € en los dos primeros») and without it the only honest
      option was to lie about the whole line.
- [x] Clamped and said: a 2 € discount on a 0,95 € line lowers it to 0,00 and the row says
      `clamped`; a cap of two units when the basket holds one says `fewerUnits`. It never goes
      negative and never refunds the rest of the basket.
- [x] `createItemSchema`/`updateItemSchema` take `discount` (and `discount: null` removes it,
      which is why it is not a `COALESCE`); `POST` writes the four columns and merging two lines of
      the same product carries the incoming discount over; `PATCH` writes all four at once, because
      half a discount is worse than none; `estimate` returns `lineDiscountMinor` per row,
      `lineDiscountDescription` and `lineDiscountReason`, plus `lineDiscountMinor` at basket level;
      the audit trail logs `item.discount`.
- [x] The sheet got the block («Descuento en esta linea»: ninguna / porcentaje / importe, with
      «sobre cuantas unidades»), a live «de 0,95 € a 0,86 €» line while typing, and autosave like
      every other field in that sheet — one debounced commit for the whole sheet, so tapping a
      discount chip cannot swallow the price being typed. The offer block stayed separate on
      purpose: an offer says how many units you pay for, a discount says how much; they are two
      questions and they stack exactly like at a till. The row shows a chip with the discount so it
      is not only visible while the sheet is open, and the breakdown strikes the old price.
- [x] Closing the purchase separates the two numbers: `paidMinor` subtracts the line discount (that
      is what left the wallet), while the price the household *learns* is the shelf price —learning
      0,75 today would make next week's estimate lie.

### Clocks — done

- [x] The server stored UTC in a column without saying so: `2026-09-20 09:44:18` has no zone, so
      the browser read it as *local* and everything moved by the offset —in Madrid, two hours: a
      list saved a second ago said «hace 2 horas» and the log viewer printed tomorrow's
      timestamps. The fix is at the boundary: `timestamp.middleware.ts` rewrites naive
      `YYYY-MM-DD HH:MM:SS` (and `T…` without zone) into ISO with `Z` on the way out, for JSON
      responses only, keyed by the field name so a note that mentions a date is not rewritten.
      Date-only strings are left alone on purpose: `2026-09-20` is a day on a calendar, not an
      instant, and adding a zone to it would move the lunch to the previous day.
- [x] `frontend/src/app/core/time.ts` owns what the client knows: `clientTimeZone()` (Intl,
      detected, not typed), `parseInstant` (Z or naive-UTC), `formatTime`/`formatDateTime`/
      `formatDay`/`formatTimePrecise`, `toDayKey`, `daysUntil` and a `formatRelative` that says
      «hace 3 min» or «16 sept» by distance. Every hand-rolled `new Date(value)` in a component
      goes through it: the tray's «Guardado», the audit trail, the log viewer's clock, the pantry's
      expiration chip. The audit rows carry the absolute time in their `title`, and the log viewer
      says which zone it is showing —the server speaks UTC, so comparing the two used to be
      guesswork.
- [x] Calendar dates keep the local-day rule from `calendar.util.ts` (`toISODate` from local
      parts): that file already stopped the UTC-shift bug for meals, and the same rule now applies
      to expiration and receipt dates —a product does not expire one day earlier because you fly to
      Lisbon. Two places broke it and are fixed: the pantry's edit form pushed the day through an
      instant (`toISOString().split('T')[0]`), and its «Caducado» badge counted milliseconds, so
      at 23:00 on the expiry day the yoghurt was already expired.
- [x] The same day-vs-instant mistake was in the pantry's **SQL**, and it was worse:
    `expiration_date >= datetime('now')` compares `2026-09-20` with `2026-09-20 10:50:08`
    lexicographically, so what expires today counted as *expired* from the first hour of the
    morning and never showed up in «next 3 days». The filters now compare `date()` to `date()`.
    And the two pantry filter flags were declared `z.boolean()` in a query schema, which never
    parses a URL —every «solo caducados» from the app was a 500 with a ZodError. There is now a
    `queryFlag` that takes `true`/`1`/`false`/`0`, and a route spec that pins both behaviors.
- [x] Tests: the middleware on a Hono app (naive → Z, date-only untouched, JSON of the real API
      checked in the shopping routes suite, non-JSON left alone), the engine table for line
      discounts (order, clamp, per-units slice, merge, removal), `time.spec.ts` for
      parse/format/relative with the zone passed explicitly so it runs in any browser,
      `unit-picker.spec.ts` for the families, and `pantry.routes.spec.ts` for the day math.
- [x] Verified against the built server, not only against the tests: an item with `3x2` plus
      `-10 %` estimated `400 → 360` on six units of 1,00 €; a 2 € discount on a 0,95 € line
      reported `clamped`; `discount: null` cleared the four columns; closing the list reported
      `paidMinor 405` while the remembered price stayed at 1,00 €/ud; every timestamp in the
      responses ended in `Z` while `expiration_date` stayed `2026-09-20`; `?expired=true` returned
      the day-old yoghurt and not today's, and `item.discount` appeared in the audit trail as
      «Sonda B ha cambiado el descuento de «Tortilla»».

## 12i. Round 11 checklist — the picker as a list of things you can choose, and the person visible wherever something happened

Feedback on the screenshots of the line sheet, plus one thing that was visible on screen.

### The unit picker, again (it was half right)

- [x] Families are **not** a choice. A family is a title: what you can tap is a unit. The
      previous round made "Peso" an option that selected `kg`, which read well in the spec and
      badly on the phone —the trigger then said «Volumen» instead of «1,5 L» because the family
      row and the unit row shared the value `L` and the picker matched the first one.
- [x] No per-row descriptions. The hint next to each unit was cut to two letters in a
      320-pixel-wide column; a truncated description is noise with an ellipsis. Title only.
- [x] The trigger says the unit, and the panel is the list of units grouped by title. Typing
      still filters across everything, and writing «bote de 400 g» is still a value.

### The photo sheet was printing its own test attribute

- [x] `data-test="photo-drop">` was visible as text in the drop zone: the tag was closed before
      the attribute, so the attribute became content. Fix the markup, and teach `check-ui` to
      catch the shape —an attribute-looking token sitting between a `>` and a `>` is not
      something a user should ever read.

### Who is using this, in the sidebar

- [x] Bottom-left is the **person**, not a logout row: avatar (their photo if they set one,
      otherwise their initial —like Google's chip), their name, and a separate small logout icon
      button. One tap does not log you out by accident, and you can see who you are logged in as.
- [x] The layout's own icons stop being emoji (`🏠 📦  📅  👨‍👩‍👧‍ 👤 🤖 📋 ⚙️  ☰ ✕`): same
      rule as the rest of the app, and it takes `main-layout` off the guard's debt lists.

### The person, in every history line

- [x] Wherever a line says *who* did something, it shows the **same icon**: the shopping row
      (it printed bare initials letters), the tray, the audit trail (already an avatar) and the
      household agenda (which computed initials by hand in two places). `app-avatar` is the only
      implementation of "a person as a circle".
- [x] For that to be a picture and not a letter, the reads that already join a name now join the
      avatar too: `added_by_avatar`/`updated_by_avatar` on shopping items, `authorAvatar` on
      calendar events. The client never guesses a color: `app-avatar` hashes the name, so the
      same person is the same circle everywhere.
- [x] Tests: the unit options contain no family values and no duplicated values (that is what
      made the trigger lie), `app-avatar` renders the initial when there is no image, and the two
      API reads return the avatar field they promise.

### How it actually turned out

- The group titles live in `PickerOption.group`, and `rows()` returns a discriminated union
  (`kind: 'header' | 'option'`). Two `@if (row.kind === …)` blocks, not `@if/@else`: the AOT
  compiler does not narrow a union in an `@else` branch and fails the *build* with NG1
  «Object is possibly 'null'» even though `tsc -p tsconfig.app.json` is happy —`ng build` is
  the gate that catches this class of template bug.
- The unit field's caption under the trigger ("Peso") went with the row descriptions: the icon
  in the trigger already says the family, and two descriptions of the same thing in a 320 px
  column is one too many.
- A comment with markdown backticks inside `styles` broke the *client* and nothing else: the
      first backtick closes the literal, the CSS after it becomes code, `styles` ends up an
      array of several entries and the AOT reports `Failed to resolve styles at position 1 —
      Value could not be determined statically` (NG1010). `tsc` is happy with it, since the
      result is still valid text for the type checker. Rule 7 of `check-ui`
      (`backtick-cierra-el-literal`) is that trap: no backticks inside a comment that lives in
      `template`/`styles` —and no, `ng build` is not optional in a round that touches them.
- `check-ui` grew rule 6 (`atributo-como-texto`) and prints its rule count; it flags the broken
  drop zone, stays quiet on the fixed one and on `a > b ? "x" : "y"`. `main-layout` left the
  emoji debt list (20 files left) and the icon set is 85 names.
- The sizes follow the row: `xs` in list rows, agenda chips and the tray, `sm` in the audit
  sheet. `.detail__who` stopped being a circle —it used to draw one around the letters, which
  would have nested two.
- On the way, the tray rows gained the owner of each list (`ownerName`/`ownerAvatar`), because
  the history tab is exactly where «did I close this?» is asked.
- **What the app still cannot say:** a `meals` row has no author —the table has no user column,
  a meal belongs to the calendar day, not to whoever typed it— so the food part of the agenda
  has no face to show without widening the schema. `calendar_events.user_id` exists, and those
  lines do show one.

## 12j. Round 12 checklist — the agenda belongs to the house, the avatar has to be readable, and the account is editable

Four complaints, one of them about something that was simply invisible.

### The calendar is not the property of the kitchen module

- [x] `?layers=` and the shared agenda (round 9) made `/calendar` a section of the house: shopping
      lists, house tasks, personal sueltas. But the registry still owned the **route** from the
      `meals` module, so switching off «Comidas y recetas» deleted the whole agenda —route and nav
      entry— which is the opposite of what that switch means.
- [x] `MODULE_REGISTRY.meals.paths` is `['/recipes']` now. What the module governs is **what is
      kitchen inside the calendar**, not the calendar: the Comidas layer, the meal affordances in
      the three grids, the goal ring and the calories/plan strip, the `Objetivo` pill and
      `Planificar IA`.
- [x] The grids receive `kitchen=false` and stop offering what the account turned off; the days
      arrive with `meals: []`, so the blocks cannot leak in through the data. A shared
      `?layers=meals` link with the module off is ignored —not an error, and not written back to
      the URL, because that would re-add the thing the person just turned off.

### An avatar you can actually see

- [x] `app-avatar` painted `[style.background-color]` from the **`color` input** and never from
      the hashed colour of the name. Nobody passing only a name —which is every line of the app—
      got no circle: white initials over the page background. And a photo had no edge, so it
      merged into the card behind it.
- [x] Background always resolves (an explicit `color`, otherwise the hash of the name); the
      initials take **white or ink depending on the luminance of that background**, so the pair is
      readable on both themes; a photo gets a 1 px ring in `--border-strong` so the circle is a
      circle on any surface.
- [x] Fixing the component fixes everywhere, which is the point of round 11 having made it the
      only rendering of a person.

### The person's own account, in Preferences

- [x] `/preferences` gains a **Cuenta** tab with the three things the server already accepted and
      the UI never showed: the display name (`PATCH /auth/profile`), the photo, and the password
      (`POST /auth/change-password`, which checks the current one before replacing it).
- [x] The photo is resized **in the browser** to a square JPEG of 128 px before leaving the
      device, and it is stored as a file: `POST /api/auth/avatar` writes it in an `uploads`
      directory next to the database and `users.avatar` keeps a path
      (`/api/uploads/avatars/<userId>.jpg`), not the bytes. It is served under `/api` so the dev
      proxy carries it without touching `proxy.conf.json`.
- [x] Why a path and not a data URL: `users.avatar` is read by the subqueries that decorate every
      shopping row, every audit event and every agenda chip. A 40 KB data URL there is 40 KB per
      row on every list view, and the list view is the hottest screen of the app.
- [x] `updateProfileSchema.avatar` was `z.string().url()`, which rejects the very path the app
      generates for it. It becomes: an `uploads` path, an absolute URL, or `null` to clear.
- [x] Name, photo and password each have a cancel that restores what was there — the standing rule
      for any editable control — and nothing uses `window.prompt` for a new password.

### «Sin oferta» and «Sin descuento» have to look like what they are

- [x] They were muted caption-coloured chips: a removal action that reads as a label is not a
      button, and the person cannot see that it is the way out. The chip gets a `--clear` variant:
      accent ink, the `close` icon, and the same height as its neighbours.
- [x] Tapping the offer preset that is already on **takes it off**, like every other chip in the
      app; tapping the discount kind that is active goes back to `Sin descuento`. The hint line
      keeps saying what will be paid, and that is the feedback — no toast for a toggle.

### Tests

- [x] The registry no longer claims `/calendar`; `isPathVisible('/calendar')` is true with the
      kitchen module off, and `isPathVisible('/recipes')` is false.
- [x] The avatar's colour pair is a pure function (`avatar-palette.ts`) with its own spec: a name
      always resolves to a background with enough contrast for the initials, and the choice is
      stable for the same name.
- [x] `POST /api/auth/avatar` writes, replaces the previous file, and refuses a non-image MIME and
      an oversized body; `PATCH /auth/profile` accepts the app's own path and clears with `null`.
- [x] The line sheet: clicking the active offer preset clears the draft, and clicking the active
      discount kind returns it to `none`.

## 12k. Round 12 — how it actually turned out

The five things asked for, in the order they were done. What is checked below is checked by a test
that runs; what only a pair of eyes can decide says so.

### The agenda stayed, the kitchen went away

- [x] `MODULE_REGISTRY` no longer owns `/calendar` (`meals.paths` is `['/recipes']` alone), so
      `moduleOwningPath('/calendar')` is `undefined` and the route is core: it survives every switch
      in Configuración. `modules.registry.spec.ts` pins that, and the Karma spec of the service
      follows the same rule through `isPathVisible`.
- [x] The view does not disappear; its kitchen content does. `calendar.component.ts` injects
      `ModulesService` and derives `kitchen()`, and `mealsVisible() = kitchen() && showMeals()`.
      With the kitchen off: no Comidas chip, no Objetivo, no Planificar IA, the period strip
      collapses to `cal-strip--bare` (only the error line is left), the month cells lose the `+`,
      the week and day grids show the household agenda instead of meal slots, and `?layers=` neither
      writes nor honours `meals`.
- [x] The three grid children take `[kitchen]` as an input rather than reaching for the service —
      the day component keeps its aside only when there is a kitchen, and the week's `is-empty`
      marker means "no plans" only in the sense the person can still act on.

### An avatar you can actually see, everywhere

- [x] `avatar-palette.ts` is the whole decision, in the open: eight discs, a tint of the hashed
      colour at 84 % over the ink, and the letter in the colour that clears WCAG contrast against
      that specific disc (`contrastRatio ≥ 4.5`, asserted for all eight and for a smiley-name
      surrogate pair). `avatar-palette.spec.ts` runs it in the pure-test bridge — no browser, so the
      numbers are the verification; how it *looks* is the preview's.
- [x] `app-avatar` is the only place a face is drawn, so fixing it fixes the header, the sidebar
      chip, the household list and the line sheets. `ink` is a getter, not a `computed`: with plain
      `@Input()` fields a `computed` keeps a stale value when a row is reused.
- [x] A photo gets a double ring (inset `--border-default`, outer `--border-strong`) so the circle
      is still a circle on a white card, and a 404 photo falls back to the initials instead of a
      blank disc (`broken` + `.avatar__initials--fallback`).
- [x] The mobile header was the one avatar that ignored the stored photo — it binds `userAvatar()`
      now, so the face you chose is the face you get at 400 px wide too.

### The account, editable from Preferencias

- [x] New `Cuenta` tab, first in the strip: the sidebar opens `/preferences` from the person's own
      avatar, so the account is what should be there when they arrive. The tab strip became a loop
      over a `tabs` list with `app-icon`s — four emojis out, `preferences.component.ts` out of the
      `sin-emoji` debt list in `scripts/check-ui.mjs`, and the footer button that saves the
      *comensal* profile is hidden on this tab because this tab saves itself.
- [x] `uploads.ts`: files on disk next to the database, `dirname(DATABASE_PATH)/uploads` (and a
      per-process temp dir under `:memory:`, which is what keeps the suite out of the repo). The
      stored value is the *path* — a base64 avatar in `users.avatar` would be paid per row in the
      shopping and calendar subqueries that decorate every line with its author's face.
- [x] The filename is the server's, never the client's: `storeImage` sanitises the owner id and adds
      a random suffix, and `uploads.spec.ts` proves that a `../../etc/passwd` id comes out as one
      safe component inside `avatars/`. `resolveUploadUrl` refuses anything that escapes the kind
      directory, and `deleteUpload` reports whether there was something to delete (`rmSync` with
      `force` does not throw on absence, so answering `true` there would be a lie).
- [x] `GET /api/uploads/:kind/:file` is mounted next to the API routes and is *not* behind the
      token — an `<img>` cannot send one — which is why the random suffix is the whole permission.
      `auth.routes.spec.ts` uploads a real PNG, reads it back through the public URL and checks the
      profile carries the path.
- [x] The public route is out of the request budget (`EXEMPT_PATHS`), next to `logs` and the SSE
      streams: a tray with thirty authored rows is thirty `img` GETs that cannot carry a token to
      key on, and round 7 is the precedent for what that does to a household.
- [x] `avatarField` accepts the app's own `/api/uploads/avatars/…` path or an absolute URL:
      `z.string().url()` was rejecting the exact string the server hands out, which is the kind of
      bug only an end-to-end test catches. `null` clears it, `sanitizeUser` omits the key when there
      is no photo (never an empty string), and the service's `avatar: avatar ?? undefined` matches.
- [x] `avatar-image.ts`: the file never leaves the device in a form the server would reject —
      JPEG/PNG/WebP, 4 MB, cropped to a 128 px centre square and re-encoded at 0.72 in a canvas.
      The pure half (`avatarFileError`, `squareCrop`) has a spec; the canvas half is browser-only.
- [x] Name and password need no new endpoints, only a screen: `updateProfile` keeps the cached user
      in sync (so the sidebar renames itself with the same signal), `changePassword` maps the
      server's English `Current password is incorrect` to a Spanish line, and every one of the three
      blocks has its own Cancelar — the password fields are wiped, not left typed on the screen.

### The chips that take things off

- [x] `.detail__chip-btn--clear`: dashed border in `--error`, no `--active` state, and it applies to
      `Sin oferta` (which had a `--muted` class with no rule anywhere — that is why it read as a
      caption) and to `Sin descuento`.
- [x] `pickOfferPreset` / `pickLineKind`: tapping the chip that is already on turns it off, with
      `aria-pressed` carrying the state the colour no longer can. No toast for a toggle: the hint
      line already says what will be paid.

### Verification

- [x] Gates: `tsc -p tsconfig.app.json`, `ng build --configuration production`,
      `node scripts/check-ui.mjs` (137 files), server `tsc --noEmit`, server vitest 271 tests with
      94.86 % statement coverage, `npm run typecheck:e2e`, and the frontend pure bridge at 45 tests.
- [x] New e2e for the round (`tests/e2e/round12.spec.ts`): kitchen off with the agenda alive and
      usable, the avatar disc readable, the photo visible in both menus and served by the public
      route, and the two removal chips. `tests/e2e/preferences.spec.ts` covers renaming, the photo
      and the three password fields against the real API.
- [ ] Not verified here, and it cannot be: whether the tint reads as *nice* rather than merely legal,
      and how the crop behaves on a face that is not centred. That is the preview's job.

## 12l. Round 13 checklist — the person gets a page, the history says *now*, and the filter keeps its distance

### The layer row was flush against the card

- [x] `.cal-layers` sits inside `.calendar__panel`, which has no padding of its own — every band
      there sets its own 16 px laterally (`.cal-top`, `.cal-strip`). The layer row never did, so the
      filter chips touched the border of the card and read as something outside the screen.

### Who acted is resolved to today's name

- [x] `readEvents` selects `COALESCE(u.name, e.user_name)`: the feed shows the name the person uses
      now, and the row's snapshot stays in the table as the fallback for an account that no longer
      exists. Round 11 froze the name "so a rename cannot rewrite history"; in a household feed a
      stale first name on your own line is not history, it is a bug — the audit trail keeps the
      snapshot, the screen resolves it.
- [x] The client paints its *own* rows from the live session (`auditFace` in the shopping model, with
      a pure spec): a rename or an uploaded photo must show in the history without a refetch, or the
      success toast lied.
- [x] `ha anadido` / `lineas anadidas` — the ñ and the accents were missing in the two server
      sentences and the two frontend toasts that print them.

### Mi cuenta, outside Preferences

- [x] `/account` is its own page with three sub-sections — **Cuenta** (name, photo), **Seguridad**
      (password, ending this session) and **Información** (what the app keeps in this browser, the
      version, the id, the household link) — reached by tapping the face in the sidebar. Preferences
      goes back to being about the *diner*: perfil, alergias, gustos, objetivo.
- [x] The tab travels in the URL (`?tab=security`) with the default left clean, as everywhere else,
      and `/account` is core: no module switch hides your own account.
- [x] The account state is seeded from the session signal through an `effect`, not once in the
      constructor — the user may still be loading from cache when the page opens.

### The dev database was a test dependency

- [x] `calendar.routes.spec.ts` imported its routes statically, so `app.config.js` was evaluated
      *before* its own `process.env.DATABASE_PATH = ':memory:'` line: the spec ran on
      `server/data/hogaria.sqlite`. Any local use of the app (a registration seeds
      `shopping_categories`) then broke its `DELETE FROM users` cleanup with an FK error — nine red
      tests whose only cause was that somebody had used the product. Dynamic import, like its
      neighbours.

### Tests

- [x] `tests/e2e/account.spec.ts`: entering through the sidebar face, the three tabs in the URL,
      renaming visible in the menu *and* in the history line without a reload, uploading a real PNG
      and reading it back through the public route, the ring around the photo, the password rules and
      the Cancelar that wipes the fields, and the storage inventory.
- [x] `preferences.spec.ts` asserts the opposite: the account is not there any more.
- [x] `shopping.routes.spec.ts` proves the rename shows in the feed while the stored snapshot stays.

### How it turned out

- The layer row, the accents and the identity fix are small; the page split was not. Moving the
  account out of Preferences deleted ~460 lines from that component and left it doing one job again —
  and it fixed a bug nobody had reported: `/preferences` was opening on the account tab, which is why
  «Preferencias» felt like it had changed subject between rounds.
- `auditFace` is deliberately narrow: it only touches rows whose `user_id` is yours, and only the
  prefix of the sentence. A helper that rewrote other people's text would be rewriting the audit
  trail, which is the one thing round 11 was right to freeze.
- Not verified by eye, and not run: this sandbox cannot install Chromium, so the four new `e2e`
  cases are written against the contracts (selectors, `data-test`, copy) and have never executed. The
  unit and route suites are green — 272 server tests, the pure frontend models under the vitest
  bridge, `tsc` for app and specs, the production build, `check-ui` on 141 files. Nothing here can be
  called visually confirmed.

## 12m. Round 13b — a photo that reported success and was not on disk

Reported from the preview: uploading the avatar showed a green toast, the face did not change, and the
server log said `GET /api/uploads/avatars/<file> 404` seven milliseconds after the `POST` that had
just answered `200`.

- [x] **A write that did not stick has to fail the request.** `storeImage` now verifies
      (`assertWritten`): the file exists and has the bytes it was given. `mkdirSync` and
      `writeFileSync` can both "succeed" against a directory that is about to disappear —a volume
      remounted, a workspace restored, a deploy that forgets `data/`— and the only honest answer is
      `500 UPLOAD_WRITE_FAILED` with the absolute path in it.
- [x] **A rejected upload leaves no trace in the database.** The `UPDATE` runs after the write is
      confirmed, so the profile keeps the photo it had; a row pointing at nothing is a 404 forever,
      which is precisely the state the user was stuck in.
- [x] **A 404 on an image is not cacheable.** The miss answers `cache-control: no-store`, so the
      next load can recover the file instead of staying blank until a hard reload; the hit keeps
      `immutable` because its name changes with every upload.
- [x] **The server says where it writes, once.** Startup logs `Uploads en <absolute path>` and a
      miss logs the full path it tried (at most once a minute — the route is public). Before this,
      the difference between «wrong directory», «read-only volume» and «bad code» was invisible
      without a shell.
- [x] **Notifications say what happened, not where it propagates.** «Foto actualizada — ya aparece en
      el menú, la compra y la agenda» is a brochure; and it is a lie the moment the write fails. The
      account page now says `Imagen cambiada`, `Imagen quitada` (there was no toast on removal) and
      `Nombre guardado`, and when the server could not write to disk it says exactly that, with the
      place to look.
- [x] Tests: `assertWritten` (missing file, truncated file), a read-only uploads directory making
      `storeImage` throw, and `POST /api/auth/avatar` answering 500 while the profile keeps its old
      photo, with the same read-only directory forced through `DATABASE_PATH`.

### How it turned out

Verified against the real server, both ways: `POST` → `GET` returns 200 with the bytes, and with
`chmod 0500 data/uploads/avatars` the same `POST` returns `500 UPLOAD_WRITE_FAILED` naming the path
and the profile still holds the previous photo. The reproduction of the reported symptom as a *silent*
404 could not be completed here — in this sandbox the flow answers 200 end to end, and the report's
own log shows the process writing to one filesystem while reading another (`server/data/` had been
replaced underneath the running server, which is also why the avatar from the previous session was
already 404 before the new upload). What is fixed is the class, not just the case: an upload that
cannot be read back can no longer be called a success, and the log now names the directory so the
remaining environment question is answerable in one line.

## 12n. Round 13c — the photo is a control, and a dead session says so

### The face in the account page had become a form field

- [x] The avatar is a **button**: hover or focus shows «Cambiar / Poner foto» over the disc, and the
      whole disc is the target. On touch (no hover) the label is there from the start —a hint that
      only appears for a pointer that does not exist is not a hint.
- [x] Tapping it opens a modal with the two decisions that belong together: **sustituir** and
      **quitar** (plus the Cancelar/Escape/backdrop that every editable control in the app has). Two
      stacked modals would have been two escapes to press; it is one modal with two steps.
- [x] Choosing a file no longer uploads it: it opens the **editor** —drag to frame, wheel, slider or
      `+`/`-` to zoom (1x–4x), arrows to nudge, `0` to recenter, and «Usar imagen». Before this the
      crop was always the dead centre of the photo, which is how a face becomes a forehead.
- [x] `avatar-crop.ts` is the single source of that geometry (pure, 7 tests, run in node): the preview
      and the uploaded bytes come from the same `cropRegion`, so what is framed is what is saved. The
      preview is `previewLayout` in px on the same image, not a `transform` with a second formula.
- [x] The editor always hands over a JPEG square of `AVATAR_EDGE` px, whatever came in.
- [x] A second photo cannot inherit the first one's broken state: `app-avatar` used to keep
      `broken = true` when `src` changed, painting the fallback initials over the photo that had just
      loaded —the exact signal that the upload worked.

### The ghost session is the bug the user actually hit

- [x] Evidence: the account in the browser (`IA4IeB_2YdLBjcQSyaHpX`) does not exist in the database
      the API has open, and its avatar file is nowhere on disk; `server/data/` (DB *and*
      `uploads/`) had been replaced under the running process by the sandbox reset. The screen kept
      showing the cached name and the cached photo URL, and every write answered 401.
- [x] That state was **silent**: the error interceptor excluded 401 from its toast, so an app on a
      dead session looks alive. A 401 now says «La sesion que guarda este navegador ya no vale.
      Cierra sesion y vuelve a entrar.», throttled once per 30 s (a screen full of parallel requests
      produces one message), and suppressed when the 401 belongs to the login form itself, which
      already answers next to the field.

### Tests

- [x] `avatar-crop.spec.ts`: centred crop, clamped zoom (including a `NaN` slider), the pan clamped
      to the slack the frame leaves, drag in the direction a finger expects, preview layout matching
      the region, and zoom anchored to the pointer (the assertion that catches «scale the offset»
      instead of «scale the gap»).
- [x] `account.spec.ts`: opacity of the label before/after hover, the modal's two steps, zooming
      changing the preview, Cancelar returning without uploading, the stored file being a
      **128x128 JPEG** served through the public route, the ring, the same face in the sidebar and
      the mobile header, and the removal through the modal.

### Same round, two corrections — one of them mine

- [x] **The 404 was a Windows path, and nothing else.** The server the user is running prints
      `Uploads en D:\projects\MiCocinAI\server\data\uploads`; `resolveUploadUrl` decided containment
      with `full.startsWith(dir + '/')`, and `resolve` on Windows writes backslashes, so the check
      never passed: the photo was written, its URL stored, the `POST` answered `200` —and every read
      404'd. `isInside(dir, candidate, separator = sep)` says what was meant, the separator is a
      parameter so the Windows case is a test (`uploads.spec.ts`) and not a hope, and the files
      already on that disk light up again without re-uploading. The sandbox-reset theory written
      above is wrong: it explained the same log lines but not `D:\`, and it was reached by
      inspecting the wrong filesystem. Left in place, because «el diagnóstico que quedaba bien pero
      era falso» is the lesson worth keeping here.
- [x] **Hover = the edit icon, alone, centred.** No label: over a 64 px disc a word is either
      truncated or a smudge. The icon is `1em` (`size = 0` on `app-icon`) governed by the overlay's
      `font-size`, and the inset is `padding: 18%` of the disc —so if someone changes the size of the
      face elsewhere, the icon cannot end up touching the ring. On touch (no hover) the scrim stays at
      a lighter alpha, because a square with a photo inside does not announce itself as a button.

### How it turned out

- The account chunk went from 22.7 kB to 36.7 kB raw (9.7 kB gzipped) with the editor inside it. It
  is lazy, it only loads on the one screen that needs it, and it replaces a canvas call plus a
  hand-centred crop that was already there —the cost is honest.
- The editor never talks to the network: it emits the finished data URL and the screen owns the
  POST, the toasts and the failure copy. That is what keeps the two cancelable paths (Cancelar in
  the editor, closing the modal) in one place.
- Not verified by eye: no Chromium in this sandbox, so the drag, the wheel and the 128x128 result
  are asserted by unit tests on the geometry and by an `e2e` case that has not been executed. The
  preview is the reviewer.
## 12o. Round 14 checklist — optional means optional, and the day has an hour axis

Reported by the user in one breath, and each part is a separate promise below: the calendar answers
`400` when a form is filled only with what it asks for; the day is not divided into
desayuno/almuerzo/cena/merienda — and that list was in the wrong order anyway, dinner comes after the
snack; the grid should read like Google's hours, showing only the window that has something in it, not
24 rows; and an event can have another member of the house in it.

### A. «Optional» has four shapes, and `.optional()` covers one of them

- [x] A form sends an empty field as absent, as `null`, as `''`, or as `"   "`. `z.string().optional()`
      accepts exactly the first. The calendar's `notes`/`location`/`color` are `.optional()` and the
      form sends `null` on purpose, so every event saved with the notes field empty was a `400`
      reading «Expected string, received null» —an error about the shape of the request, shown to
      someone who had done nothing wrong.
- [x] New `server/src/schemas/form.ts`: `formText(max)`, `formTime()`, `formDate()`, `formColor()`,
      `formNumber(...)` accept all four shapes, and normalise blank to `null`. `null` is *cleared*,
      absence is *untouched* —that difference is what makes PATCH able to remove a value, and it is
      documented in the helper, because the next person will reach for `.optional()` again.
- [x] Every request schema a route parses is converted to those helpers where the UI can leave the
      field empty. Required stays required: `title` on an event, `date`, `name` on a product.
- [x] `calendar.routes.ts` and friends answer a failed parse with the field and the reason in Spanish
      (`notes: max 500`), not with the first zod sentence in English, and the dialog shows it inline.
- [x] The frontend stops using `undefined` to mean «borrar»: editing a meal and emptying its time now
      sends `null`, so the old hour actually disappears. Before this, the only way to lose a time was
      to delete the meal.

### B. Every form is tested with the optional fields missing — and that stays true

- [x] `server/src/schemas/form-contract.spec.ts` holds a table: one row per request schema, with a full
      sample, the list of required keys and the list of optional ones. For each row it asserts — parses
      with only the required; parses with each optional key absent, `null`, `''`, `"   "`; and still
      rejects a missing required key (otherwise the fix would just be «accept anything»).
- [x] The same file reads `server/src/routes/*.routes.ts` and fails if any `…Schema.parse` /
      `…Schema.safeParse` has no row in the table. That is the part that keeps it true in three months:
      a new form cannot skip the contract, and the failure message says exactly what to add.
- [x] Route level, where a schema can pass and the SQL still break on `undefined`: `POST
      /api/calendar/events` with `{title, date}` only → `201` and the optional columns are NULL in the
      row that comes back; the same for `PATCH` clearing `notes` with `null`; plus a minimal-payload
      case in the existing `pantry`, `shopping` and `auth` route specs.
- [x] `tests/e2e/calendar.spec.ts` creates an event typing only the title, and asserts the dialog
      closes and the block appears —the user's exact repro, at the level the user touches.

### C. The order of the day

- [x] `MEAL_ORDER` and both SQL `CASE` blocks: breakfast, lunch, **snack, dinner**. The list was
      breakfast, lunch, dinner, snack since the first version, so the plan read «cena» before
      «merienda» everywhere it was sorted by type (grid, month, AI persist loop, enum).
- [x] `MEAL_TYPES` in `server/src/utils/weekly-plan.ts` follows the same order, so what the model is
      asked for and what gets written back agree with what is displayed.

### D. Hours, not meal slots — and only the hours that have something

- [x] New pure module `frontend/src/app/core/calendar-grid.ts`, tested before the component (TDD within
      the bridge's limits): minute↔hour helpers, the conventional hour of an untimed meal (`desayuno
      08:30 · almuerzo 14:00 · merienda 17:30 · cena 21:00` —a position, never a printed claim), the
      visible window from the items of the range with padding, and the overlap layout (side-by-side
      columns, same rule Google uses: groups of items that collide share the width).
- [x] `app-calendar-timeline` renders the day/week grid: hour gutter, a column per day, blocks placed
      by minutes, a band on top for `allDay`, and no 24 empty rows — the top and bottom of the view are
      the first and last thing there is (default 08:00–22:00 when the range is empty).
- [x] The window is scrolled on load to the first thing of the day, or to `now` if today has nothing —
      the behaviour the user named («como las horas de google»).
- [x] Clicking an empty strip creates at that time: a meal takes `time` and the type nearest to that
      hour, an event takes `startTime`. The hour you clicked is not lost, which is the only reason a
      time axis is worth having over a list.
- [x] `calendar-week.component.ts` and `calendar-day.component.ts` go away rather than sit next to the
      grid as a second way to paint the same day; the month view keeps its rows (a month has no hours).
- [x] Meal type stops being a partition of the view and stays what it always was in the data: a label
      and a colour. The `data-meal` accent and the labels survive; the four fixed bands do not.

### E. Another member in the event

- [x] `calendar_event_attendees (event_id, user_id, added_by)`, created by the migration runner, with
      an index on `user_id`. The author is not an attendee of their own event —they are the author, and
      mixing the two would make «leave» able to delete the event.
- [x] `attendeeIds` on `POST`/`PATCH /api/calendar/events`: unknown ids and ids outside the house are
      rejected with the list of who could not be invited, not silently dropped.
- [x] Visibility follows the invitation: `GET /api/calendar/events` returns events where I am in
      `calendar_event_attendees` as well as mine and the house's, with `editable` still only for the
      author. An event you are invited to that you cannot see is an invitation that did not work.
- [x] An attendee can leave (`DELETE /api/calendar/events/:id/attendees/me`) and the author can remove
      anyone; nobody can remove the author, and the event is not deleted by the last person leaving.
- [x] In the dialog: a member picker with faces (`app-avatar`, the same palette rule as everywhere
      else), the author's face on the block, and the invited faces beside it; `title`/tooltip says who.
- [x] The picker has no «save» trap: adding or removing a member there is applied with the event, and
      `Cancelar` never sends anything.

### F. Gates and honesty

- [x] Server vitest green, the frontend-vitest bridge green with `calendar-grid.spec.ts` added to it,
      `tsc` for app and spec, `typecheck:e2e`, `node scripts/check-ui.mjs`, production build.
- [x] No claim about how the grid looks is made from a build: the sandbox has no Chromium. What is
      asserted here is geometry (numbers), placement data, and the dialogs' behaviour.


### What actually landed (measured, not promised)

- **Server**: the vitest run in `server/` → 21 files, **542 tests** green, with `tsc --noEmit` clean.
  The form contract file alone is **254** of them. `calendar.routes.spec.ts` is 18 tests: seven on the
  data the routes read, and the rest the behaviour the user reported —minimal payload accepted, `null`
  versus absent, a legible 400 naming the field in Spanish, clearing a note, changing and clearing a
  meal's hour, the order of the day, invites, outsiders, and leaving.
- **Route-level minimal payloads** now also exist for the pantry (ingredient with only what its screen
  requires, then `expirationDate: null` really clearing it), the shopping list item (only `name`, then
  `note`/`priceMinor` cleared with `null`) and `PATCH /api/auth/taste` with `{}` —which is what
  «saltar por ahora» sends, and was a 500 before this round.
- **Frontend geometry** is a pure module with **79** bridge tests (9 files) covering hour↔minute
  conversion, the trimmed window (hour boundaries, six-hour minimum, full day when the range is empty),
  the minimum block height, the overlap packing, the all-day band, the anchor order in Spanish hours,
  the 30-minute click snap and the auto-scroll. `calendar-week.component.ts` and
  `calendar-day.component.ts` are deleted, not deprecated: day and week are one component now.
- **`scripts/check-ui.mjs` grew a rule and a fix.** Rule 4 (orphan selectors) previously matched
  `data-test` names *by common prefix in either direction*, so when the week grid was deleted its
  `meal-chip` handle still «existed» —and the e2e specs asking for it would have gone quietly vacuous,
  because Playwright does not fail on a locator that matches nothing. It is now exact-match, with the
  only exception being the dynamic attributes the frontend builds by concatenation (`'layer-' + kind`).
  A second half of the rule does the same for the **CSS classes** the specs ask for, and it caught four
  orphan classes in three spec files (`.meal-slot`, `.cal-band`, `.cal-week`, `.cal-day`) on the first
  run; the specs were rewritten against the new handles rather than the old names being faked back into
  existence. The rule count in its own summary line is a constant now, because the printed «7 reglas»
  was lying the day the rule became eight.
- **UI handles of the new grid**, for the specs and for anyone reading the template: `timeline-col` (one
  per visible day), `timeline-band` (the all-day strip, which is also the «no he puesto hora» affordance),
  `timeline-add-meal` (the `+` in each day header), `timeline-block-meal` / `timeline-block-event` (built
  as `'timeline-block-' + kind`, so the prefix rule is what matches them), and `event-attendees` in the
  dialog. The removed handles (`meal-slot`, `meal-chip`, `cal-band`, `day-meal-*`, `week-meal-*`) are
  gone from the specs too —there is no `voluntario` line for a selector nobody uses.
- **A gate that turned out not to exist**: `npm run lint` does not lint anything in this repo, and it
  failed before this round. `frontend` runs `ng lint`, whose builder (`@angular-eslint/builder`) is not a
  dependency of any package or of the lockfile; `server` runs `eslint src --ext .ts`, and the pinned
  eslint 9.17 rejected `--ext` long ago and then found no `eslint.config.js`, because the repo has none.
  This round therefore does not claim a lint pass: what was run is `tsc` (app, spec and the e2e project),
  the two vitest suites, `check-ui` and the production build. Fixing the lint setup is its own round —
  flat config plus a decision about template linting— and pretending to have run it would be worse than
  leaving it broken and said.
- **Not claimed**: the sandbox has no Chromium, so nothing here asserts how the grid *looks*. The window
  trimming, the block placement and the scroll position are asserted as numbers, and the click and dialog
  behaviour as events. `calendar.component.ts` keeps a pre-existing component-CSS budget warning
  (13.32 kB against a 10 kB budget); its own styles are 12.6 kB of agenda and dialog CSS that predates
  this round, and the ~0.7 kB of the member picker did not create the overrun —the same warning already
  covers `shopping-list-detail.component.ts` at 17.86 kB. A check-ui sweep for orphan selectors in that
  style block returned none, so nothing was left behind by the deleted views.

### Coming soon, deliberately not here

- RSVP / «no me va» on an event, and availability (busy hours from another calendar).
- Dragging a block to move or resize it — the grid geometry is written so that the drop target is the
  same pure function that paints it, but the drag is not this round.
- A `time` per generated meal: the model does not return one, so untimed placement stays.
  (Taken in the next section: the house's hour is written on generated meals —the model still does not
  choose it.)

## 12p. Round 15 checklist — everything that deletes asks first, the house says what time it eats

Four things in one breath from the user, and the last one is a correction of what this program said it
had done last round, so it leads.

### A. «Sigo sin poder invitar a otros miembros a un evento, tanto en la creación como en la edición»

The server worked —proven with two accounts against the live API: `PATCH /events/:id {attendeeIds}` →
200 with the face back, `POST /events {attendeeIds}` → 201, and the invited account could see the event.
So the report was about the app, and it turned out to be three separate breaks, each of which on its own
is enough to make the control unusable:

- [x] `GET /api/calendar/events` (the list the calendar actually renders) attached `attendees` but not
      `attendeeIds`. Opening the dialog to edit an event therefore started with **nobody selected**, and
      saving would have written that back. Fix: the list returns the same pair the POST and the PATCH
      return, derived from the same bulk query —no second read per row.
- [x] `/calendar` never loaded the household: `loadHousehold()` was called on login, register, dashboard
      and the household page, so opening the calendar URL directly (or reloading it) left
      `householdService.household()` at `null`, `hasHousehold()` answered false, and the block that
      contains the picker did not render at all. Fix: `HouseholdService.ensureHousehold()` — load once,
      never twice in parallel, keep the failure recoverable — and the calendar calls it on init.
- [x] A control that is hidden because a request is in flight is a bug the user cannot distinguish from
      «this house has one member». When there is nobody else to invite, the dialog says so and offers
      the way to add someone; it does not disappear.
- [x] `saveEvent` sends `attendeeIds` only when the picker was actually shown for that draft. Absent
      means «don't touch» on the server, so the client must not send a list it never rendered —and must
      send the empty one it did.
- [x] The dialog's candidate list is a pure function (`core/event-invitations.ts`): the household minus
      the author, stable order by name, no self-invitation. Tested in the bridge, because it is the only
      part of the invite flow with real logic in the client.
- [x] An e2e case that drives the whole gesture (open dialog → tick a member → save → the face appears
      on the block), written and typechecked; it is not executed here (no Chromium), and the spec says so
      instead of claiming a green.

### B. Deleting anything asks first

Listas, líneas, eventos, utensilios, configs: a delete is the only action whose mistake cannot be undone
by pressing again, so no destructive control may act on the first click. `ConfirmService` is the app's
own dialog (round 12) and every path below goes through it.

- [x] A rule in `scripts/check-ui.mjs` finds the gaps instead of a list of promises: any method in a
      component whose body calls a destructive service method (`delete…`, `remove…`) must call
      `confirmService.confirm(` **inside that method**, or declare why in `DEBT`. The rule reports the
      method name and the line, so the fix is obvious and a new screen cannot forget.
- [x] The gaps it found get fixed in the same commit as the rule: the shopping line (`removeItem`), the
      price/discount removals, the recipe delete, the household member removal and the calendar event
      delete. Each confirmation names the thing being deleted —«¿Borrar «Pan de pueblo» de la lista?»—,
      never «¿Estás seguro?».
- [x] Deliberate exceptions, each with its reason written in the rule file: «quitar la foto» of the
      account (it is a decision inside the avatar modal, already a two-choice step, and re-uploading
      undoes it), the PWA's local-cache discard, and anything the server itself treats as a *setting*
      rather than a deletion (a `null` that clears a field is not a delete of a row).
- [x] Cancelling does nothing at all: no toast, no optimistic removal from a local list, no refetch. And
      the confirm dialog already has its own cancel —the rule «todo control editable necesita forma de
      cancelar» applies double to a destruction.

### C. What time this house eats (preferences → tour → calendar → IA)

- [x] `mealTimes` in the taste profile (`users.preferences`), one key per meal type, each an `HH:MM`
      string through `formTime`: `breakfast 09:00`, `lunch 14:00`, `snack 17:00`, `dinner 20:30` are the
      defaults the app ships with, and `readMealTimes` answers them when nothing was saved —so there is
      no «no configured» state to branch on in the UI.
- [x] A new section in **Preferencias** («Horarios de las comidas»): four time inputs, the unsaved-changes
      state, Guardar and Descartar, no more magic than the rest of the page. The values are editable
      whenever the user wants; nothing locks after the tour.
- [x] The **tour** asks the same question as its own step, prefilled with the defaults, and saving the
      step is the same PATCH the preferences page uses. Skipping the tour must not lose the schedule:
      the defaults stay.
- [x] The hour grid uses them: an untimed meal is *placed* at the house's hour for its type, and the
      anchors that `core/calendar-grid.ts` tests (08:30/14:00/17:30/21:00) become the shipped defaults
      only as `MEAL_TIME_DEFAULTS`, imported by nothing else. Placement, the click-to-add prefill and
      the `+` in the day header read the configured values.
- [x] The AI gets them: the weekly-plan prompt names the hours, and `persistWeeklyPlan` writes
      `time = mealTimes[type]` for the meals it inserts, because a schedule the user typed is a fact of
      the house, not an invented per-meal claim (that distinction is what round 14's
      «no printed fake hour» was protecting).
- [x] Blank means back to the default: clearing a field and saving does not store `''`, it stores nothing,
      and the next read answers the default. No form here accepts a half-typed hour as a value.

### D. «Pedirle a la IA qué comidas quiero en el calendario»

- [x] The generate dialog has a selector of the four meal types (chips, default: all four), and it is a
      real filter, not decoration: `POST /api/ai/plan-week` accepts `mealTypes`, the prompt's JSON example
      is built from the chosen types in the order of the day, and `persistWeeklyPlan` inserts only those
      keys —so a house that does not eat breakfast stops getting breakfasts it has to delete by hand.
- [x] The response keeps telling how many slots were filled and how many were skipped because the user
      already had something there; the toast counts what actually happened (round 13b's rule).
- [x] A selected set of zero means «dame las cuatro», not «no generes nada» and not a 400: it is the same
      request as the unmodified default, and the dialog shows which is which.

### E. The tour lets you out of any step

- [x] Every step has its own «Saltar este paso» (the global «Saltar por ahora» stays for the whole tour),
      and skipping a step keeps whatever the previous steps saved —skipping «horarios» must not write
      empty hours.
- [x] The tour is a linear array of ids, so «which step is this» and «can I go back» come from the array
      and not from `ngSwitch` branches; the number in the header («Paso 3 de 6») is derived from the same
      array.
- [x] Keyboard: `Escape` skips the current step (never the whole tour), and `Enter` in a text input is the
      «siguiente» action, not a form submit that saves the world.

### Gates

- [x] Server vitest green, contract green with the new `mealTimes`/`mealTypes` keys (the contract file
      tests a new optional key the day it is added, so this box ticks itself), bridge green with the new
      pure modules, `tsc` (server, app, spec), `typecheck:e2e`, `check-ui` with the delete rule and the
      selector rule, production build.
- [x] No claim about pixels or about the tour's look: no Chromium here. What is asserted is the step
      machine, the payload the dialog sends, and the numbers the plan writes.

### What changed while doing it

- **The grid kept an anchor of its own.** The bullet above says the shipped hours become
  `MEAL_TIME_DEFAULTS` «imported by nothing else»; that turned out to be wrong in a useful way.
  `MEAL_ANCHOR_MINUTES` (08:30 / 14:00 / 17:30 / 21:00) stays in `core/calendar-grid.ts` as what the
  grid paints *before* the profile answers, and `mealAnchors()` falls back to it per key. Without it,
  every untimed meal is placed at midnight for the ~200 ms the taste profile takes, which is a worse
  calendar than a slightly recoloked one. The two sets mean different things and say so in their
  comments: one is «what the app ships as a normal day», the other is «where an untimed block sits».
- **Blank and absent are different inside `mealTimes`.** `mealTimes: { dinner: '' }` deletes the dinner
  key (next read answers the default); `mealTimes: { dinner: '22:00' }` leaves the other three alone;
  no `mealTimes` at all touches nothing. That is the same absent/null contract the rest of the API
  uses, one level deeper, and it is why the Preferences tab and the tour send a patch of *changed*
  keys (`mealTimesPatch`) instead of the four visible ones —otherwise «look at the default» silently
  becomes «have the default saved», and a future change of the shipped hour would stop reaching houses
  that never chose anything.
- **The mirror between the two sides is a text comparison.** `frontend/src/app/core/meal-times.ts`
  cannot import `server/src/utils/taste-profile.ts` (the server file drags better-sqlite3, and
  `rootDir` makes the reverse import break the server build), so `server/src/utils/meal-times-mirror.spec.ts`
  reads both sources and compares the literals —defaults, the order of the day, and the Spanish names.
  It throws if a constant moves instead of passing quietly without comparing anything.
- **A selected set of only-unheard-of names also means «the whole day».** The checklist covers zero
  selected; the first implementation returned zero valid types for `['cena', 'postre']`, which reads as
  «plan nothing and insert nothing» —the quietest possible way to fail. `resolveMealTypes` (server) and
  `selectedMealTypes` (frontend) now fall back to all four when nothing survives, and both are tested.
- **The delete rule is a rule, not a list of screens.** `sin-confirmar-borrado` in `scripts/check-ui.mjs`
  walks every component, follows one level of delegation (a `removeMeal` that calls `removeMealById`,
  which does confirm), and keeps an `EXEMPT`-style `LEGACY` map with a mandatory reason per file. It
  found four real gaps and four false positives (`removeAllRanges`, `classList.remove`,
  `clearGenerated`, `clearTimeout`); the exceptions are in the rule, not in the components.
- **e2e written, not executed.** The tour cases (per-step skip, Esc/Enter, the hours step feeding
  Preferencias) and the invitation cases (one-member house says so; two members, mark, save, reopen with
  the mark still there, and the invited session sees the event) are in `tests/e2e/onboarding.spec.ts` and
  `tests/e2e/calendar.spec.ts`, and `npm run typecheck:e2e` passes. Nothing here ran them: the sandbox
  has no Chromium, and CI does.

### Gates as run

- Server vitest: **22 files, 559 tests** green (the contract file covers `mealTimes` on the PATCH without
  a new row, and `mealTimes` in `updateTasteSchema` inherits the whole «optional means optional» table).
- Bridge (pure frontend specs under the server's vitest): **12 files, 121 tests** green, including the two
  new modules `meal-times` and `onboarding-steps`.
- `tsc` clean for server, `tsconfig.app.json` and `tsconfig.spec.json`; `typecheck:e2e` clean;
  `check-ui`: **151 files, 9 reglas, sin incidencias**; `ng build --configuration production` OK with the
  two pre-existing component-CSS budget warnings and no new one.
- Against the live API (`tsx watch` on the dev database): a fresh account reads the four defaults,
  `PATCH {mealTimes:{dinner:'22:00'}}` merges without touching `taste`, `dinner:''` + `lunch:'13:30'` in
  one call clears one and sets the other, `lunch:'a comer'` is a 400 that names the field
  (`mealTimes.lunch: Almuerzo: usa HH:MM`), `mealTimes:''` is a 200 that changes nothing, and
  `POST /ai/plan-week {mealTypes:[…]}` parses (it fails later on the missing AI key, as expected).
- `npm run lint` is still not a gate, for the reason written in §12o.

### Coming soon, deliberately not here

- Per-house (not per-user) meal times. The schedule of a house is shared in real life; the preferences
  document this round touches is the account's, and making it the household's is a migration with its own
  arguments about who may change it.
- Letting the model return a time per dish («sobremesa a las 16:30») and honouring it —this round writes
  the house's hour, not the model's guess.
- Remembering the AI selector between generations (it resets to the four each time, which is the least
  surprising default while it is not configurable).

## 12q. Round 16 checklist — the copy says «por defecto», and everything you can press looks pressable

Two sentences of feedback from the user, and they are the same complaint seen from both ends: the app
described a behaviour with the word for an empty canvas («en blanco») instead of the word for what
happens («por defecto»), and controls that do nothing when you hover them do not look like controls. The
first is copy; the second is the reason the copy had to exist at all — a field whose empty state *means*
something needs either a button or a sentence, and here it had a sentence that used the wrong word.

### A. «En blanco» is a pixel, not a meaning

- [x] `En blanco: 09:00` becomes `Por defecto: 09:00` in both places that show it (the tour's hours step
      and the Preferences tab). The sentence under the fields gets rewritten for the same reason: leaving
      a box empty here does not mean «this house has no lunch time», it means «use the one the app
      ships», and the copy has to say the consequence, not the colour of the input.
      Hecho: Sobrecumplido: la frase ya no existe en ninguna de las dos pantallas. El control hace lo que la
      frase explicaba (un boton «Por defecto» por fila tocada), y la cadena que quedaba se la llevo
      `app-meal-hours`.
- [x] Where empty really does mean *nothing* — the hour of a single meal in the meal dialog, which round
      14 made clearable — the control and its copy say «quitar la hora». «En blanco» is not used for
      either case anywhere in the UI.
      Hecho: El dialog de la comida habla de «sin hora» y esa es la otra acepcion: no hay valor. Cero cadenas
      «en blanco» visibles en `frontend/src` (lo vigila la regla 10).
- [x] `texto-sin-en-blanco`, rule 10 in `scripts/check-ui.mjs`: no user-visible string in the frontend
      says «en blanco». Comments keep the phrase (a developer may talk about the canvas; a user is being
      told about a value), so the rule reads code lines and skips comment lines. It is written before the
      fix, and it fails on exactly the three strings this round is about.
      Hecho: Escrita, con la maquina de estados que se salta comentarios, y con los `.spec.ts` exentos: un
      test puede escribir la palabra para prohibirla.
- [x] `DESIGN-SYSTEM.md` gets the two words and when they are allowed, so the next empty-state copy is
      not a coin flip: *vacío / sin valor* for «no value», *por defecto* for «the value the app ships».
      Hecho: Dos subapartados: «Estados de interaccion» (tabla hover/focus/disabled) y «Vaciar un campo no es
      dejarlo en blanco».

### B. Everything you can press looks pressable

- [x] Global baseline in `styles.scss`: `button { border: none; background: none }` is a *reset*, and it
      was also the whole story for any button that did not opt into a component skin — the origin of «esto
      no parece un botón». From now on: a bare `<button>` (no class of its own) gets the design-system
      skin (border, background, padding, radius, hover, focus ring); every `label:has(input)` is
      `cursor: pointer` (the app's checkbox-as-card pattern was a clickable rectangle with an arrow);
      `:disabled` answers `not-allowed`, which explains itself, and every interactive element shares one
      `:focus-visible` ring instead of eight half-remembered ones.
      Hecho: Piel para `button:not([class])`, `label:has(input){cursor:pointer}` y
      `button:disabled{not-allowed}`. La opacidad del deshabilitado sigue siendo de cada componente: dos
      opacidades multiplicadas desaparecen.
- [x] `boton-sin-afecto`, rule 11: any `<button>`/`<a>` in a component template that carries its own class
      must have a hover or focus state in that component's styles — BEM modifiers count through their
      base (`.cal-btn--ghost` is covered by `.cal-btn:hover`), and any element that is clickable without
      being a button or a link (`label`, `div`, `tr`, `td` with `(click)`) must set `cursor: pointer`.
      Exemptions live in `LEGACY['boton-sin-afecto']` with a reason, same as the delete rule, and the
      list can only shrink.
      Hecho: Escrita: solo `<button>` (los `a` heredan del global), familia BEM resuelta por la base, bloques
      de `styles:` contados por llaves, un aviso por fichero+clase, mas el `cursor:pointer` de los
      `label|div|span|li|tr|td` con `(click)`. Y un guard que exige que el baseline global siga ahi: si
      alguien lo borra, la regla no se calla, protesta.
- [x] The 41 classes the rule found on its first run are fixed in this round, not forgiven: 20 in the
      shopping-line sheet, 9 in the shopping lists, and the rest in the calendar grid, the layout
      (sidebar, header), toast, password toggle, invite page, account/preferences inline links, recipe
      favourite, pantry appliance delete, settings reset and the log reconnect. They are grouped by
      screen into shared selector lists (`.detail__ghost:hover, .detail__more:hover { … }`) so the fix
      costs a few hundred bytes per file and not one block per class.
      Hecho: 36 arregladas en esta ronda (las otras 5 eran `<a>` o ya tenian su hover). Sin excepciones en
      `LEGACY`: perdonarlas era volver a tenerlas en seis meses.
- [x] The controls this program actually shipped last round get real treatment, not just a rule: the
      invited faces (`.cal-person`) have a border, a hover background and a pressed state that is not
      only a colour swap; «Saltar este paso» and «Saltar por ahora» in the tour stop being underlined
      text floating next to real buttons; and the links inside dialogs (`cal-link`,
      `preferences__inline-link`, `account__inline-link`, `invite-card__link`) keep looking like links —
      underline plus colour, no fake border — but react when hovered.
      Hecho: El campo de hora tiene la receta de `app-input` (borde, fondo, anillo) y los `onboarding__skip`
      han dejado de ser texto subrayado: pastilla con borde y hover.
- [x] `app-icon-button`/`app-button` are not touched: they already own their hover and focus, which is
      why the rule only inspects raw `class=` on `button`/`a` elements.
      Hecho: Intactos.

### C. The hours row, once, as a component

- [x] `app-meal-hours` (`shared/components/ui/meal-hours/`): the four rows the tour and Preferences were
      about to copy-paste, with `[(times)]`, an `idPrefix` so `#ob-meal-dinner` and `#meal-dinner` stay
      the ids the e2e specs already use, one `Por defecto` button per row, and the hint text next to the
      label instead of under it. Two rows of hand-copied CSS is how one of them ends up without a hover
      state, so there is one.
      Hecho: Creado, con `[(times)]`-es-mutar-en-sitio, `idPrefix` (los `#meal-dinner`/`#ob-meal-dinner` que
      buscan los e2e) y `dataTest`. Ocho tests en el puente; `MEAL_TIME_DEFAULTS` y `MealTimes` se han ido al
      modelo compartido porque un componente del design system no importa de `core/`.
- [x] The reset is an action, not a sentence: «Por defecto» writes the shipped hour into the form (which
      is the same thing as emptying it, but visible and reversible before saving), and it does not mark
      the row as changed when the value already *is* the default — the dirty state and `mealTimesPatch`
      stay the single source of what gets sent.
      Hecho: El boton existe solo en la fila tocada; en la que vale lo de siempre no hay nada que deshacer.
- [x] The hour input has a minimum width and height of its own. A bare `type="time"` shrinks to the width
      of «20:3» on narrow columns, and its native spinner is 12 px on desktop: it is a field, it gets
      `--control-height`.
      Hecho: `min-width: 8.5rem` y `min-height: 40px` en el input, con su motivo escrito al lado.

### D. The `var(--token)` that does not exist (found while writing rule 11)

The hover audit turned out not to be the whole of «no parece un botón»: the hours inputs added last round
were styled with `var(--surface)`, `var(--border)`, `var(--text)`, and **no such token exists** in
`styles.scss` — it is `--bg-secondary`, `--border-default`, `--text-primary` here. CSS does not error on
an unknown custom property: the declaration is dropped, and the field arrives with no border, no
background and inherited colour. Which is exactly the screen the user is complaining about.

- [x] Rule 12, `token-inexistente`: every `var(--x)` used anywhere in `frontend/src` must be defined in
      some file of the frontend, or be a property that the same code sets at runtime —
      `[style.--hour-px]` counts, because that is how the grid passes geometry down. The three runtime
      ones (`--event-color`, `--hour-px`, `--swipe-x`) are the proof the rule can tell the difference.
      Hecho: Escrita, con exencion para los que se definen en tiempo de ejecucion (`[style.--x]`,
      `style="--x:"`, `setProperty`) y con sugerencia por familia del nombre. Ha pillado cuatro tokens mios y
      cinco que venian de antes.
- [x] The nine that were missing get fixed to their real token: the four of the hours inputs (this
      program's own bug, two files) and five pre-existing (`--color-warning` in the log viewer,
      `--duration-fast` in settings and the home-profile picker, `--primary-alpha` in the same picker,
      `--primary-soft` in `app-picker`, `--color-warning-400` in `app-rating`). Each is a style that was
      silently not being applied, not a cosmetic preference.
      Hecho: Nueve arreglados: cuatro del campo de hora (borrados con el bloque duplicado), `--color-warning`
      en logs (que tenia un fallback tapandolo), dos `--duration-fast`, `--primary-alpha`, `--primary-soft`,
      `--color-warning-400`.
- [x] The tokens the app *should* have and does not: `--surface` and friends were invented because the
      names in use (`--bg-secondary`, `--text-primary`) do not say which is on top of which. Renaming is
      not this round (160 definitions, every screen); the rule is what stops the pile growing.
      Hecho: Sin renombrar nada, como decia el punto: 160 definiciones y todas las pantallas. La regla 12 es
      lo que evita que la pila crezca.

### E. Lo que la ronda no podia ver: el `*ngFor` sobre un getter congelaba la pantalla

Cerrada la tanda y probada en una maquina de verdad (Windows, el usuario), **la pantalla de Horarios se
colgaba**. Era de la ronda 19 y ningun gate la vio, asi que va aqui con su mecanismo:

- `app-meal-hours` itera `*ngFor="let row of rows"`, y `rows` era un getter que construa la array.
- `*ngFor` compara **identidad**: con una array nueva en cada ciclo, las cuatro filas se destruian y se
  volvian a montar; cada `input` nuevo con su `ngModel` escribia el valor en el modelo, el arbol se
  marcaba de nuevo, y el ciclo volvia. Zona.js no se queda nunca vacia: la pantalla deja de responder.
- Sin Chromium en el sandbox, ni el build, ni `tsc`, ni el puente de vitest, ni los 28 e2e de CI lo decian:
  el sintoma vive en el navegador. La preview de Arena tampoco lo reprodujo porque alli la pantalla se abria
  y se cerraba sin escribir en el campo, que es lo que dispara el bucle largo.

Arreglado con identidad estable (`rows` cacheada por `idPrefix` + `hints`) y `trackBy`, y con un test de
identidad en `meal-hours.component.spec.ts` —`toBe`, no `toEqual`, que es lo que comprueba el bucle. El mismo
hueco estaba en `app-chip-select` (`choices`); ahi no habia `ngModel` dentro del bucle, asi que no congelaba
pero si hacia parpadear chips y perder hover y foco: se memoiza por identidad del catalogo y contenido de la
seleccion, y se anade `trackBy` tambien.

Y la regla que lo impide, **13 en `check-ui`** (`ngfor-getter-sin-trackby`): un `*ngFor` que itera un getter
del propio componente lleva `trackBy`. Es mecanica y comprueba lo que se puede comprobar leyendo el fichero —
la clave de reutilizacion— en lugar de prohibir getters, que es una preferencia.

### Gates

- [x] `check-ui` with 12 rules (13 desde 12q-E) and no findings, `tsc` (server, app, spec), `typecheck:e2e`, server
      vitest, the bridge suite (including any pure module this round extracts), production build with no
      new budget warning beyond the two pre-existing ones.
      Hecho: Medido: «153 ficheros, 12 reglas, sin incidencias». `tsc` de app y spec limpios; 559/559 del
      server y 153/153 del puente (16 ficheros); `typecheck:e2e` limpio; build de produccion OK — las dos
      unicas warnings de budget son las dos de siempre (`shopping-list-detail` 19,52 kB y `calendar` 13,63 kB
      sobre 10), que han subido 1,7 kB con los estados de interaccion. No es una nueva.
- [x] The e2e written last round is re-read against the new ids (nothing renamed), and no claim is made
      about how any of this looks: still no Chromium here. Hover, focus ring and the width of a time
      input are the preview's judgement, and that is said in the PR instead of measured.
      Hecho: Revisado contra los ids y ampliado: el tour y Preferencias ahora comprueban que «Por defecto»
      aparece, actua y desaparece. Nada de esto se ha ejecutado: sigue sin haber Chromium, asi que como se ve
      (el hover, el anillo, el ancho del campo) es cosa de la preview, y se dice en el PR en vez de medirse
      aqui.

### Coming soon, deliberately not here

- `:active` and pressed states as tokens (`--state-*`) and the same treatment for `app-picker`'s options:
  the rule covers `button`/`a`/clickable rows, and a picker list is its own affordance discussion.
- Hover-only affordances need a touch answer: the sidebar and the row actions already show their controls
  on small screens; a systematic `@media (hover: none)` pass across the 47 components is a round of its
  own, and doing it halfway would leave a different app on a phone than on a laptop.
- Making the *global* skin the only way to paint a button (component CSS keeps 144 hand-written
  variants). The rule now refuses a control with no state; collapsing the skins into tokens is the next
  step and it touches every screen.

## 12r. Round 20 checklist — la suite e2e no habia corrido nunca, y ahora se ve

Esta tanda no la pidio el usuario: la produjo la ronda 19 al arreglar `playwright.config.ts`, que apuntaba
a un reporter inexistente. Con un reporter que no esta, Playwright no llega al test numero 1 —falla el
proceso, no la asercion—, y asi llevaba la suite desde que se escribio. En el primer run real (CI, 4 shards
con Chromium) han salido **28 tests fallidos**: 9 en el shard 1 (`account`, `calendar`), 11 en el 2
(`onboarding`, `full-stack/*`), 8 en el 4 (`shopping-*`); el shard 3 entero en verde. Ninguno es de la ronda
19: los dos asserts nuevos de «Por defecto» (tour y Preferencias) pasaron.

La regla que hay que escribirse: **un test que no se ejecuta no es un test, es un comentario largo**. Los
gates de este proyecto se median «a mano» en un sandbox sin navegador, y eso esta bien para el codigo, pero
dejaba la capa e2e entera sin verificar durante ocho tandas.

### A. Triaje por causa, no por fichero

- [ ] 12 fallos son **selectores que ya no existen** o datos que el seed ya no pone: `[data-test="add-input"]`,
      `[data-test="selection-toolbar"]`, `[data-test="pay-sheet"]`, `[data-test="discount-amount"] input`,
      `.tab` con texto «Información», `[data-test="item-row"]` esperando filas que el seed actual no crea,
      y el email `@hogaria.test` (el helper genera `@example.com`). Se arregla el test, no la app, salvo que
      el selector haya desaparecido por un cambio real —entonces el que estaba mal era el test al revés.
- [ ] 4 son **aserciones sobre texto que cambio el producto**: `offer-chip` dice `3x1` donde el test queria
      `3x2` (el test no miraba el estado que se estaba poniendo), `photo-error` dice «El modelo no esta
      disponible ahora mismo» y el test esperaba «Falta configurar la IA». Decidir cual de los dos textos es
      el correcto para el usuario y alinear el otro; no silenciar el assert.
- [ ] 2 son **estrict mode de Playwright**: `input[name="chip-select-custom"]` resuelve a dos elementos
      porque hay dos `app-chip-select` en el mismo paso. El selector tiene que bajar al contenedor del paso
      (`page.locator('#ob-allergies').locator(...)`) y no al revés.
- [ ] 1 es un **click que no llega**: «Siguiente →» en el paso de gustos —hay que mirar si el boton esta
      deshabilitado por una validacion del propio paso o si hay un overlay; el log dice `waiting for element
      to be visible, enabled and stable`, que es lo que separa un test mal escrito de una pantalla que
      bloquea.
- [ ] 6 son del **job full-stack**, y su causa es el entorno: `429` esperado y `404` recibido (los limites
      no se aplican igual cuando el server arranca con otra config), `results.json` que no se escribe, el
      404 de un asset que devuelve `text/html`, y dos cuentas del `request-budget` que cuentan los
      `@vite/client` del dev server en un build que deberia ser de produccion. Hay que separar «el stack
      roto» de «el test que corre contra el stack equivocado» antes de tocar nada.
- [ ] 2 del visor de logs: `logs-status` se queda en «Reintentando en 10 s» —el SSE no casa con el CI. Es
      el unico grupo que podria ser un defecto real de la app, y por eso va el primero en la lista.

### B. Que tiene que existir para que esto no vuelva

- [ ] El job de CI que corre los e2e **falla si `test-results/results.json` no aparece**. Ya lo hace el de
      full-stack (su mensaje existe: «Playwright no llego a escribir resultados»); falta en los shards
      normales, y es exactamente la red que habria convertido ocho tandas de e2e silenciosos en un rojo el
      dia uno. Es una linea en `.github/workflows/ci.yml`, no un proyecto.
- [ ] `tools/reporters/hogaria-e2e-reporter.js` se escribe o se olvida para siempre. Mientras el fichero no
      este, la configuracion apunta a la nada, y esto es la segunda ronda que lo descubre.
- [x] Un gate nuevo en `scripts/check-ui.mjs`: **toda cadena de `data-test` escrita en un spec e2e existe en
      alguna plantilla del frontend**. Es mecanica, es barata, y habria pillado 12 de los 28 antes de que nadie
      abriera el navegador. Los textos, no: esos cambian y el test debe poder discutirlos.
      Hecho en la tanda 20, y es la regla **17** (`data-test-huerfano`), no la 14: en medio se quedaron
      `texto-sin-traducir` (14), `clave-sin-traduccion` (15) y `pipe-sin-importar` (16). Vale tambien un
      literal que acabe en `-` y sea prefijo del nombre, porque `[attr.data-test]="'layer-' + kind"` nunca
      contiene el nombre entero y los e2e si lo conocen. Con la regla escrita: 104 nombres en los specs, 0
      huerfanos.

### Gates

- [ ] Los 28 con nombre y apellidos: cada uno o arreglado o marcado `test.skip` con un motivo de una linea
      (un skip sin motivo es la puerta por la que volvera el silencio).
- [ ] CI verde en el shard 1-4 y en full-stack, medido en el run, no afirmado desde el sandbox.

### Coming soon, deliberadamente fuera de aqui

- [ ] Ejecutar los e2e en local: no hay Chromium en esta maquina y no se va a instalar uno de 300 MB para
      una tanda. El navegador es CI, y eso obliga a que el gate de CI sea el bueno.

## 12s. Tanda 20 — todo texto de la interfaz pasa por el diccionario

Lo que reportó el usuario: al cambiar a inglés **quedan cosas en español**. Medido antes de tocar nada: 502
literales visibles en 29 plantillas y otras tantas cadenas en el código (avisos, confirmaciones, etiquetas de
opcionarios). El diccionario tenía 87 claves y las usaban tres componentes; el resto de la app estaba escrita a
mano en español. Así que esto no es «arreglar dos etiquetas»: es convertir el diccionario en el único sitio de
donde sale texto a la pantalla, y dejar una regla que no permita volver a escribir fuera.

### A. Qué es texto de la interfaz y qué es dato

- [ ] **Traducible**: lo que la app dice —títulos, botones, pistas, placeholders, `aria-label`, `title`,
      estados vacíos, avisos (`toast`), confirmaciones, nombres de comidas y de secciones cuando se *enseñan*.
- [ ] **Dato, no se toca**: lo que el usuario escribe o guarda (nombre de una categoría de la cesta, un
      alimento propio, una receta generada por la IA) y lo que viaja en un contrato: `MEAL_TYPE_LABELS` y
      `MEAL_TIME_META` siguen en español porque el server parsea la respuesta del modelo por esas cadenas
      (`taste-profile.ts` hace `formTime('Desayuno')`). Donde esas constantes se *pintan*, la pantalla usa
      `t('meal.<tipo>')`; donde se *envían*, siguen mandando el literal del contrato. Un refactor que
      tradujera el dato cambiaría el prompt de la IA.
- [ ] **Se queda como está, declarado**: lo que contesta el server (`error.message` del API, que se muestra
      tal cual en el toast) y el contenido generado por la IA. Traducir eso es `Accept-Language` en el
      server y un prompt bilingüe: es otra tanda, y está en Coming soon.

### B. Arquitectura del diccionario (como quedo)

- [ ] `core/i18n/dict/<dominio>.ts`, uno por pantalla (nav, auth, ui, dashboard, recipes, pantry, shopping,
      calendar, account, preferences, onboarding, ai-config, household, logs, settings). Cada fichero exporta
      `Pair = { es, en }`; `core/i18n/index.ts` los mezcla. Motivo: con 600 claves en un solo fichero el
      service sería ilegible y cualquier retoque generaría conflictos en todas las tandas a la vez.
- [ ] `type TranslationKey = keyof typeof DICTS.es`, y `t()`/la pipe la aceptan con ESOS valores. Con
      `strictTemplates` encendido, una clave mal escrita en una plantilla es **error de compilación**, no una
      clave visible en pantalla. Es la garantía real; la regla 15 del check-ui es la que además exige que
      exista en los dos idiomas (el compilador no ve `en`).
- [ ] Interpolación con `{param}` como hasta ahora (`{n} recetas`). Los textos que mezclaban contenido y
      `{{ }}` en la plantilla pasan a ser una clave con parámetro: `shopping.tab.pending = 'Pendientes ({n})'`,
      y no dos cadenas pegadas en la plantilla —juntar palabras en la plantilla es lo que impide traducir.
- [x] La etiqueta se calcula al renderizar (getter o método), nunca en un campo `readonly` de la clase: un
      campo se evalúa una vez al construir y no se entera del cambio de idioma. Donde el getter construye
      arrays para un `*ngFor`, se memoiza (misma lección que 12q-E: identidad estable).
      **Y la memoización no lleva el idioma en su clave**: `app-meal-hours` lo hacía y ya no. Lo que se guarda
      en el array es la `labelKey`, así que el cache vale para los dos idiomas y la pipe impura lo traduce al
      pintar. Efecto secundario deseado: el componente deja de inyectar `I18nService`, y sin `inject()` en el
      constructor sus specs vuelven a poder instanciarlo sin TestBed (el puente de vitest lo agradece).

### C. Reglas de guardia (14, 15 y 16 en `scripts/check-ui.mjs`)

- [ ] `texto-sin-traducir` (14): en `template:` no queda ningún literal con palabras fuera de una pipe `| t`
      —texto entre etiquetas y los atributos `placeholder`, `aria-label`, `title`, `label`, `alt`—. Se saltan
      comentarios, atributos técnicos (`class`, `id`, rutas, nombres de icono) y lo que ya está dentro de una
      expresión. Empieza con la lista de deuda en `LEGACY` por fichero (29) y **la lista solo puede encoger**;
      el objetivo de la tanda es dejarla a cero, así que la regla queda sin excepciones.
      Hecho: la lista de deuda de la 14 está **vacía** (los 111 casos que quedaban se cerraron en esta tanda,
      y `--sin-deuda` deja de tener sentido para esta regla). La cuenta entera: 502 literales al empezar, 0 al
      cerrar, en 177 ficheros.
- [ ] `clave-sin-traduccion` (15): toda clave referenciada (plantilla o `t(`) existe en `es` **y** en `en`, y
      toda clave de los diccionarios se usa en algún sitio. Los dos sentidos: si falta la clave, la pantalla
      sale en el idioma viejo o con la clave en crudo; si sobra, es texto muerto que alguien jurará vivo.
      Hecho: 0 claves sin inglés en los 22 diccionarios y 0 claves muertas (25 que había se borraron, y las
      cuatro de `common.*` que no usaba nadie también).
- [x] `pipe-sin-importar` (16): si la plantilla usa `| t`, el componente importa `TranslatePipe`. Nace
      porque NG8004 solo lo ve `ng build`, que es el único gate que mira plantillas: 40 segundos contra 15
      minutos de compilación. Y la 17 (`data-test-huerfano`) cierra la cuenta que quedó de 12r.

### D. CI con dos idiomas, y el test que faltaba (hecho)

- [x] `playwright.config.ts` fija `locale: 'es-ES'` en `use`. No es un capricho: con `language: 'auto'` y el
      Chromium de CI (`en-US`), el día que los textos pasen por el diccionario **toda la suite e2e escrita en
      español empieza a fallar contra una app que no está rota**. Un test cuyo idioma depende de la máquina
      no es un test; se ancla el locale y se dice. Y se ancla también la preferencia guardada
      (`hogar:v1:language = 'es'`) desde `tests/e2e/fixtures.ts` con un `addInitScript`: el `localStorage`
      sobrevive entre specs dentro del mismo worker, y quien corría después de una prueba de idioma probaba
      otra app.
- [x] e2e nuevo: en cada pantalla principal, cambiar a inglés y exigir que **no quede español** (se comprueba
      el texto visible contra una lista de palabras que solo existen en español: `Guardar`, `Añadir`,
      `Cancelar`, `Despensa`, `recetas`…), y volver a español y exigir lo mismo con las inglesas. Es el test
      que habria evitado esta tanda entera, y es barato porque el diccionario ya da el oráculo.
      Escrito en `tests/e2e/i18n-idioma.spec.ts`: 7 pantallas × 2 direcciones, y el oráculo es una lista de
      frases que solo existen en un idioma. Comprueba además `placeholder`, `title` y `aria-label`, que es
      donde el español se escondía (no salen en `innerText`) y tiene un test extra de la pipe impura: pulsar
      el idioma en Configuracion cambia 'Recipes' a 'Recetas' **sin navegar ni recargar**. Aquí no hay
      Chromium, así que corre en CI y su resultado va en el PR, como en 12r.
- [ ] `tests/e2e/settings-theme-i18n.spec.ts` pasa de «`/Claro|Light/`» a afirmar los dos textos por separado:
      la tolerancia a ambos idiomas era una coartada mientras la mitad de la app no se traducía.

### E. Convención de claves: una frase, una clave

- [x] **Un diccionario por pantalla** (`dict/<dominio>.ts`), y el dominio es el nombre de la carpeta del
      componente: `home-profile-picker` → `home_profile_picker`. No hay un `dict/comun.ts` donde acaban los
      restos: lo que se repite está en `ui.*` y `common.*` **a propósito**, y es lo primero que consulta el
      extractor antes de acuñar una clave nueva.
- [x] **El texto generado se copia, no se inventa**: una frase que sale de un `@Input` o de un placeholder
      larga se convierte en una clave con el propio texto (`account.tu_nombre_tu_foto`), y si lleva un número
      o un nombre dentro, el hueco es `{param}` (`calendar.month_more`, `logs.zona_detectada`). Las ~96 claves
      que ya existían conservan su `camelCase`; las nuevas van en `snake_case` porque es lo que produce el
      extractor y un refactor no se pone a renombrar lo que funciona.
- [x] **Los plurales se resuelven con dos claves**, no con una `s` pegada en la plantilla:
      `invite.miembro_uno` / `invite.miembros`, elegidos en un getter. `{{ n !== 1 ? 's' : '' }}` es
      gramática española escrita en el template, y en inglés no significa nada.
- [x] **Dentro del objeto de parámetros no puede haber una pipe**: `'k' | t:{name: x || ('otro' | t)}` no
      compila (los pipes van en la raíz del binding o en una rama de un ternario, no dentro de un objeto de
      argumentos). Cuando hizo falta un texto dentro de otro texto, salió un getter al `.ts` — `tu cuenta`
      en `account.displayName()`.
- [x] **Un `@Input` no lleva literal de fábrica**: `@Input() label = 'Unidad o formato'` se escribe al
      construir y se queda en español para siempre. Se deja el Input sin valor y el defecto se resuelve en un
      getter con `t()` (`app-unit-picker`, `app-home-profile-picker`). Eso es lo que denuncia la 14 en su
      última variante.
- [x] **Herramientas**: `scripts/i18n-extract.mjs` (repasa plantillas, reutiliza cualquier `texto → clave`
      que ya exista antes de acuñar, decodifica entidades porque un property binding no las decodifica, y
      escapa saltos de línea al escribir el diccionario) y `scripts/i18n-merge-dupes.mjs` (una frase, una
      clave: reescribe las comillas por toda la app y borra la línea duplicada; canónica
      `common.* > ui.* > nav.* > la más corta`). Reescribieron 40 referencias y dejaron 19 frases duplicadas
      en una sola clave.
- [x] **Lo que NO entra en el diccionario**, y no es una excusa sino el criterio: el dato que se guarda
      (`COMMON_ALLERGENS`, `COMMON_LIKES`, las categorías y alimentos que escribe la casa) porque traducirlo
      haría que la pantalla mienta sobre la base de datos; el contrato con la IA (`MEAL_TYPE_LABELS`,
      `MEAL_TIME_META.label`) porque esas cadenas las parsea el server; y las etiquetas de catálogo **sin
      consumidor** (`*_LABELS` de `shared/models/household.model.ts`), que se dejan y se anotan en §13 para
      que no se confundan con deuda de esta tanda.
- [x] **La deuda de emoji viaja con la clave**: `⏱️ {n}min`, `🤖 Configuración IA` o `📦 Despensa` seguían en
      el template cuando `check-ui` los perdonaba por fichero; al migrarlos se fueron dentro del diccionario,
      así que los `dict/*.ts` correspondientes entran en la lista de deuda de `sin-emoji` (cinco, y la lista
      solo puede encoger). Quitar el emoji de la clave es el paso que queda, y es el que ya estaba pedido.

### Gates (medidos al cerrar la tanda)

- [x] `check-ui`: **177 ficheros, 17 reglas, sin incidencias**, con la lista de deuda de la 14 vacía
      (hoy son 18: la regla que faltaba se ve en §12t-R).
- [x] `tsc` de app y de spec limpios; `typecheck:e2e` limpio; vitest del server **22 ficheros / 559 tests**;
      puente del frontend **16 ficheros / 155 tests**; `ng build --configuration production` **0 errores** (es
      el único gate que ve las plantillas: NG8004, NG8113 y NG5 de los que hablan arriba salen todos aquí).
- [ ] Los e2e: en CI, con el locale anclado. Aquí no hay navegador, así que la comprobación del cambio de
      idioma se trae a CI y se reporta el resultado en el PR, como en 12r.

### Coming soon, deliberadamente fuera de aquí

- [ ] `Accept-Language` en el server para los mensajes de error y los nombres que genera la IA.
- [ ] Fechas, números y dinero con el idioma activo (`Intl`): hoy el `DatePipe` de Angular usa la local
      del navegador, que no tiene por qué ser la del `language` de la app.
- [ ] Un tercer idioma: la estructura (`dict/<dominio>.ts` + `Pair`) lo permite sin tocar las pantallas.

## 12t. Tanda 21 — bloquear comidas del planificador, y eventos que se repiten

Pedidos por la persona que usa la app, los dos con su caso detras:

1. «Puedes hacer que la IA no te planifique parte del horario; por ejemplo, si solo quiero que planifique la
   cena, pues bloqueas las demas.» Hoy la eleccion de comidas es **por generacion** (el dialog de «Generar con
   IA» tiene cuatro checkboxes que vuelven a estar marcados la proxima vez). Lo que se pide es una
   preferencia de la casa: la cena se planifica, lo demas no, y asi se queda.
2. «En la creacion de eventos pueda repetirse: semanal, diario.» Un recado recurrente («sacar la basura los
   lunes») hoy se escribe a mano cada semana.

### T. Bloquear comidas del planificador (`mealPlan`)

- [ ] **El dato**: `users.preferences.mealPlan: { breakfast, lunch, snack, dinner }` de booleanos, con
      `true` de fabrica (que es exactamente lo que hace la app hoy: una clave ausente no cambia el
      comportamiento). Se guarda en `preferences` y NO en `users` —misma decision que `mealTimes` (12q).
- [ ] **El contrato del PATCH, el mismo de `mealTimes`**: `undefined` = no tocar, `null` = borrar la clave
      (volver al fabrica), `true`/`false` = escribir. Ningun `required` se afloja, y un valor que no es un
      booleano se rechaza con 400 (`INVALID_FORM`) en lugar de guardarse como verdad rara.
- [ ] **Quien lo lee**: `plan-week`. Los cuatro checkboxes del dialog pasan a arrancar del bloqueo, y las
      comidas bloqueadas **no se ofrecen** —una linea dice cuales estan bloqueadas y donde se cambia—. Si estan
      las cuatro bloqueadas, «Generar» no esta disponible y el motivo se lee al lado del boton.
- [ ] **Quien lo respeta al escribir**: `persistWeeklyPlan` ignora las comidas bloqueadas aunque el modelo se
      las invente. Es la diferencia entre «no las pidas» y «no las escribas»: el prompt es una peticion, la
      persistencia es la garantia.
- [ ] **Donde se cambia**: en `app-meal-hours`, fila a fila —«Que la IA la planifique» con su `app-checkbox`
      en la misma linea de la hora—, porque el horario y quien lo rellena son la misma decision. El tour de
      bienvenida NO lo toca: pregunta las cuatro horas, y ahi bloquear seria una pregunta mas de las seis
      prometidas (queda en §13).
- [ ] **Lo que NO cambia**: un bloqueo no borra nada. Ni las comidas ya planificadas de esa semana, ni las
      siguientes semanas escritas, ni el «+» manual del calendario: bloquear es quitarle la tarea a la IA, no
      quitarle la comida a la casa. Y los anclajes de la rejilla siguen usando la hora de esa comida,
      bloqueada o no.

### R. Recurrencia de los eventos de la casa

- [ ] **El dato, dos columnas**: `calendar_events.recurrence` (`'none' | 'daily' | 'weekly'`, `NOT NULL DEFAULT
      'none'`) y `calendar_events.exceptions` (JSON de fechas `YYYY-MM-DD`, `DEFAULT '[]'`). Se anaden con el
      helper de `config/database.ts` que ya existe (`addColumnIfMissing`), sin tabla nueva y sin rebuild: una
      fila vieja es `'none'`, que es lo que era.
- [ ] **Una fila, no una fila por dia**. La serie vive en una fila y las ocurrencias se materializan al leer.
      El motivo es el mismo de «las comidas no se copian a `calendar_events`» (8f): dos verdades se
      desincronizan. Y hay un efecto secundario bueno —editar el titulo de la serie cambia los lunes de
      verdad, y borrar la serie no deja 30 filas huerfanas—.
- [ ] **Diario y semanal, y nada mas por ahora**: `daily` = cada dia desde `date`; `weekly` = el mismo dia de
      la semana de `date` (`getUTCDay` de la fecha ISO, nunca `new Date()` local, que en un navegador con otra
      zona corria los lunes). Mensual y «hasta el dia X» se van a §13 con su motivo: sin `until`, una serie es
      para siempre, y eso es honesto para un recado de la casa y mentira para una cita medica.
- [ ] **`exceptions` es el «solo este dia no»**: al borrar una ocurrencia concreta se anade SU fecha a la
      lista, y la serie sigue viva. Borrar la serie entera es lo que hace `DELETE /events/:id`, y el dialog lo
      dice con las letras: «Se quitan todas las repeticiones». Un evento que no se repite no tiene este
      dialogo: borra como sempre.
- [ ] **Se expande en un sitio**: `core/calendar-recurrence.ts` (nuevo, puro, con sus specs) y llamado desde
      el service al leer, de modo que mes, timeline, dia y el contador «+N» ven exactamente la misma lista. Un
      `computed` por vista que expandiera seria cuatro calendarios de la verdad.
- [ ] **El editor**: un `app-picker` «Repetir» con tres opciones. `PATCH` de una serie cambia la serie, no la
      ocurrencia pulsada, y el dialog lo avisa en una linea («Editas todos los lunes»); el «solo este dia»
      existe para quitar, no para renombrar. Renombrar un dia suelto habria exigido un modelo de ocurrencias
      propias, y eso es otra tanda.
- [ ] **La ventana**: se piden `from`/`to` al server y la serie se expande contra esa ventana, asi que el
      `LIMIT` de la consulta no corta ocurrencias (cuenta filas, no dias). Un `limit` de 200 filas con 40
      series diarias sigue siendo 40 filas.
- [ ] **Visibilidad e invitados sin cambios**: una ocurrencia es la fila de su serie, con su `editable` (solo
      el autor), sus `attendees` y su `source`. No se introduce «responder a una invitacion repetida».

### Idioma (12s, aplicado a lo nuevo)

- [ ] Todo texto nuevo sale de `dict/calendar.ts` y `dict/preferences.ts` con sus claves: «Que la IA la
      planifique», «bloqueadas en Preferencias», «Repetir», «No se repite», «Cada dia», «Cada semana»,
      «Editas todos los lunes», «Se quitan todas las repeticiones», «Quitar solo este dia». Nada de
      concatenar en la plantilla: lo que lleva una fecha o un numero dentro, lleva `{param}`.
- [ ] Un `@Input` nuevo, sin literal de fabrica; una lista de opciones, con `labelKey` o resuelta en un getter
      que llame a `t()` (las dos valen, lo que no vale es un `readonly` con el texto ya traducido).

### Gates

- [x] `node scripts/check-ui.mjs` en verde (18 reglas) —incluida la 14 sobre las plantillas nuevas y la 15
      sobre las claves nuevas.
- [ ] `tsc -p tsconfig.app.json` y `-p tsconfig.spec.json`, `npm run typecheck:e2e`.
- [ ] `vitest run` en `server/` (schema, POST/PATCH/DELETE de recurrencia, `mealPlan` en el PATCH de
      preferencias y en `persistWeeklyPlan`) y el puente del frontend (`calendar-recurrence`,
      `app-meal-hours` con el bloqueo).
- [ ] `ng build --configuration production` sin errores: es el unico que ve las plantillas.
- [ ] e2e: crear un evento semanal, ver los cuatro lunes, quitar uno, volver a entrar y que siga sin ese
      lunes; y bloquear la merienda, generar, y que la merienda no aparezca. Corre en CI (aqui no hay
      Chromium) y su resultado va en el PR.

### Fuera de aqui, con su motivo

- [ ] `until`/「cada N semanas»/mensual en la recurrencia: hacen falta, pero piden UI de calendario y una
      decision de que pasa con las ocurrencias pasadas. §13.
- [ ] El bloqueo en el tour de bienvenida (añadiria una pregunta a las seis prometidas) y un «silenciar este
      dia» que no sea borrar la ocurrencia. §13.


## 12t-R. Como ha quedado la tanda (recurrencia) y el cierre de i18n

Entregado sobre lo pedido en §12t. Lo que sigue es lo que esta en el codigo, con las decisiones que no se
ven desde la pantalla.

### Recurrencia de eventos (lo pedido: «que se pueda repetir, semanal, diario»)

- [x] Modelo: `HouseholdEvent.recurrence: 'none' | 'daily' | 'weekly'` y `seriesDate` (la fecha de la que
      arranca la serie). `HOUSEHOLD_RECURRENCES` + `HOUSEHOLD_RECURRENCE_META` (con `labelKey`, regla 15) en
      el modelo compartido, que es de donde salen a la vez las opciones del selector y el glifo de la pastilla.
- [x] BD: `recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN (...))` y
      `exceptions TEXT NOT NULL DEFAULT '[]'`, en el `CREATE` y via `addColumnIfMissing` para las bases ya
      creadas. Las excepciones se guardan como ISOs ordenadas, no como indices: un cambio de cadencia no
      descoloca las que ya existen.
- [x] Lectura: el GET pide el rango visible y expande **despues** del `LIMIT` (`expandOccurrences`), con
      `truncated: true` si se ha cortado. La fila de la serie es UNA fila en la BD: siete burbujas en la
      rejilla, no siete eventos.
- [x] Edicion: el modal abierto desde una burbuja muestra la fecha de ESA ocurrencia (`occurrenceDate`) y la
      de la serie (`seriesDate`); «Quitar solo este dia» llama a
      `DELETE /api/calendar/events/:id/occurrences/:date` (400 de formato, 404, 403 si no eres quien lo
      escribio, 400 `EVENTO_SIN_REPETICION`, idempotente). Mover la fecha de una serie quita esa fecha de las
      excepciones; pasar a `none` las borra todas.
- [x] El autor no es invitado, y `editable` sigue siendo solo del autor: una serie la cambia quien la apunto,
      el resto la ve y puede faltar a un dia.
- [x] e2e en `tests/e2e/calendar.spec.ts` (`Calendario — repeticiones`), medidos en la agenda del dia que es
      donde la app pinta las sueltas: la serie semanal aparece hoy y no ayer (habia que cambiar de dia con la
      flecha: contar la semana entera hubiera dependido de que la rejilla pinte cada dia, y eso es otra
      pantalla), la diaria se sostiene tambien el dia anterior, «quitar solo este dia» deja el hueco vacia y
      el dia de al lado en pie, y una suelta normal no repite ni lleva glifo. Playwright no corre aqui (no hay
      Chromium); el job corre en CI.

### Un arreglo que la prueba en vivo se nego a callar

- [x] `PATCH /auth/taste` con `mealPlan: null` (y el mismo caso en `mealTimes`) no borraba nada: la rama era
      `if (patch.mealPlan)` y `null` es falsy, asi que el tri-estado prometido se quedaba en dos estados.
      Verificado contra el servidor en marcha con la BD real, escrito el test primero (rojo: 2 pruebas) y
      arreglado con la rama `=== null` antes del `if` ✓ 592 pruebas en el server. El flujo de la pantalla no
      estaba roto (`mealPlanPatch()` nunca manda un `null` de nivel superior: manda las comidas cambiadas, y
      `null` por clave ya borraba esa clave), pero la garantia escrita en el contrato mentia.

### Cierre del i18n (lo pedido en la ronda 20: «usa siempre el sistema de traducciones»)

- [x] Regla 18 del gate: todo literal con pinta de frase que acabe en un sink (`toast.*`, `*Error.set`,
      `note`, `title`, ...) tiene que salir de `t()`. Ademas de los setters, cubre `return 'prosa'`, el
      `cond ? 'prosa' : 'prosa'` dentro de `t()` y las variables `t(clave)` - no el «solo literales» que
      dejaba fuera los helpers. El receptor puede tener tramos intermedios (`this.formErrors.name.set('...')`
      cuenta igual que `this.photoError.set('...')`), que era el hueco por donde se escurrian los dos errores
      del formulario de despensa.
- [x] Locale de formato en un unico sitio: `core/time.ts` guarda `dateLocale()` y el `I18nService` la fija
      (`en` → `en-GB`, lo demas → `es-ES`) en su `effect` y en `languagechange`. Se acabaron los 15 `'es-ES'`
      repartidos: fechas, dias de la semana, kcal, «X personas», tamaños de almacen y los memoizadores de
      `calendar.util` (la clave de cache lleva el idioma dentro, si no, cambiar de idioma no se notaba).
- [x] Lo que devolvian los helpers puros es clave, no frase: `AvatarIssue {clave, params}` (viaja por los
      `catch` como un `Error` normal), `pendingLabelKey`, `stepLabel()` → descriptor
      `{numero, total, tituloKey, skipped}` que la pantalla arma con `onboarding.paso_de` y
      `onboarding.sin_responder`, `describeLineDiscount(discount, {unidad, unidades})`, `facesOf`/
      `periodShortLabel`/`sourceLabel` por clave. Un modulo sin inyeccion no puede saber de idioma: ahora
      tampoco lo finge.
- [x] Prosa que se quedaba fuera del gate y ya no esta: etiquetas del boton «+ Agregar» de despensa, errores
      de `formErrors.name/quantity`, los dos estados vacios de las listas de la compra, la nota en vivo del
      SSE, `linkVariants` («sin tienda»), el mapa de errores de la foto del ticket y los avisos del tour al
      guardar/saltar. Las claves nuevas mantienen el texto en español identico al anterior: los e2e que
      asertan texto en suelto siguen valiendo.

### Deuda i18n que se queda, escrita para que la proxima tanda no la re-descubra

- [ ] Catalogos de `features/pantry/pantry.component.ts` (`utensilCategoryOptions` y el de electrodomesticos,
      ~20 `label:` en castellano dentro de un campo): se arreglan pasando a `labelKey` + un `computed` que
      mappea con `t()`, igual que `kindOptions` en el calendario. No los ve la regla 18 porque un campo con
      objetos no es un sink.
- [ ] `shopping-list-detail.component.ts`: `discountKinds`/`discountScopes` tienen `label:`/`hint:` en prosa
      y, encima, las etiquetas se guardan como dato en `data.targets`. Cambiar la frase sin migrar los
      objetivos ya guardados rompería los descuentos existentes: hace falta clave + migracion, no un `t()`.
- [ ] Catálogos de `shared/models/taste-profile.ts`: son datos persistidos que viajan al prompt del modelo
      (`preferences.tastes`), no etiquetas de UI. Traducirlos exige migrar el perfil; se deja para su tanda.
- [ ] `shopping.model.ts` (`hint:` de las promos de ejemplo) y `pantry.model.ts:105` («Utensilios de cocina»):
      texto de siembra/dato, no de interfaz.

### Gates (como han salido)

- [x] `node scripts/check-ui.mjs`: 177 ficheros, 18 reglas, sin incidencias. Con `--sin-deuda` (el modo que
      ignora las listas LEGACY para medir lo que queda de una migracion) salen 338 avisos y **ninguno** es de
      las reglas 14-18: 321 son `sin-emoji` dentro de los diccionarios y 11 `sin-select-nativo`, deuda que ya
      esta apuntada en `DESIGN-SYSTEM.md` con su decision pendiente.
- [x] `tsc -p tsconfig.app.json` y `-p tsconfig.spec.json`, `npm run typecheck:e2e`.
- [x] `vitest run` en `server/`: 23 ficheros, 590 pruebas (expansion, excepciones, permisos, `mealPlan`,
      `persistWeeklyPlan`).
- [x] Puente del frontend (`tmp-frontend.vitest.config.ts`): 16 ficheros, 144 pruebas, con las firmas nuevas
      de `stepLabel`, `pendingLabelKey` y `AvatarIssue`.
- [x] `ng build --configuration production` sin errores.


## 13. Coming soon (deliberately not in this program)
- **Las etiquetas de catálogo sin uso de `shared/models/household.model.ts`.** `*_LABELS` en español que no
  lee ningún componente: no son texto visible, son un residuo. O se enganchan a una pantalla con su `labelKey`
  o se borran; mientras no cuelguen de la regla 15 (que solo exige que lo que se usa esté en los dos idiomas),
  se quedan ahí declarados para que la próxima tanda los borre con conocimiento.
- **Quitar los emoji de las claves del diccionario.** La regla `sin-emoji` perdona cinco `dict/*.ts` porque
  los pictogramas venían perdonados en sus plantillas. Convertirlo es decidir si el glifo es decoración (se
  quita) o es información (pasa a `app-icon` con su nombre), y toca 5 pantallas con sus capturas.
- **Despensa: iconos y el desplegable del formulario.** Doce categorias se ensenan con emoji
  (`🧀 🥩 🐟`) y el `<select>` de ubicacion lleva los suyos dentro de cada `<option>`; la regla de
  «los iconos nunca son emojis» solo se cumple en lo que `check-ui` mira, y la despensa esta en su
  lista de deuda. Convertirla es: `getCategoryIcon`/`getLocationIcon` devuelven el NOMBRE del
  icono, el formulario pasa a `app-picker` (con `app-unit-picker` para la unidad, que ya existe)
  y se quitan los dos ficheros de la lista. Se hizo el visor de logs en la ronda 10 porque ya
  estaba en el diff; la despensa entera merece su propia tanda con sus capturas.
- **Fotos de las lineas de la compra, tambien en disco.** `uploads/` existe desde §12j para el
  avatar de la cuenta; la foto que se adjunta a una linea sigue viajando como base64 dentro de la
  propia fila, que es lo que hace pesada la lectura de una lista con diez fotos. Moverla es
  reutilizar el mismo endpoint y cambiar una columna por una ruta.
- **Precio por linea en la foto.** Las lineas que devuelve el modelo traen cantidad y precio, pero
  no unidad: quien revisa la foto no puede corregir «1 L» a «1 botella» y luego en la lista si. El
  control ya existe (`app-unit-picker`); falta el campo en el prompt y en la validacion.

- **Store catalog with aliases and barcodes**: `stores` as a table (not a column of names), one product
  with several shelf names per shop, EAN lookup. Today the link is the product key, chosen by hand in
  the line sheet, and that is enough to remember prices per shop —it is not enough to *suggest* them.
- **Photo price tags teaching observations**: a photographed shelf price still only sets the line. When
  it also writes `price_observations` (with the store, `source: 'photo'`), the photographed shop starts
  being one of the shops whose prices the app already knows.
- **Drag to reorder inside a section**: the `PUT /lists/:id/order` endpoint and the `position` column are
  ready; what is missing is a handle that cannot be confused with the swipe. Same for **picker recents**
  (`localStorage`), including the unit picker: what the household actually writes («pack de 6», «barra»)
  is already in `shopping_list_items.unit`, and showing it first would remove most typing — but a house
  that changes shop changes format, so the window has to be decided before it becomes a canon.
- **The UI debt the guard counts**: 21 files still paint an emoji where a glyph should be (the log viewer
  stopped in round 10, and its filters still use a native `select`), and five screens
  still open a native `select`. They are named in `scripts/check-ui.mjs`, one PR per screen, and the list can
  only shrink — the guard prints a line when a file stops offending.
- **Photo prices as observations**: a photographed price tag sets the line price today; it should also teach
  `price_observations` (with the store and a `source: 'photo'`), which is the difference between a price you
  typed once and a shop that starts knowing what milk costs.
- **Household tasks**: assignments, rotations, due windows, points for kids, per-member load chart.
- **Shared calendar**, what is left of it: recurrence, availability, "who cooks". General events with
  kind filters and colours (§8f) are in; a recurring event is a different problem and it is not here.
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
- **Vector logo** (`icon.svg` / `favicon.svg`): traced from `design/hogaria-icon-source.png` once the
  project has a real tracer; until then there is one visual source, not two that disagree.
- **Frontend coverage gate**: same 70 % per file for `frontend/` when the unit suite runs headless in CI
  today the karma job is not in the workflow; the report is already produced by `test:client:coverage`.
- **Install screenshots**: the manifest `screenshots` block returns with real captures under
  `frontend/src/assets/screenshots/` (it pointed at files that never existed).
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
