# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

### Backend (Express + TypeScript)
```bash
cd backend && npm run dev          # Dev server with tsx watch (port 3000)
cd backend && npm run build        # Compile TypeScript → dist/
cd backend && npm start            # Run compiled dist/index.js
cd backend && npm run migrate      # Run DB migrations only
cd backend && npm test             # Run tests (vitest)
```

### Frontend (React + Vite)
```bash
cd frontend && npm run dev         # Vite dev server (port 5173, proxies /api and /gw to :3000)
cd frontend && npm run build       # TypeScript check + Vite production build
```

### Docker
```bash
docker build -t syntax-dm-gateway .    # Multi-stage build (frontend→backend→prod)
docker compose up -d                   # Requires pre-built image + .env file at project root
docker compose logs -f app             # Follow app logs
```

Note: `docker compose` uses `image: syntax-dm-gateway:latest` (not `build:`), so you must `docker build` first. DB port is not exposed externally.

### Deploy
When the user says "deploy", follow `.claude/commands/deploy.md` exactly:
1. Determine version bump (PATCH for fixes, MINOR for features)
2. Bump version in both `backend/package.json` and `frontend/package.json`
3. Update `CHANGELOG.md` (Keep a Changelog format, current date)
4. Update `README.md` if features/endpoints/structure changed
5. Build check both projects
6. Commit with message `v{version}: {short summary}`
7. `git push` to trigger GitHub Actions deploy

### Environment
Config is loaded by `backend/src/config.ts` from a `.env` file at the project root (two levels up from `src/`). Required vars: `DATABASE_URL`, `JWT_SECRET`. See `config.ts` for all env vars with defaults.

## Architecture

### Two Authentication Paths
- **JWT auth** (`/api/*`): Admin UI endpoints. `Authorization: Bearer <token>` header. Access tokens (15m) + refresh tokens (7d). Middleware: `backend/src/middleware/auth.ts`.
- **API key auth** (`/gw/*`): Gateway proxy endpoints. `x-api-key` header with `sdmg_` prefix (45 chars). Single JOIN query validates token+connection. Middleware: `backend/src/middleware/token-auth.ts`.

### Route Groups
```
/api/auth/*           Auth (login, refresh, switch-tenant)
/api/connections/*    SAP connection CRUD + pre-save tests + API assignments
/api/tokens/*         API token CRUD
/api/registry/*       API Registry (import, CRUD, versioning)
/api/orchestrator/*   Auto-resolve preview (for wizard Flow Designer)
/api/export/*         OpenAPI spec + toolkit config generation
/api/logs/*           Request log queries
/api/explorer/*       SAP endpoint testing (admin)
/api/catalog/*        Saved API requests
/api/tenants/*        Tenant management (superadmin)
/api/users/*          User management (admin)

/gw/health            Health check (no auth)
/gw/dm/*              SAP DM proxy (API key auth)
/gw/agent/*           AI Agent proxy (API key auth)
/gw/query             Orchestrated multi-API query (API key auth)
```

### Proxy Engine
Two proxy targets, both using native Node.js http/https streaming (no axios, no body buffering):
- **SAP DM** (`/gw/dm/*`): OAuth2 client_credentials flow, in-memory token cache with 120s expiry buffer, auto-retry once on 401 with fresh token.
- **AI Agent** (`/gw/agent/*`): Decrypts agent API key on-demand, POST-only.

Proxy logic in `backend/src/services/proxy.service.ts` strips hop-by-hop and secret headers before forwarding.

### Frontend Pages
```
/                  Dashboard
/connections       Connection management + 6-step wizard (create/edit)
/tokens            API token management
/logs              Request logs (filtered, paginated)
/explorer          SAP endpoint testing
/registry          API Registry (import OpenAPI specs)
/registry/:id      API definition detail + versioning
/emulator          Agent Emulator (test gateway as an AI agent)
/export            Export Center (OpenAPI specs + toolkit configs)
/users             User management (admin)
/tenants           Tenant management (superadmin)
```

### Frontend State
- JWT stored in module-level variables (not localStorage) — see `frontend/src/api/client.ts`
- `useApi<T>` hook (`frontend/src/hooks/useApi.ts`) handles fetch + optional polling + auto-retry on 401
- Auth context via React Context (`frontend/src/hooks/useAuth.ts`), not Redux
- Agent Emulator uses native `fetch()` directly (not `api()` client) because it sends `x-api-key` instead of JWT

### Body Parsing
- `/api/*` routes: `express.json()` + `express.urlencoded()` (standard form/JSON parsing)
- `/gw/*` routes: `express.json()` only (proxy re-serializes if needed)

### Database
- PostgreSQL 15 with `pg` driver, connection pool (max 20)
- Migrations: SQL files in `backend/src/db/migrations/` (001–012), auto-run on startup, tracked in `_migrations` table
- Secrets (client_secret, agent_api_key) encrypted with AES-256-GCM at rest via `CryptoService`

### Request Logging
Fire-and-forget async DB writes — never blocks the proxy response. Redacts authorization, x-api-key, cookie headers. Body size capped at 64 KB.

## Key Gotchas
- Use `bcryptjs` (not `bcrypt`) — native bcrypt segfaults on Alpine (exit 139)
- `ENCRYPTION_KEY` must be 64 hex chars (32 bytes), not 32 chars
- Express is v4 (`^4.21.2`) but `@types/express` is v5 — this causes `req.params.id` to be `string | string[]`, cast with `as string`
- `jwt.sign` options: cast `as SignOptions` for expiresIn string compatibility
- Rate limits are in-memory (express-rate-limit): login=5/min/IP, proxy=100/min/token, api=120/min/user
- Dockerfile copies `backend/src/db/migrations/*.sql` to `dist/db/migrations/` for production
- Frontend Vite config proxies `/api` and `/gw` to localhost:3000 in dev; in production the backend serves static files from `../public`
- SPA fallback in `index.ts`: all non-`/api/` and non-`/gw/` GET requests serve `index.html`
- API tokens are hashed (SHA-256, one-way) — plaintext is only available at creation time
- Gateway URL for toolkit output must include `/gw/dm` prefix (base_url + path must resolve correctly)
- Version is injected into frontend via Vite `define: { __APP_VERSION__ }` from `package.json`
