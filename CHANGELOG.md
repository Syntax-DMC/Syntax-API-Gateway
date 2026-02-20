# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
