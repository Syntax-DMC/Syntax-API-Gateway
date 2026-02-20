# Backend — CLAUDE.md

Express + TypeScript backend for the Syntax API Gateway.

## Commands
```bash
npm run dev          # tsx watch (port 3000)
npm run build        # tsc → dist/
npm start            # node dist/index.js
npm run migrate      # Run DB migrations only
npm test             # vitest run
npm run test:watch   # vitest (watch mode)
```

## Project Structure
```
src/
├── index.ts                    # App entry: middleware, route mounting, SPA fallback, startup
├── config.ts                   # Env var loading (.env at project root, two levels up)
├── types/index.ts              # Shared TypeScript interfaces (AuthenticatedRequest, etc.)
├── db/
│   ├── pool.ts                 # pg Pool (max 20 connections)
│   ├── migrate.ts              # Migration runner (auto on startup)
│   └── migrations/             # SQL files 001–012, tracked in _migrations table
├── middleware/
│   ├── auth.ts                 # JWT middleware: authMiddleware, requireActiveTenant, requireTenantAdmin, requireSuperadmin
│   ├── token-auth.ts           # API key middleware: validates sdmg_ tokens via hash lookup
│   ├── cors.ts                 # CORS config (reads ALLOWED_ORIGINS from env)
│   ├── rate-limit.ts           # express-rate-limit: loginLimiter, proxyLimiter, apiLimiter
│   └── request-logger.ts       # Fire-and-forget async log writes (header redaction, 64KB body cap)
├── routes/
│   ├── auth.routes.ts          # /api/auth — login, refresh, switch-tenant
│   ├── connections.routes.ts   # /api/connections — CRUD + pre-save tests + assignments
│   ├── tokens.routes.ts        # /api/tokens — CRUD
│   ├── registry.routes.ts      # /api/registry — import, CRUD, versioning, backfill
│   ├── orchestrator-admin.routes.ts  # /api/orchestrator — auto-resolve-preview only
│   ├── export.routes.ts        # /api/export — OpenAPI spec + toolkit config generation
│   ├── explorer.routes.ts      # /api/explorer — SAP endpoint testing via admin JWT
│   ├── catalog.routes.ts       # /api/catalog — saved request CRUD
│   ├── logs.routes.ts          # /api/logs — request log queries
│   ├── tenants.routes.ts       # /api/tenants — tenant management (superadmin)
│   ├── users.routes.ts         # /api/users — user management (admin)
│   ├── proxy-dm.routes.ts      # /gw/dm/* — SAP DM proxy (API key auth)
│   ├── proxy-agent.routes.ts   # /gw/agent/* — AI Agent proxy (API key auth)
│   └── orchestrator.routes.ts  # /gw/query — orchestrated multi-API query (API key auth)
├── services/
│   ├── proxy.service.ts        # SAP DM + Agent proxy: native http/https streaming, header stripping
│   ├── sap-token.service.ts    # OAuth2 client_credentials flow, in-memory cache, 120s expiry buffer
│   ├── crypto.service.ts       # AES-256-GCM encryption (local) or AWS KMS
│   ├── connection.service.ts   # Connection CRUD (encrypts secrets at rest)
│   ├── api-token.service.ts    # Token CRUD (SHA-256 hash storage, sdmg_ prefix)
│   ├── auth.service.ts         # JWT issuance, refresh, bcryptjs password hashing
│   ├── registry.service.ts     # API definition CRUD + versioning
│   ├── openapi-parser.service.ts  # OpenAPI/Swagger import, $ref resolution, slug generation
│   ├── assignment.service.ts   # Connection-API assignments (bulk assign, replace)
│   ├── orchestrator.service.ts # Multi-API execution: parallel/sequential layers, dependency resolution
│   ├── auto-resolver.service.ts # Auto-resolve parameter dependencies between APIs
│   ├── export.service.ts       # OpenAPI 3.0/Swagger 2.0 spec + toolkit config generation
│   ├── explorer.service.ts     # Admin SAP endpoint testing
│   ├── catalog.service.ts      # Saved request CRUD
│   ├── log.service.ts          # Request log queries (filtered, paginated)
│   ├── tenant.service.ts       # Tenant CRUD
│   ├── user.service.ts         # User CRUD + tenant membership
│   └── token-revocation.service.ts  # Token revocation
└── utils/
    └── url-validator.ts        # SSRF protection: DNS validation for user-supplied URLs
```

## Key Patterns

### Authentication
- **JWT** (`/api/*`): `authMiddleware` decodes token, attaches `req.user` with `userId`, `activeTenantId`, `isSuperadmin`. Guards: `requireActiveTenant`, `requireTenantAdmin`, `requireSuperadmin`.
- **API Key** (`/gw/*`): `tokenAuthMiddleware` hashes the `x-api-key` header, JOINs `api_tokens` + `sap_connections`, attaches `req.apiToken` and `req.sapConnection`.

### Service Pattern
All services are singleton class instances exported as `const fooService = new FooService()`. They use `pool.query()` directly (no ORM).

### Error Handling
Routes catch errors and return `{ error: string }` with appropriate HTTP status codes. Services throw `Error` with descriptive messages. No global error handler — each route handles its own errors.

### Multi-Tenancy
All data queries are scoped by `tenant_id`. The active tenant comes from the JWT payload (`activeTenantId`). Users can belong to multiple tenants with different roles.

## Gotchas
- Express v4 but `@types/express` v5 — cast `req.params.id as string` (it's `string | string[]` in v5 types)
- `jwt.sign` options: cast `as SignOptions` for TypeScript compatibility
- Use `bcryptjs` (not `bcrypt`) — native bcrypt segfaults on Alpine
- `ENCRYPTION_KEY` must be 64 hex chars (32 bytes for AES-256)
- API tokens hashed with SHA-256 (one-way) — plaintext only available at creation time
- Migrations copied to `dist/db/migrations/` in Dockerfile for production
- `.env` loaded from project root (two levels up from `src/`): `path.resolve(__dirname, '../../.env')`
- OpenAPI parser uses `circular: 'ignore'` to handle circular `$ref` references
- SSRF protection: all user-supplied URLs validated via `validateUpstreamUrlDns()` before use
