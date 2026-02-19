# Syntax DM Gateway

Self-service API Gateway for **SAP Digital Manufacturing (DM)**. Provides a secure, multi-tenant proxy layer with built-in admin UI for managing SAP connections, API tokens, and request logs.

## Features

- **SAP DM Proxy** — OAuth2 client_credentials flow with automatic token caching and retry on 401
- **AI Agent Proxy** — POST-only forwarding with encrypted API key storage
- **Multi-Tenancy** — tenant-scoped connections, tokens, and users with per-tenant roles
- **Admin UI** — React SPA for managing connections, tokens, users, tenants, logs, and API explorer
- **Security** — AES-256-GCM secret encryption, Helmet, CORS, rate limiting, token revocation
- **Request Logging** — async fire-and-forget with header redaction and body size cap (64 KB)

## Architecture

```
┌─────────────┐       ┌──────────────────────────────────┐       ┌─────────────┐
│  Admin UI   │──JWT──│         Express Backend          │       │   SAP DM    │
│  (React)    │       │                                  │──────▶│   (OAuth2)  │
└─────────────┘       │  /api/*  Admin API (JWT auth)    │       └─────────────┘
                      │  /gw/dm/* SAP proxy (API key)    │
┌─────────────┐       │  /gw/agent/* AI proxy (API key)  │       ┌─────────────┐
│ API Clients │─key──▶│                                  │──────▶│  AI Agent   │
└─────────────┘       └──────────────┬───────────────────┘       └─────────────┘
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

### docker-compose.yml

- `app` — Gateway image, depends on healthy DB
- `db` — PostgreSQL 15 Alpine, data persisted in `pgdata` volume

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── db/migrations/     # SQL migrations (001–007)
│   │   ├── middleware/         # auth, cors, rate-limit, token-auth, request-logger
│   │   ├── routes/            # Express routers (auth, connections, tokens, proxy, ...)
│   │   ├── services/          # Business logic (proxy, crypto, sap-token, ...)
│   │   ├── config.ts          # Environment config
│   │   └── index.ts           # App entry point
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/client.ts      # Fetch client with JWT auto-refresh
│   │   ├── components/        # Layout, modals, stats cards
│   │   ├── hooks/             # useApi, useAuth, useTheme
│   │   └── pages/             # Dashboard, Connections, Tokens, Logs, Explorer, ...
│   └── package.json
├── Dockerfile                 # Multi-stage build
├── docker-compose.yml
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

### Gateway Proxy (`/gw`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/gw/health` | Health check |
| ALL | `/gw/dm/*` | SAP DM proxy (API key auth) |
| POST | `/gw/agent/*` | AI Agent proxy (API key auth) |

## Environment Variables

See [`.env.example`](.env.example) for all available variables with defaults.

## License

Proprietary. All rights reserved.
