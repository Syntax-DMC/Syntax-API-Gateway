# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.15.0] - 2026-02-20

### Added

- **Auto-discovery of intermediate APIs** — The orchestrator now automatically pulls in APIs needed to bridge dependency gaps. If API C needs `bom` from API B, and API B needs `material` from API A, selecting only A + C will auto-include B as an intermediate. Iterates up to 5 rounds to resolve transitive chains.

### Fixed

- **Orchestrator: fix array path extraction for dependency injection** — `extractByDotPath` now handles `[]` notation (empty brackets = first array element) from response_fields paths like `value[].material`. Previously only `[0]` worked, breaking automatic dependency resolution between APIs (e.g., SFC Details → Material Details).
- **Orchestrator: restrict auto-resolve to context_var params only** — Generic field names like `version`, `type`, `size` created false dependencies between APIs and circular dependency cycles. Now only known SAP DM context params (`plant`, `sfc`, `material`, `order`, `bom`, etc. — those with `context_var` set) are auto-resolved. Generic params are left for the user to fill in.

### Changed

- **Agent Emulator: hide auto-resolved parameters** — Parameters that are automatically provided by another selected API's response (e.g., `material` from SFC Details) are no longer shown as input fields. Instead, they appear as purple "auto-resolved" badges showing the source API, so the user knows the orchestrator will handle the injection.

## [1.14.3] - 2026-02-20

### Added

- **Agent Emulator: Agent Call panel** — After testing, shows the equivalent cURL commands an agent would use. Toggle between Orchestrator (`POST /gw/query`) and direct per-API calls (`/gw/dm/...`). Copy button for easy sharing.

### Changed

- **Agent Emulator: split context vs API-specific parameters** — Context parameters (plant, sfc, workcenter, etc.) are shown in a compact inline grid at the top with preset save/load. API-specific parameters (like `includeSfcSteps`) are shown as detailed cards with description, type, and required badge below.

## [1.14.2] - 2026-02-20

### Fixed

- **OpenAPI import: prepend server base path** — Paths from OpenAPI specs now include the base path from the server URL (e.g., `/sfc/v2/sfcdetail` instead of just `/sfcdetail`). Fixes 404 errors when calling SAP DM APIs through the orchestrator. Existing specs must be re-imported.

## [1.14.1] - 2026-02-20

### Changed

- **Agent Emulator: dynamic parameters** — Replaced fixed Plant/SFC/Workcenter/Resource fields with dynamic parameters extracted from selected API definitions (matching the Connection Wizard pattern)
  - Parameters show name, type, description, required badge, and API count
  - Presets now store arbitrary parameter key-value pairs
- Removed redundant request parameter display from response cards (request path is shown instead)
- Updated emulator i18n keys in all 4 locales (EN/DE/ES/FR)

## [1.14.0] - 2026-02-20

### Added

- **Full i18n support** — All frontend strings translated into English, German, Spanish, and French (~370 keys per locale)
- Custom lightweight i18n framework with `useI18n()` hook, type-safe dot-notation keys, and `{variable}` interpolation
- Language auto-detection from browser settings (`navigator.language`), persisted in localStorage
- Language switcher dropdown in the header (EN/DE/ES/FR)
- Non-English locales lazy-loaded (~16 KB per chunk) to keep initial bundle small
- Locale-aware date/number formatting via `toLocaleString(locale)`

### Changed

- **Agent Emulator redesigned** — Simplified guided workflow replacing the old two-mode (Orchestrated/Direct) interface
  - Select a connection (auto-authenticated via JWT, no API key needed)
  - Fill in SAP DM namespace fields: Plant, SFC, Workcenter, Resource
  - Select data types from connection's assigned API definitions (card grid)
  - Click Test to execute via the orchestrator — per-slug collapsible response cards with status, duration, body, and injected parameters
- New backend endpoint `POST /api/emulator/execute` (JWT auth) calls `orchestratorService.executeAutoResolved()` directly
- Namespace presets: save/load Plant, SFC, Workcenter, Resource values to localStorage

