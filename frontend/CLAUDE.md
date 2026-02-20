# Frontend — CLAUDE.md

React 18 + Vite + Tailwind CSS admin UI for the Syntax API Gateway.

## Commands
```bash
npm run dev          # Vite dev server (port 5173)
npm run build        # tsc -b && vite build (TypeScript check + production build)
npm run preview      # Preview production build locally
```

## Project Structure
```
src/
├── main.tsx                    # React root mount
├── App.tsx                     # BrowserRouter + route definitions + auth provider
├── globals.d.ts                # Global type declarations (__APP_VERSION__)
├── api/
│   └── client.ts               # Fetch client: JWT auto-refresh, api<T>() function, ApiError class
├── hooks/
│   ├── useAuth.ts              # Auth context: login, logout, switchTenant, memberships, tokens
│   ├── useApi.ts               # useApi<T> hook: fetch + optional polling + auto-retry on 401
│   └── useTheme.ts             # Dark/light mode toggle (localStorage persistence)
├── components/
│   ├── Layout.tsx              # App shell: header, collapsible sidebar (NavGroups), Outlet
│   ├── ProtectedRoute.tsx      # Auth guards: ProtectedRoute, RequireAdmin, RequireSuperadmin
│   ├── LogDetailModal.tsx      # Request log detail modal
│   └── StatsCards.tsx          # Dashboard stat card components
├── pages/
│   ├── LoginPage.tsx           # Login form (unauthenticated route)
│   ├── DashboardPage.tsx       # Dashboard with stats
│   ├── ConnectionsPage.tsx     # Connection CRUD + 6-step wizard (create/edit mode)
│   ├── TokensPage.tsx          # API token CRUD
│   ├── LogsPage.tsx            # Request logs (filtered, paginated)
│   ├── ExplorerPage.tsx        # SAP endpoint testing (admin JWT, direct SAP call)
│   ├── RegistryPage.tsx        # API Registry list + OpenAPI import (drag-and-drop)
│   ├── RegistryDetailPage.tsx  # API definition detail + version history
│   ├── AgentEmulatorPage.tsx   # Agent Emulator (test gateway with API key, native fetch)
│   ├── ExportCenterPage.tsx    # Export OpenAPI specs + toolkit configs
│   ├── UsersPage.tsx           # User management (admin)
│   └── TenantsPage.tsx         # Tenant management (superadmin)
└── types/
    └── index.ts                # All TypeScript interfaces (SapConnection, ApiDefinition, etc.)
```

## Key Patterns

### API Client (`api/client.ts`)
- Module-level variables for JWT tokens (not localStorage)
- `api<T>(path, method?, body?)` — generic fetch with auto JWT injection
- Auto-refresh on 401: tries refresh token, retries request, then calls `onAuthExpired`
- `ApiError` class with `.status` for structured error handling

### Agent Emulator (`pages/AgentEmulatorPage.tsx`)
- Uses native `fetch()` instead of `api()` because it sends `x-api-key` (not JWT)
- Requests go to real gateway endpoints (`/gw/query`, `/gw/dm/*`)
- Vite proxy forwards `/gw/*` to localhost:3000 in dev; same-origin in production

### useApi Hook (`hooks/useApi.ts`)
```typescript
const { data, loading, error, reload } = useApi<T[]>('/api/endpoint', pollingInterval?);
```
- Auto-fetches on mount
- Optional polling (pass interval in ms)
- Auto-retries on 401 via client.ts

### Connection Wizard (`pages/ConnectionsPage.tsx`)
6-step wizard used for both create and edit:
1. SAP Connection (URL + OAuth2 test) → POST or PATCH
2. API Key (generate token)
3. API Selection (searchable checklist, assign/replace)
4. Flow Designer (auto-resolve dependency graph)
5. Parameters (set defaults)
6. Output (Tools JSON + Prompt Spec)

State: `wizardMode: 'create' | 'edit'` determines behavior differences.

### Sidebar Navigation (`components/Layout.tsx`)
- Collapsible groups: Setup, APIs, Tools, Admin
- Group expand/collapse persisted in localStorage (`sidebar-groups`)
- Blue dot indicator for collapsed groups with active child route
- Version display from `__APP_VERSION__` (injected by Vite from package.json)

### Styling
- Tailwind CSS 3 with dark mode (`dark:` prefix classes)
- No component library — all UI built with Tailwind utility classes
- Dark mode toggled via `useTheme` hook (adds/removes `dark` class on `<html>`)
- Common patterns: `bg-white dark:bg-gray-800`, `text-gray-900 dark:text-white`

## Gotchas
- `__APP_VERSION__` is a Vite-injected global (defined in `vite.config.ts`), declared in `globals.d.ts`
- Vite proxy config: `/api` and `/gw` both proxy to `http://localhost:3000` in dev
- In production, backend serves frontend static files from `../public` — no proxy needed
- `noUnusedLocals` and `noUnusedParameters` are `false` in tsconfig (allows unused vars without errors)
- Agent Emulator bypasses the `api()` client — it uses raw `fetch()` with `x-api-key` header
- Types are shared between pages via `types/index.ts` — add new interfaces there, not in page files
- Login page uses `/login_logo.svg` and header uses `/logo.svg` from `public/` directory
