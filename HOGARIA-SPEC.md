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

### The line sheet (units)

- [ ] The unit control is **one** control. The quick chips (`ud kg L pack`) and the picker below
      repeated the same value twice, and a row that offers the same choice twice is a row that
      disagrees with itself the moment one of the two is stale.
- [ ] Families: the picker groups by what is being measured —peso, volumen, unidades, formatos,
      medidas de cocina— and choosing the family **selects its default unit** (Peso → kg, Volumen
      → L, Unidades → ud). Refining inside the family is one more tap, not another control, and
      writing «bote de 400 g» by hand keeps working because a unit that is not in the catalog is a
      unit someone actually uses.
- [ ] `frontend/src/app/features/shopping/unit-picker.component.ts` is a component, not a fourth
      copy of the pattern: three screens pick units (list line, pantry, photo review).

### The line discount

- [ ] `shopping_list_items` gains `disc_kind`, `disc_value_minor`, `disc_percent_bps`, `disc_units`
      (added with `addColumnIfMissing`, no rebuild —the table already survived one of those and it
      does not need to survive two in the same round).
- [ ] `lineDiscount` in `utils/list-discount.ts`, applied **after** the offer and **before** the
      basket coupon, which is the order a till uses: `2x1 → -10 % sobre 2 unidades → -2,50 € de la
      cesta`. Applied in the other order, the same receipt gives a different number, and there is no
      way to argue with it afterwards.
- [ ] Percent over the first N units (`disc_units`) exists because that is a real sign («50 % en la
      segunda unidad») and without it the only honest option was to lie about the whole line.
- [ ] Clamped and said: a 3 € discount on a 2,85 € line lowers it to 0,00 and the description says
      so; it never goes negative and never refunds the rest of the basket.
- [ ] `createItemSchema`/`updateItemSchema` take `discount` (and `discount: null` removes it, which
      is why it is not a `COALESCE`); `PATCH` writes the four columns; `estimate` returns
      `lineDiscountMinor` and `lineDiscountDescription` per row; the audit trail logs
      `item.discount`.
- [ ] The sheet's «Oferta de la tienda» block becomes a discount block with the four kinds
      (oferta, porcentaje, importe, ninguna), a live «de 2,85 € a 2,56 €» line before saving, and
      autosave like every other field in that sheet.

### Clocks

- [ ] The server stored UTC in a column without saying so: `2026-09-20 09:44:18` has no zone, so the
      browser read it as *local* and everything moved by the offset —in Madrid, two hours: a list
      saved a second ago said «hace 2 horas» and the log viewer printed tomorrow's timestamps.
      The fix is at the boundary: `timestamp.middleware.ts` rewrites naive `YYYY-MM-DD HH:MM:SS`
      (and `T…` without zone) into ISO with `Z` on the way out, for JSON responses only. Date-only
      strings are left alone on purpose: `2026-09-20` is a day on a calendar, not an instant, and
      adding a zone to it would move the lunch to the previous day.
- [ ] `frontend/src/app/core/time.ts` owns what the client knows: `clientTimeZone()` (Intl, detected,
      not typed), `parseInstant` (Z or naive-UTC), `formatTime`/`formatDateTime`/`formatDay` and a
      `formatRelative` that says «hace 3 min», «ayer a las 19:14» or «16 de sept» by distance. Every
      hand-rolled `new Date(value)` in a component goes through it: the tray's «Guardado», the
      detail's, the log viewer's clock, the pantry's expiration chip.
- [ ] Calendar dates keep the local-day rule from `calendar.util.ts` (`toISODate` from local parts):
      that file already stopped the UTC-shift bug for meals, and the same rule applies to expiration
      and receipt dates —a product does not expire one day earlier because you fly to Lisbon.
- [ ] Tests: the middleware on a Hono app (naive → Z, date-only untouched, `text/event-stream`
      skipped, non-JSON body skipped), the engine table for line discounts (order, clamp, per-units
      slice), `time.spec.ts` in Jasmine for parse/format/relative, and the full-stack suite gains a
      check that the API never answers with a zone-less timestamp.


## 13. Coming soon (deliberately not in this program)

- **Per-line discounts**: a discount that belongs to *one row* with its own value («el jamón, 2 €
  menos, y el queso un 10 %»). The engine already knows how to spread a discount over chosen lines and
  how to answer "what did I actually pay for this"; what it does not have is a second table, and one
  coupon per list is what the till does. Coming back to this needs a real receipt, not an idea.
- **Store catalog with aliases and barcodes**: `stores` as a table (not a column of names), one product
  with several shelf names per shop, EAN lookup. Today the link is the product key, chosen by hand in
  the line sheet, and that is enough to remember prices per shop —it is not enough to *suggest* them.
- **Photo price tags teaching observations**: a photographed shelf price still only sets the line. When
  it also writes `price_observations` (with the store, `source: 'photo'`), the photographed shop starts
  being one of the shops whose prices the app already knows.
- **Drag to reorder inside a section**: the `PUT /lists/:id/order` endpoint and the `position` column are
  ready; what is missing is a handle that cannot be confused with the swipe. Same for **picker recents**
  (`localStorage`): useful once someone proves it, not before.
- **The UI debt the guard counts**: 22 files still paint an emoji where a glyph should be, and five screens
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