## [1.12.0] - 2026-02-20

### Fixed

- **N+1 query in assignment service** — Bulk assign and replace operations now use a single multi-row INSERT instead of per-item queries
- **N+1 query in auto-resolver** — Slug lookup uses a single `WHERE slug = ANY($1)` query instead of fetching definitions one by one
- **Silent error swallowing in token-auth** — Fire-and-forget token usage updates now log errors instead of silently discarding them
- **Missing transaction in tenant deactivation** — Cascade deactivation of tenant, users, connections, and tokens is now wrapped in a database transaction with rollback on failure
- **Unbounded SAP token cache** — Token cache is now bounded to 500 entries with LRU-style eviction and periodic expired entry cleanup (10-min interval)
- **Mixed German/English UI strings** — Dashboard buttons and confirmations are now consistently in English

## [1.11.0] - 2026-02-20

### Added

- **Agent Emulator** — New page under Tools for testing gateway endpoints as an AI agent. Paste an API key and send real requests through the gateway proxy
- Two modes: **Orchestrated Query** (`POST /gw/query` with slugs + context) and **Direct SAP Call** (`/gw/dm/*` with any HTTP method)
- Sidebar slug picker loads assigned APIs from selected connection for easy selection
- Context parameter editor with required param hints from API definitions
- Full response display with status, headers, body (JSON-formatted), and duration
- **cURL tab** — generates a copyable curl command from the current request
- Manual slug input for testing without a connection selected
- Ctrl+Enter keyboard shortcut to send

## [1.10.0] - 2026-02-20

### Removed

- **Orchestration Workbench** — Removed the admin Orchestration page and sidebar entry. The gateway orchestrator (`POST /gw/query`) and auto-resolve preview (used by the Connection Wizard Flow Designer) remain fully functional
- Removed admin `POST /api/orchestrator/execute` and `POST /api/orchestrator/validate` endpoints (only used by the workbench UI)
- Removed unused frontend types (`OrchestratorCallResult`, `OrchestratorResult`)

## [1.9.0] - 2026-02-20

### Added

- **Edit Connection via Wizard** — Clicking "Edit" on a connection now opens the same 6-step wizard (pre-filled with existing data) instead of the flat edit modal. Supports updating credentials, reassigning APIs, reviewing the flow graph, and regenerating output
- `GET /api/connections/:id/assignments` — Returns assigned API definition IDs for a connection
- `POST /api/connections/:id/replace-apis` — Replace all API assignments for a connection (used in edit mode)
- **Rich API List in Wizard** — Step 3 now shows multi-line cards with slug, description, endpoint path, and parameter tags (required params highlighted in amber)

### Changed

- **Login Page** — Title changed to "Syntax API Gateway", logo centered and sized to match heading width

### Removed

- Old flat edit modal replaced by wizard edit mode

## [1.8.1] - 2026-02-20

### Fixed

- **Gateway URL in Toolkit Output** — `base_url` in Tools JSON, Prompt Spec, and Export Center Toolkit Config now correctly includes `/gw/dm` prefix (e.g. `https://gateway.example.com/gw/dm`) so that `base_url + path` resolves to the correct gateway proxy endpoint

## [1.8.0] - 2026-02-20

### Added

- **Auto-Resolving API Dependencies** — Gateway automatically resolves parameter dependencies between APIs by matching response field leaf names to query parameters. New `POST /gw/query { slugs, context }` format alongside existing `calls[]` format (backward compatible)
- **Flow Designer (Wizard Step 4)** — Visual dependency graph in the Connection Wizard showing execution layers, color-coded parameter sources (green=context, blue=auto-injected, red=unresolved), and SVG connector lines between APIs
- **Response Fields Parser** — OpenAPI response schemas are flattened into `response_fields` at import time, enabling auto-dependency resolution. Existing definitions can be backfilled via `POST /api/registry/backfill-response-fields`
- **Auto-Resolve Preview** — `POST /api/orchestrator/auto-resolve-preview` endpoint for the Flow Designer to preview dependency resolution before execution
- **Logo Support** — Header and login page now use image files (`/logo.svg`, `/login_logo.svg`) from `frontend/public/` instead of inline SVG icons
- Database migration 012 for `response_fields` JSONB column on `api_definitions`

