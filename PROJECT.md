# AcmeCatalog

## Real goal

This app is a portfolio vehicle for demonstrating a full test automation and CI/CD
pipeline as part of a senior QE / automation engineer job search:

**NUnit (done) → Cypress → JMeter → GitHub Actions**

Phase 1 built the application itself plus NUnit tests for the service layer. Phase 2
(this phase) gave the app a real visual identity, added authentication (cookie-based
for the MVC site, JWT for the API), Swagger/OpenAPI docs, a health endpoint, and
consistent API error responses — while keeping every interactive element from Phase 1
intact. Git, GitHub, Cypress, JMeter, and GitHub Actions are still deliberately **not**
set up — those remain manual future phases, done by hand, to actually practice the
tools rather than have them scaffolded.

## What changed in Phase 2

- **Visual redesign** — a real design system (earthy forest-green + terracotta
  palette, Sora/Inter type pairing) replacing the generic Bootswatch theme. The
  homepage became an actual product landing page (hero, live stats pulled from the
  database, "how it works," reframed value props) instead of template boilerplate.
  Catalog cards got category-color-coded badges, image hover zoom, and an overlay
  drag handle. Every page — including the new auth pages — shares the same look.
- **Authentication** — ASP.NET Core Identity for the MVC site (cookie auth: Register,
  Login, Logout, Account/Profile pages) and JWT bearer auth for the REST API
  (`POST /api/auth/login`). See [Authentication](#authentication) below.
- **Swagger/OpenAPI** — full interactive API docs at `/swagger`, with a JWT bearer
  "Authorize" flow and accurate per-endpoint lock icons (only endpoints that actually
  require auth show as secured).
- **Health check** — `GET /health`, public, checks real SQLite connectivity via EF
  Core's `AddDbContextCheck`, returns JSON.
- **Consistent API errors** — every `/api/items` and `/api/auth` error case (401, 404,
  400 validation) returns a `application/problem+json` body, including auth failures
  that happen in middleware before a controller action ever runs.
- **Zero interactive elements removed or simplified.** Every element from Phase 1 —
  both modals, both iframes, live search, category filter, Load More, drag-and-drop
  reorder, the image upload dropzone, toasts, tabs, the accordion, and all validation —
  still exists, still has its original `data-testid`, and still works. See
  [Verification results](#verification-results) for how that was confirmed.

## What's built

### Architecture

```
AcmeCatalog.slnx
├── src/
│   ├── AcmeCatalog.Core            Models, Categories, IItemService
│   ├── AcmeCatalog.Infrastructure  EF Core DbContext (+ Identity), SQLite, DbSeeder, IdentitySeeder, ItemService
│   └── AcmeCatalog.Web             MVC + Account controllers, REST + Auth API controllers,
│                                    Security/ (JWT + Swagger auth filter), Helpers/, Razor views, wwwroot
└── tests/
    └── AcmeCatalog.Tests           NUnit tests for ItemService (EF Core InMemory)
```

- **AcmeCatalog.Core** — `Item` model, `Categories` constants, `IItemService` interface. No dependencies on anything else.
- **AcmeCatalog.Infrastructure** — `AcmeCatalogDbContext` (now `IdentityDbContext<IdentityUser>`, so catalog + Identity tables share one SQLite file), `DbSeeder` (10 catalog items), `IdentitySeeder` (the `testuser` account), `ItemService`.
- **AcmeCatalog.Web** — `ItemsController` / `AccountController` (MVC pages), `Api/ItemsApiController` / `Api/AuthApiController` (REST JSON API), `HomeController`, `Security/JwtTokenService` + `Security/AuthorizeCheckOperationFilter`, `Helpers/CategoryStyleHelper`, Razor views, static assets. Wired together with DI in `Program.cs`.
- **AcmeCatalog.Tests** — 16 NUnit tests covering `ItemService` CRUD, search/filter, category listing, and the reorder algorithm (unchanged from Phase 1 — `ItemService` itself wasn't touched by the auth/design work).

### Data model

`Item`: `Id`, `Name`, `Price`, `Description`, `Category`, `ImageUrl`, `SortOrder`, `DateAdded`.
Seeded with 10 items across 5 categories (Electronics, Home & Kitchen, Sporting Goods,
Books, Toys & Games). Identity adds the standard `AspNetUsers`/`AspNetRoles`/etc. tables
to the same database via `IdentityDbContext<IdentityUser>`.

### MVC pages (`/Items/...`, `/Account/...`)

| Route | Auth | Purpose |
|---|---|---|
| `GET /Items` | Public | Catalog grid, first 4 items, search/filter bar, drag-reorder |
| `GET /Items/LoadMore?skip=N` | Public | AJAX partial — next batch of items (pagination) |
| `GET /Items/Filter?term=&category=` | Public | AJAX partial — live search / dropdown filter results |
| `GET /Items/QuickView/{id}` | Public | AJAX partial — modal quick-view content |
| `GET /Items/ImagePreview/{id}` | Public | Standalone minimal page, embedded via iframe in the quick-view modal |
| `GET /Items/Details/{id}` | Public | Full item page with Description/Specs tabs |
| `GET`/`POST /Items/Create` | **Login required** | Add item form (validation, file upload) |
| `GET`/`POST /Items/Edit/{id}` | **Login required** | Edit item form |
| `POST /Items/Delete/{id}` | **Login required** | Delete (via confirm modal), CSRF-protected |
| `POST /Items/Reorder` | **Login required** | AJAX drag-drop reorder, CSRF-protected; see note below |
| `GET`/`POST /Account/Login`, `/Register` | Public | Auth forms |
| `POST /Account/Logout` | Login required | Signs out, redirects home |
| `GET /Account/Profile` | Login required | Shows username/email + logout |

> **Note on scope:** the request asked to protect Create/Edit/Delete. Reorder is also a
> write, so it's protected too for consistency — leaving one mutating endpoint open while
> everything else required login would be a real inconsistency. Browsing/reading stays
> fully public everywhere.

### REST API (`/api/items`, `/api/auth`)

| Route | Auth |
|---|---|
| `GET /api/items` (supports `?term=&category=`) | Public |
| `GET /api/items/{id}` | Public |
| `GET /api/items/categories` | Public |
| `POST /api/items` | **JWT bearer required** |
| `PUT /api/items/{id}` | **JWT bearer required** |
| `DELETE /api/items/{id}` | **JWT bearer required** |
| `POST /api/auth/login` | Public — returns the JWT |
| `GET /health` | Public |

Full interactive docs, including a "Try it out" + Authorize flow: **`/swagger`**.

### Authentication

- **MVC (cookie):** ASP.NET Core Identity, `IdentityUser`/`IdentityRole`, custom
  `AccountController` + Razor views (not the scaffolded Identity UI, so the pages could
  be styled to match the rest of the app). Unauthenticated visits to a protected page
  redirect to `/Account/Login?ReturnUrl=...`. The Reorder endpoint is the one exception:
  since it's called via `fetch` (not a page navigation), its `X-Requested-With` header
  makes the auth cookie handler return a plain `401` instead of a redirect, so the
  client-side JS can show an error toast instead of silently "succeeding" against a
  login page.
- **API (JWT):** `POST /api/auth/login` with `{ "username": "...", "password": "..." }`
  returns `{ token, expiresAtUtc, username }`. Send it back as
  `Authorization: Bearer <token>` on writes. Tokens are HMAC-SHA256 signed, 60-minute
  expiry, configured under `Jwt:*` in `appsettings.json` (a demo-only secret — not for
  production use).
- **Test credentials** (seeded on first run): **`testuser` / `Test123!`**

### Swagger / OpenAPI

`Swashbuckle.AspNetCore`, available in Development at `/swagger`. A custom
`AuthorizeCheckOperationFilter` inspects each action for `[Authorize]` and only adds
the lock icon / 401 response / security requirement to endpoints that actually need a
token — so `GET /api/items` shows unlocked and `POST /api/items` shows locked, matching
reality instead of Swashbuckle's blanket-lock default.

### Health check

`GET /health` uses ASP.NET Core's built-in health checks with `AddDbContextCheck`
against the real `AcmeCatalogDbContext`, so it actually verifies SQLite connectivity
rather than returning a static "OK." Response:
```json
{ "status": "Healthy", "timestampUtc": "...", "checks": [{ "name": "database", "status": "Healthy", "description": null }] }
```

### API error responses

Every `/api/items` and `/api/auth` error path returns `application/problem+json`:
- **400** — validation errors ( `[ApiController]`'s automatic `ValidationProblem`)
- **401** — missing/invalid JWT (custom `JwtBearerEvents.OnChallenge`, since the
  default bearer challenge is just an empty body + `WWW-Authenticate` header) or bad
  login credentials (`Problem(...)` in `AuthApiController`)
- **404** — item not found (`Problem(...)` in `ItemsApiController`)

### Persistence

SQLite via EF Core, `Data Source=acmecatalog.db` (created next to the running app).
Schema is created with `EnsureCreated()` and seeded on first run (catalog items +
`testuser`) — no formal EF Core migrations, a deliberate simplification since this app
doesn't need a migration history.

### Design system

Custom CSS-variable-driven theme (`wwwroot/css/site.css`) layered on vanilla Bootstrap
5.3.3 (bundled locally) — not a prebaked Bootswatch theme. Deep forest green
(`--brand-primary`) + terracotta accent (`--brand-accent`), warm off-white surfaces,
Sora for headings / Inter for body text (Google Fonts, degrades gracefully offline).
Bootstrap's own CSS variables (`--bs-primary`, `--bs-body-font-family`,
`--bs-border-radius`, etc.) are overridden at `:root` so buttons, badges, modals, and
focus rings all inherit the brand automatically. Verified responsive down to a 390px
mobile viewport (real device-metric emulation, not just a narrow desktop window).

### Running it

```bash
dotnet build AcmeCatalog.slnx
dotnet run --project src/AcmeCatalog.Web   # http://localhost:5274, Swagger at /swagger, health at /health
dotnet test tests/AcmeCatalog.Tests/AcmeCatalog.Tests.csproj --logger "trx;LogFileName=results.trx" --results-directory ./TestResults
```

#### One-command setup

`scripts/setup.sh` (macOS/Linux) and `scripts/setup.ps1` (Windows) automate the
above end to end: install the .NET SDK / Node if missing, build the solution,
run the NUnit suite, install the Cypress deps, start the app in the
background, and run the Cypress E2E suite against it. Both are safe to
re-run — they leave an existing `acmecatalog.db` in place (the app
creates/seeds it itself on first startup) and reuse port 5274.

```bash
# macOS/Linux
./scripts/setup.sh

# Windows (PowerShell)
./scripts/setup.ps1
```

When it finishes, the app stays running at http://localhost:5274 (demo login:
`testuser` / `Test123!`); the script prints the PID to stop it.

## Verification results

Everything below was confirmed against the **running app via real HTTP requests**
(curl with cookies/tokens, plus headless-Chrome rendering and CDP-driven interaction
for anything JS-dependent) — not just a code read-through.

**Pages render (200):** Home, Catalog, Item Details, Add Item, Edit Item, Help,
Privacy, Login, Register, Account/Profile, `/swagger`, `/health`, the standalone
`help-content.html` and `ImagePreview` iframes.

**Auth behavior:**
- Unauthenticated `GET /Items/Create`, `/Items/Edit/1`, `/Account/Profile` → `302` to `/Account/Login?ReturnUrl=...`
- Unauthenticated `POST /Items/Reorder` with the AJAX header → `401` (not a false-success)
- Unauthenticated `POST/PUT/DELETE /api/items` → `401` with a ProblemDetails body
- Login with wrong password (MVC and API) → error shown / `401` ProblemDetails
- Login with `testuser`/`Test123!` → success, redirects, JWT issued
- Registration (new account, password confirmation mismatch, successful signup + auto sign-in) → all correct
- Authenticated Create (with real file upload), Edit, Reorder, Delete via MVC → all succeed
- Authenticated `POST`/`PUT`/`DELETE /api/items` with a bearer token → `201`/`204`/`204`
- 404 on a missing item, 400 on invalid input → both ProblemDetails-shaped

**Every pre-existing interactive element — confirmed present (`data-testid` intact) and functional:**

| Element | Confirmed via |
|---|---|
| Quick View modal + nested iframe | CDP click → modal opens, name/price populate, iframe `src` loads `/Items/ImagePreview/{id}` |
| Confirm-delete modal | CDP click on a card's Delete button → modal opens with correct item name/id populated |
| Standalone Help-page iframe | `help-content.html` returns 200, `#help-frame` present |
| Category dropdown + live search | CDP: typed "headphones" → debounced fetch → 1 result, status text updated |
| Async Load More + spinner | `X-Has-More` header correct; button/spinner markup intact |
| Drag-and-drop reorder (persisted) | Direct API-order check before/after a `Reorder` POST — order actually changes in the DB, then restored |
| Drag-drop image upload + live preview | Real multipart file upload via curl → file saved, `ImageUrl` set correctly |
| Auto-dismissing toasts | `toast-host`/`server-toast-data` markup intact; toast JS unchanged |
| Details page tabs | CDP click on Specs tab → correct pane shown/hidden |
| Help page FAQ accordion | CDP click → target panel expands (`show` class) |
| Client + server validation | Empty/invalid Create submit → visible field errors; mismatched Register passwords → error shown |

Zero browser console errors across all pages tested.

**`dotnet test`: 16/16 passed**, TRX at `TestResults/results.trx`.

**Cleanup:** all test items/uploads created during verification were deleted; the
catalog is back to the original 10 seeded items in original order. Accounts created
during verification (`verifyuser`) were left in place — they're test users, not catalog
data, and don't affect the app's seeded state.

## Interactive element map for Cypress planning

Everything below has a `data-testid` attribute (or is a standard Bootstrap
component with a stable `id`) so selectors won't be a guessing game later. All
selectors are unchanged from Phase 1 unless noted.

### Catalog page (`/Items`)

| Element | Selector | Behavior |
|---|---|---|
| Search box | `[data-testid=search-input]` | As-you-type, 300ms debounce, AJAX fetch to `/Items/Filter`, no page reload |
| Category dropdown | `[data-testid=category-filter]` | `change` event triggers the same AJAX filter as search |
| Clear Filters button | `[data-testid=clear-filters-btn]` | Resets inputs, full page reload back to the paginated default view |
| Filter status text | `[data-testid=filter-status]` | Shows "`N` item(s) found" while a filter is active |
| Items grid container | `[data-testid=items-container]` | Swapped wholesale by filter, appended to by Load More |
| Item card | `[data-testid=item-card]` (repeated), `data-item-id` attribute | One per item; draggable; category badge is now color-coded per category |
| Drag handle | `[data-testid=drag-handle]` | Overlay badge on the card image; the whole card is draggable, not just the handle |
| Quick View button | `[data-testid=quick-view-btn]` per card | Opens the Quick View modal, AJAX-loads content |
| Details link | `[data-testid=details-link]` per card | Navigates to `/Items/Details/{id}` |
| Edit link | `[data-testid=edit-link]` per card | Navigates to `/Items/Edit/{id}` — redirects to Login if not signed in |
| Delete button | `[data-testid=delete-btn]` per card, `data-item-id`/`data-item-name` | Opens the confirm-delete modal; submit redirects to Login if not signed in |
| Load More button | `[data-testid=load-more-btn]` | AJAX-fetches next batch; hidden once exhausted or while a filter is active |
| Load More spinner | `[data-testid=load-more-spinner]` | Visible only during the fetch — good explicit-wait practice target |
| No-results message | `[data-testid=no-results]` | Shown when a filter matches nothing |
| Quick View modal | `#quickViewModal` (`[data-testid=quick-view-modal]`) | Bootstrap modal; body populated via AJAX |
| Quick View modal body | `[data-testid=quick-view-body]` | Contains name/category/price/description **and** a nested iframe |
| Quick View image iframe | `[data-testid=quick-view-image-frame]` | Iframe inside a modal — the trickiest Cypress combo in the app |
| Delete confirm modal | `#deleteConfirmModal` (`[data-testid=delete-modal]`) | Bootstrap modal, populated from the triggering button's `data-*` attrs |
| Delete item name | `[data-testid=delete-item-name]` | Shows the name of the item about to be deleted |
| Confirm delete button | `[data-testid=confirm-delete-btn]` | Submits a real POST form (not AJAX); requires login |
| Add Item nav button | `[data-testid=add-item-btn]` | Links to `/Items/Create`; requires login |

### Details page (`/Items/Details/{id}`)

| Element | Selector | Behavior |
|---|---|---|
| Description tab | `[data-testid=tab-description]` | Bootstrap tab, active by default |
| Specs tab | `[data-testid=tab-specs]` | Shows SKU, Category, Date Added, Catalog Position |
| Tab panels | `[data-testid=tab-panel-description]`, `[data-testid=tab-panel-specs]` | Only one visible at a time |

### Create / Edit forms (`/Items/Create`, `/Items/Edit/{id}`) — login required

| Element | Selector | Behavior |
|---|---|---|
| Form | `[data-testid=item-form]` | `enctype="multipart/form-data"`, `novalidate` (validation is JS-driven) |
| Validation summary | `[data-testid=validation-summary]` | Only rendered when there's a server-side error to show (ASP.NET Core tag helper behavior) |
| Name input | `[data-testid=name-input]` / error at `[data-testid=name-error]` | Required, max 100 chars |
| Price input | `[data-testid=price-input]` / error at `[data-testid=price-error]` | `type=number`, required, must be > 0 — both client (jQuery unobtrusive validation) and server (`[Range]`) enforce it |
| Category select | `[data-testid=category-input]` / error at `[data-testid=category-error]` | Required |
| Description textarea | `[data-testid=description-input]` / error at `[data-testid=description-error]` | Required, max 1000 chars |
| Image dropzone | `[data-testid=image-dropzone]` | Drag-and-drop **or** click-to-browse; shows a live thumbnail preview before submit |
| Image file input | `[data-testid=image-file-input]` | Native `<input type=file>` inside the dropzone |
| Image preview thumbnail | `[data-testid=image-preview]` | Hidden until a file is chosen/dropped |
| Image URL input | `[data-testid=image-url-input]` | Fallback to uploading — paste a URL instead |
| Submit button | `[data-testid=submit-btn]` | On success, redirects to `/Items` and shows a toast |

### Toast notifications

Shown after Create/Edit/Delete/Reorder succeed (or Reorder fails while logged out).
Bootstrap `.toast` component, auto-dismisses after 4 seconds, `role=alert`. Selector:
`[data-testid=toast-notification]` (created dynamically — only exists after a
triggering action). Reorder toasts appear without a page navigation; Create/Edit/Delete
toasts are carried across the redirect via `TempData`.

### Help page (`/Home/Help`)

| Element | Behavior |
|---|---|
| `#help-frame` iframe | Embeds the standalone static document `/help-content.html` |
| FAQ accordion (`#faq-accordion`) | Four Bootstrap accordion items (added one about accounts), first expanded by default |

### Auth pages (new in Phase 2)

| Element | Selector | Behavior |
|---|---|---|
| Nav login/register/account links | `[data-testid=login-nav-link]`, `[data-testid=register-nav-link]`, `[data-testid=account-nav-link]`, `[data-testid=logout-btn]` | Swap based on sign-in state |
| Login form | `[data-testid=login-form]`, inputs `login-username-input`/`login-password-input`/`login-remember-input`, `login-submit-btn`, errors `login-username-error`/`login-password-error`, summary `login-error-summary` | Server-side auth check; wrong credentials show the summary error |
| Register form | `[data-testid=register-form]`, inputs `register-username-input`/`register-email-input`/`register-password-input`/`register-confirm-password-input`, `register-submit-btn`, matching `-error` spans, summary `register-error-summary` | Client + server validation (required fields, email format, password match via `[Compare]`) |
| Profile page | `[data-testid=profile-card]`, `profile-username`, `profile-email`, `profile-logout-btn` | Login-required page showing the signed-in user |

## Future Phases (manual, by Ramish)

These are intentionally **not** started. Doing them by hand is the point.

1. **Git & GitHub setup** — `git init`, initial commit, create the GitHub repo, push.
2. **Cypress E2E + API tests** — drive the interactive elements mapped above, including the login flow (cookie) and `/api/auth/login` (JWT) as setup steps for protected-route tests.
3. **JMeter performance tests** — load-test `/api/items` (including an authenticated write scenario using a JWT) and the MVC catalog pages.
4. **GitHub Actions CI/CD** — pipeline that runs `dotnet test`, the Cypress suite, and (optionally) a JMeter smoke run on push/PR.
