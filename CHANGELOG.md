# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