### Changed

- **Connection Wizard** — Expanded from 5 to 6 steps: Connection → API Key → APIs (with method filter) → Flow Designer → Parameters → Output
- **Export Center** — Simplified from 4 tabs to 2 (OpenAPI Spec + Toolkit Config)

### Removed

- **Use-Case Templates** — Removed in favor of the auto-resolver which handles dependency resolution dynamically. Deleted pages, services, routes, and types
- **Use-Case Spec / Prompt Spec** export tabs and endpoints
- **Orchestration output tab** from wizard Step 6

## [1.7.0] - 2026-02-20

### Changed

- **Sidebar Navigation** — Reorganized flat nav list (11+ items) into collapsible groups: Setup, APIs, Tools, Admin. Group expand/collapse state persists in localStorage. Collapsed groups show a blue dot indicator when a child route is active
- **Connection Wizard** — Replaced 4-step wizard with a unified 5-step onboarding flow: SAP Connection (URL + OAuth2 test + create) → API Key (generate + copy) → API Selection (searchable checklist with bulk assign) → Parameters (set defaults for plant, workcenter, etc.) → Output (Tools JSON + Prompt Spec generated client-side)

### Added

- `POST /api/connections/:id/assign-apis` — Bulk assign multiple API definitions to a connection in one request
- Wizard Step 5 generates toolkit JSON and prompt specification directly from selected APIs and parameter defaults, no Export Center visit needed

## [1.6.0] - 2026-02-20

### Added

- **Use-Case Templates** — Higher-level "recipe" abstraction that groups multiple API calls into named templates (e.g. shift handover, downtime report). Templates define required context parameters and API call sequences with `{{variable}}` template resolution
- Admin CRUD UI for use-case templates with 4-tab editor: Overview, Context Parameters, API Calls builder (same slug picker as Orchestration Workbench), and Test execution
- Gateway discovery endpoint `GET /gw/use-cases` for AI agents to list available templates
- Gateway execution endpoint `POST /gw/use-cases/:slug` to run a template with context parameters
- Template validation (dry-run slug existence check) and admin test execution
- **Connection Creation Wizard** — 4-step guided flow (Basic Info → OAuth2 → Agent Config → Review) with automatic validation after each step
- Pre-save test endpoints: `POST /api/connections/test-url`, `test-oauth`, `test-agent` for real connectivity and credential checks before saving
- Fixed `POST /api/connections/:id/test` stub to actually test OAuth2 token fetch
- **Export Center: Use-Case Spec** — OpenAPI 3.0 spec for use-case template endpoints (discovery + per-template execution paths)
- **Export Center: Prompt Spec** — Markdown specification for AI agent system prompts describing available use cases, parameters, and example requests
- Export Center now has 4 tabs: OpenAPI Spec, Toolkit Config, Use-Case Spec, Prompt Spec
- Database migration 011 for `use_case_templates` table with JSONB fields for context params and API calls

## [1.5.0] - 2026-02-20

### Added

- **Delete All APIs** — Admin-only button in the API Registry to delete all API definitions for the current tenant in one click
- Backend `DELETE /api/registry/all` endpoint with `requireTenantAdmin` guard
- Frontend shows red "Delete All" button only for admins when definitions exist, with confirmation dialog

## [1.4.1] - 2026-02-20

### Fixed

- **OpenAPI Import Circular Reference Fix** — Specs with circular `$ref` references (e.g. recursive schemas) no longer cause 500 Internal Server Error
- `SwaggerParser.dereference()` now uses `circular: 'ignore'` mode
- Response/request schemas are sanitized with `stripCircular()` before JSON serialization

## [1.4.0] - 2026-02-20

### Added

