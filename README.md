# Syntax DM Gateway

Self-service API Gateway for **SAP Digital Manufacturing (DM)**. Provides a secure, multi-tenant proxy layer with built-in admin UI for managing SAP connections, API tokens, and request logs. Includes an **orchestration engine** that lets AI agents execute multiple SAP DM API calls in a single request, **use-case templates** ("recipes") for grouping API calls into named workflows, and an **export center** for generating OpenAPI specs and prompt specifications for agent integration.

## Features

- **SAP DM Proxy** — OAuth2 client_credentials flow with automatic token caching and retry on 401
- **AI Agent Proxy** — POST-only forwarding with encrypted API key storage
- **API Registry** — Import OpenAPI/Swagger specs (multi-file batch upload), manage API definitions with versioning and revert
- **Orchestration Engine** — Execute multiple SAP DM API calls in one request with dependency resolution
- **Use-Case Templates** — Named "recipes" grouping multiple API calls with context parameters, discoverable and executable via gateway
- **Export Center** — Generate OpenAPI 3.0/Swagger 2.0 specs, toolkit configs, use-case specs, and prompt specifications for agent integration
- **Connection Wizard** — Step-by-step guided connection setup with automatic URL, OAuth2, and agent endpoint validation
- **Multi-Tenancy** — tenant-scoped connections, tokens, and users with per-tenant roles
- **Admin UI** — React SPA with dashboard, connections, tokens, logs, explorer, registry, orchestration, use cases, and export
- **Security** — AES-256-GCM secret encryption, Helmet, CORS, rate limiting, token revocation
- **Request Logging** — async fire-and-forget with header redaction and body size cap (64 KB)

## Architecture

```
                      ┌──────────────────────────────────────┐
┌─────────────┐       │           Express Backend            │       ┌─────────────┐
│  Admin UI   │──JWT──│                                      │       │   SAP DM    │
│  (React)    │       │  /api/*       Admin API (JWT auth)   │──────▶│   (OAuth2)  │
└─────────────┘       │  /gw/dm/*     SAP proxy (API key)    │       └─────────────┘
                      │  /gw/agent/*  AI proxy (API key)     │
┌─────────────┐       │  /gw/query    Orchestrator (API key) │       ┌─────────────┐
│ AI Agent /  │─key──▶│                                      │──────▶│  AI Agent   │
│ POD Plugin  │       │  Orchestration Layer:                │       └─────────────┘
└─────────────┘       │  - API Registry + Assignments        │
                      │  - Dependency Resolution             │
                      │  - Parallel/Sequential Execution     │
                      │  - OpenAPI Export for Agents          │
                      └──────────────────┬───────────────────┘
                                         │
                                  ┌──────┴──────┐
                                  │ PostgreSQL  │
                                  └─────────────┘
```

### Two Auth Paths

| Path | Auth | Purpose |
|------|------|---------|
| `/api/*` | JWT (`Authorization: Bearer <token>`) | Admin UI endpoints |
| `/gw/*` | API Key (`x-api-key: sdmg_...`) | Gateway proxy |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, Express 4, TypeScript |
| Frontend | React 18, Vite 6, Tailwind CSS 3, React Router 7 |
| Database | PostgreSQL 15, pg driver |
| Encryption | AES-256-GCM (local) or AWS KMS |
| Container | Docker multi-stage, node:20-alpine |

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm

### 1. Clone & Install

```bash
git clone https://github.com/Syntax-DMC/Syntax-API-Gateway.git
cd Syntax-API-Gateway

cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Minimum 32 characters |
| `ENCRYPTION_KEY` | 64 hex characters (32 bytes) for AES-256 |
| `ADMIN_PASSWORD` | Initial admin password (first start only) |

### 3. Run Development Servers

```bash
# Terminal 1: Backend (port 3000)
cd backend && npm run dev

# Terminal 2: Frontend (port 5173, proxies to backend)
cd frontend && npm run dev
```

Open `http://localhost:5173` and log in with the admin credentials from `.env`.

## Docker

### Build & Run

```bash
# Build the multi-stage image
docker build -t syntax-dm-gateway .

# Start app + PostgreSQL
docker compose up -d

# Check logs
docker compose logs -f app
```

The app runs on port **3000**. Database migrations execute automatically on startup.

### Deploy to EC2

A one-step deploy script builds the image locally, transfers it to EC2, and restarts the containers:

```bash
bash scripts/deploy.sh
```

**Prerequisites on EC2:** Docker, docker compose, `.env` and `docker-compose.yml` in the home directory.

The script uses `key/gatewayPair.pem` for SSH access. EC2 host and user are configurable at the top of the script.

### docker-compose.yml