- **Deploy Script** — `scripts/deploy.sh` for building, transferring, and deploying the Docker image to EC2 in one step (build, save, scp, load, restart)
- **GitHub Actions CI/CD** — Automated deploy to EC2 on push to main

### Fixed

- **Batch Import (Rate Limit Fix)** — Multi-file OpenAPI import now sends all specs in a single HTTP request instead of one per file, eliminating rate limit errors when importing many specs at once
- Backend `/api/registry/import` accepts `specs[]` array for batch processing with per-file error isolation
- Single-spec import (`spec` field) remains backward compatible

## [1.3.0] - 2026-02-20

### Added

- **Version Display** — App version number shown in the sidebar footer, auto-read from package.json via Vite define

### Improved

- **Drag-and-Drop File Upload** — Replaced plain file input in API Registry import with a styled drop zone supporting drag-and-drop and click-to-browse, with clear multi-file messaging

## [1.2.0] - 2026-02-20

### Added

- **Multi-File Import** — Upload multiple OpenAPI/Swagger spec files at once in the API Registry import dialog
  - Queued file list with per-file remove button
  - Sequential processing with progress indicator
  - Aggregated results view showing created/skipped/errors per spec and totals

### Fixed

- **Slug Collisions on Import** — API definition slugs now include the spec title as prefix (e.g. `sfc-api-get-sfc-details` instead of `get-sfc-details`), preventing duplicate slug errors when importing multiple specs with similar endpoints

## [1.1.0] - 2026-02-20

### Added

- **Export Center** – New admin page for exporting OpenAPI specs and toolkit configs for agent integration
- **Export Service** (`backend/src/services/export.service.ts`) – Generates OpenAPI 3.0 (JSON/YAML) and Swagger 2.0 specs describing gateway endpoints per connection
- **Export Routes** (`/api/export`) – Endpoints for listing connections with export metadata, generating spec downloads/previews, and toolkit config generation
- **Toolkit Config Generator** – Produces GenAI Studio compatible JSON config with gateway URL, API key header, and API descriptions
- **Export Audit Logging** – `export_logs` table (migration 010) tracks all spec exports with format, scope, and API count
- **Export Center UI** (`frontend/src/pages/ExportCenterPage.tsx`) – Connection table with export modal featuring format/scope selection, gateway URL input, live spec preview, copy-to-clipboard, and download
- Navigation item "Export" in sidebar

### Details

The export feature enables AI agents (e.g. GenAI Studio) to discover and use gateway APIs by generating OpenAPI specs that describe the `POST /gw/query` orchestration endpoint with all assigned API slugs, parameters, and response schemas.

**Supported formats:** OpenAPI 3.0 JSON, OpenAPI 3.0 YAML, Swagger 2.0 JSON
**Supported scopes:** All (query endpoint + schemas), Assigned only (schemas only)

## [1.0.0] - 2025-02-19

### Added

- Initial release of Syntax API Gateway
- JWT authentication for admin UI (`/api/*`)
- API key authentication for gateway proxy (`/gw/*`)
- SAP DM proxy with OAuth2 client credentials flow and token caching
- AI Agent proxy with encrypted API key management
- Connection management (CRUD) with AES-256-GCM secret encryption
- API token management with `sdmg_` prefix tokens
- Request logging with header redaction and body size cap (64 KB)
- Rate limiting (login: 5/min/IP, proxy: 100/min/token, API: 120/min/user)
- Multi-tenant support with tenant switching
- React admin UI with dark mode
- Docker multi-stage build
- PostgreSQL migrations (001-005)

## [1.0.1] - 2025-02-19

### Added

- API Registry with OpenAPI import (JSON/YAML), CRUD, versioning, and revert
- Connection-API assignments with bulk assign
- Orchestration engine with parallel/sequential execution modes
- Dependency resolution via topological sort (Kahn's algorithm)
- Field mapping and context injection from previous API responses
- Orchestration test workbench UI with validation and execution plan visualization
- PostgreSQL migrations (006-009)