- `app` — Gateway image, depends on healthy DB
- `db` — PostgreSQL 15 Alpine, data persisted in `pgdata` volume

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── db/migrations/     # SQL migrations (001–011)
│   │   ├── middleware/         # auth, cors, rate-limit, token-auth, request-logger
│   │   ├── routes/            # Express routers (auth, connections, registry, orchestrator, export, ...)
│   │   ├── services/          # Business logic (proxy, crypto, registry, orchestrator, export, ...)
│   │   ├── types/index.ts     # Shared TypeScript interfaces
│   │   ├── config.ts          # Environment config
│   │   └── index.ts           # App entry point
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/client.ts      # Fetch client with JWT auto-refresh
│   │   ├── components/        # Layout, modals, stats cards
│   │   ├── hooks/             # useApi, useAuth, useTheme
│   │   ├── types/index.ts     # Frontend type definitions
│   │   └── pages/             # Dashboard, Connections, Tokens, Logs, Explorer,
│   │                          # Registry, Orchestration, Export Center, ...
│   └── package.json
├── scripts/
│   └── deploy.sh              # Build + deploy to EC2
├── key/                       # SSH keys (gitignored)
├── Dockerfile                 # Multi-stage build
├── docker-compose.yml
├── CHANGELOG.md               # Semantic versioning changelog
└── .env.example
```

## Database Migrations

Migrations run automatically on server start and are tracked in the `_migrations` table.

| # | Migration |
|---|-----------|
| 001 | Users table with bcrypt passwords |
| 002 | SAP connections (encrypted secrets) |
| 003 | API tokens with hash-based lookup |
| 004 | Request logs |
| 005 | Log body storage |
| 006 | API catalog |
| 007 | Multi-tenancy (tenants, user_tenants, tenant scoping) |
| 008 | API Registry (api_definitions, api_definition_versions) |
| 009 | Connection-API assignments |
| 010 | Export audit logs |
| 011 | Use-case templates |

## API Overview

### Admin API (`/api`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login (returns JWT) |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/switch-tenant` | Switch active tenant |
| GET/POST | `/api/connections` | CRUD SAP connections |
| GET/POST | `/api/tokens` | CRUD API tokens |
| GET | `/api/logs` | Request logs (filtered, paginated) |
| GET/POST | `/api/catalog` | API catalog entries |
| POST | `/api/explorer/:connectionId/*` | Test SAP endpoints |
| GET/POST | `/api/tenants` | Tenant management (superadmin) |
| GET/POST | `/api/users` | User management (admin) |
| GET/POST | `/api/registry` | API Registry CRUD, import, versioning |
| POST | `/api/registry/import` | Import OpenAPI/Swagger specs (single or batch) |
| DELETE | `/api/registry/all` | Delete all API definitions (admin only) |
| POST | `/api/registry/:id/test` | Test single API call |
| POST | `/api/orchestrator/execute` | Execute orchestrated query (admin) |
| POST | `/api/orchestrator/validate` | Validate query execution plan |
| GET | `/api/export` | List connections with export metadata |
| GET | `/api/export/connections/:id` | Download OpenAPI/Swagger spec |
| GET | `/api/export/connections/:id/preview` | Preview generated spec |
| GET | `/api/export/connections/:id/toolkit-config` | GenAI Studio toolkit config |
| GET | `/api/export/connections/:id/use-cases` | Download use-case OpenAPI spec |
| GET | `/api/export/connections/:id/prompt-spec` | Download prompt specification (markdown) |
| GET/POST | `/api/use-cases` | Use-case template CRUD |
| POST | `/api/use-cases/:id/validate` | Validate template slug references |
| POST | `/api/use-cases/:id/test` | Test template execution |
| POST | `/api/connections/test-url` | Pre-save URL reachability test |
| POST | `/api/connections/test-oauth` | Pre-save OAuth2 credential test |
| POST | `/api/connections/test-agent` | Pre-save agent endpoint test |
| POST | `/api/connections/:id/assign-apis` | Bulk assign APIs to connection |

### Gateway Proxy (`/gw`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/gw/health` | Health check |
| ALL | `/gw/dm/*` | SAP DM proxy (API key auth) |
| POST | `/gw/agent/*` | AI Agent proxy (API key auth) |
| POST | `/gw/query` | Orchestrated multi-API query (API key auth) |
| GET | `/gw/use-cases` | Discover available use-case templates (API key auth) |
| POST | `/gw/use-cases/:slug` | Execute use-case template (API key auth) |

### Orchestrated Query

Send a single request to execute multiple SAP DM API calls:

```bash
curl -X POST https://gateway/gw/query \
  -H "x-api-key: sdmg_..." \
  -H "Content-Type: application/json" \
  -d '{
    "calls": [
      { "slug": "sfc-detail", "params": { "plant": "1000", "sfc": "SFC-001" } },
      { "slug": "order-detail", "params": { "plant": "1000", "order": "ORD-5000" } }
    ],
    "mode": "parallel"
  }'
```

The gateway resolves dependencies, executes calls in parallel or sequential layers, and returns consolidated results.

### Use-Case Templates

Execute named "recipes" that group multiple API calls with context parameters:

```bash
curl -X POST https://gateway/gw/use-cases/shift-handover \
  -H "x-api-key: sdmg_..." \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "plant": "1000",
      "workcenter": "WC-001"
    }
  }'
```

Templates are configurable in the admin UI — define required context parameters and select which APIs to call using the same slug picker as the Orchestration Workbench.

### Export for Agent Integration

Generate OpenAPI specs describing gateway endpoints for AI agent discovery:

- **OpenAPI 3.0** (JSON/YAML) and **Swagger 2.0** (JSON)
- Includes `POST /gw/query` endpoint with all assigned API slugs and parameter schemas
- **Toolkit Config** JSON for GenAI Studio with gateway URL and API key header
- **Use-Case Spec** — OpenAPI 3.0 spec for use-case template discovery and execution endpoints
- **Prompt Spec** — Markdown document for AI agent system prompts with available use cases, parameters, and examples
- Configurable gateway URL and export scope

## Environment Variables

See [`.env.example`](.env.example) for all available variables with defaults.

## License

Proprietary. All rights reserved.
