# Syntax DM Gateway Platform – Entwicklungs-Prompt

## Projektübersicht

Baue eine Self-Service API Gateway Plattform als Docker-Container (ECS Fargate). Die Plattform ist eine Vermittlungsstelle zwischen SAP Digital Manufacturing POD Plugins, einem AI Agent (Syntax Copilot) und den SAP DM APIs. User verwalten ihre SAP-Verbindungen, generieren API Tokens und sehen alle Requests im Dashboard.

---

## Tech Stack

- **Backend:** Node.js 20 + Express.js + TypeScript
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Datenbank:** PostgreSQL 15 (AWS RDS Serverless v2)
- **Auth:** bcrypt + JWT (access + refresh tokens)
- **Encryption:** AWS KMS für SAP Client Secrets (at-rest)
- **Container:** Docker (Multi-Stage Build: Backend + Frontend in einem Image)
- **Deployment:** AWS ECS Fargate + ALB + RDS + KMS + ECR

---

## Projektstruktur

```
syntax-dm-gateway/
├── docker-compose.yml          # Lokale Entwicklung (App + Postgres)
├── Dockerfile                  # Multi-stage: build frontend → serve mit backend
├── .env.example                # Vorlage für Umgebungsvariablen
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Express App Setup, Middleware, Routes mounten
│   │   ├── config.ts           # Env-Variablen laden + validieren
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.ts         # JWT Verification Middleware
│   │   │   ├── token-auth.ts   # API Token Verification (für Proxy-Requests)
│   │   │   ├── cors.ts         # CORS Middleware
│   │   │   ├── rate-limit.ts   # Rate Limiting
│   │   │   └── request-logger.ts # Request/Response Logging in DB
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.routes.ts       # POST /api/auth/login, /refresh, /logout
│   │   │   ├── users.routes.ts      # CRUD /api/users (nur admin)
│   │   │   ├── connections.routes.ts # CRUD /api/connections
│   │   │   ├── tokens.routes.ts     # CRUD /api/tokens
│   │   │   ├── logs.routes.ts       # GET /api/logs (mit Filter/Pagination)
│   │   │   ├── proxy-agent.routes.ts # POST /gw/agent/* (Proxy → AI Studio)
│   │   │   └── proxy-dm.routes.ts   # ANY /gw/dm/* (Proxy → SAP DM APIs)
│   │   │
│   │   ├── services/
│   │   │   ├── auth.service.ts       # Login, Token-Generierung, Password Hashing
│   │   │   ├── user.service.ts       # User CRUD
│   │   │   ├── connection.service.ts # SAP Connection CRUD + Secret Encryption
│   │   │   ├── api-token.service.ts  # Gateway Token CRUD + Hashing
│   │   │   ├── sap-token.service.ts  # SAP OAuth2 Token Manager (Caching)
│   │   │   ├── proxy.service.ts      # Request Forwarding Logic
│   │   │   ├── log.service.ts        # Request Log Queries
│   │   │   └── crypto.service.ts     # KMS Encrypt/Decrypt Wrapper
│   │   │
│   │   ├── db/
│   │   │   ├── pool.ts         # PostgreSQL Connection Pool (pg)
│   │   │   ├── migrate.ts      # Migration Runner
│   │   │   └── migrations/
│   │   │       ├── 001_users.sql
│   │   │       ├── 002_sap_connections.sql
│   │   │       ├── 003_api_tokens.sql
│   │   │       └── 004_request_logs.sql
│   │   │
│   │   └── types/
│   │       └── index.ts        # Shared TypeScript Types
│   │
│   └── tests/                  # Tests (optional, später)
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx             # Router Setup
│       ├── api/
│       │   └── client.ts       # Axios/Fetch Wrapper mit JWT Interceptor
│       ├── hooks/
│       │   ├── useAuth.ts      # Auth Context + Login/Logout
│       │   └── useApi.ts       # Generic API Hook
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── DashboardPage.tsx     # Übersicht: Stats + letzte Logs
│       │   ├── ConnectionsPage.tsx   # SAP Connections verwalten
│       │   ├── TokensPage.tsx        # API Tokens verwalten
│       │   └── LogsPage.tsx          # Request Logs mit Filter
│       ├── components/
│       │   ├── Layout.tsx            # Sidebar + Header
│       │   ├── ConnectionForm.tsx    # Create/Edit SAP Connection
│       │   ├── TokenTable.tsx        # Token Liste mit Copy/Revoke
│       │   ├── LogTable.tsx          # Request Logs Tabelle
│       │   ├── StatsCards.tsx        # Dashboard Statistik-Karten
│       │   └── ProtectedRoute.tsx    # Auth Guard
│       └── types/
│           └── index.ts
│
└── infra/                      # IaC (optional, Terraform oder CDK)
    └── README.md
```

---

## Datenbank Schema

### Migration 001: users

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

-- Initial Admin User (Passwort wird beim ersten Start gesetzt via ENV)
-- Wird in migrate.ts programmatisch erstellt
CREATE INDEX idx_users_username ON users(username);
```

### Migration 002: sap_connections

```sql
CREATE TABLE sap_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sap_base_url VARCHAR(500) NOT NULL,
    token_url VARCHAR(500) NOT NULL,
    client_id VARCHAR(255) NOT NULL,
    client_secret_enc TEXT NOT NULL,          -- KMS-verschlüsselt
    agent_api_url VARCHAR(500),              -- Optional: AI Studio URL
    agent_api_key_enc TEXT,                  -- Optional: KMS-verschlüsselt
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(user_id, name)
);

CREATE INDEX idx_sap_connections_user ON sap_connections(user_id);
```

### Migration 003: api_tokens

```sql
CREATE TABLE api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sap_connection_id UUID NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,  -- SHA-256 Hash des Tokens
    token_prefix VARCHAR(12) NOT NULL,        -- Erste 8 Zeichen zum Identifizieren (z.B. "sdmg_a3f8...")
    label VARCHAR(100) NOT NULL,              -- z.B. "POD Plugin Prod", "Agent Dev"
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    request_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ                    -- NULL = kein Ablauf
);

CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);
```

### Migration 004: request_logs

```sql
CREATE TABLE request_logs (
    id BIGSERIAL PRIMARY KEY,
    api_token_id UUID REFERENCES api_tokens(id) ON DELETE SET NULL,
    sap_connection_id UUID REFERENCES sap_connections(id) ON DELETE SET NULL,

    -- Request Info
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    target VARCHAR(10) NOT NULL CHECK (target IN ('agent', 'sap_dm')),
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    request_headers JSONB,                    -- Gefiltert: keine Secrets/Tokens
    request_body_size INTEGER,

    -- Response Info
    status_code INTEGER,
    response_body_size INTEGER,
    duration_ms INTEGER,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partitioned by month für Performance bei vielen Logs
CREATE INDEX idx_request_logs_token ON request_logs(api_token_id);
CREATE INDEX idx_request_logs_connection ON request_logs(sap_connection_id);
CREATE INDEX idx_request_logs_created ON request_logs(created_at DESC);
CREATE INDEX idx_request_logs_target ON request_logs(target);

-- Auto-Cleanup: Logs älter als 30 Tage löschen (via pg_cron oder App-Job)
```

---

## API Spezifikation

### Auth Endpoints

```
POST /api/auth/login
  Body: { "username": "admin", "password": "secret" }
  Response: { "accessToken": "jwt...", "refreshToken": "jwt...", "user": { "id", "username", "role" } }
  AccessToken Lifetime: 15 Minuten
  RefreshToken Lifetime: 7 Tage

POST /api/auth/refresh
  Body: { "refreshToken": "jwt..." }
  Response: { "accessToken": "jwt..." }

POST /api/auth/logout
  Header: Authorization: Bearer <accessToken>
  Aktion: RefreshToken invalidieren
```

### User Endpoints (nur Admin)

```
GET    /api/users                    → Liste aller User
POST   /api/users                    → Neuen User anlegen { username, password, role }
PATCH  /api/users/:id                → User bearbeiten
DELETE /api/users/:id                → User deaktivieren (soft delete)
```

### SAP Connection Endpoints

```
GET    /api/connections              → Eigene Connections (User sieht nur seine)
POST   /api/connections              → Neue Connection anlegen
  Body: {
    "name": "Haribo Prod",
    "sapBaseUrl": "https://api.eu20.dmc.cloud.sap",
    "tokenUrl": "https://xxx.authentication.eu20.hana.ondemand.com/oauth/token",
    "clientId": "sb-xxx",
    "clientSecret": "xxx",
    "agentApiUrl": "https://studio-api.ai.syntax-rnd.com",   // optional
    "agentApiKey": "xxx"                                       // optional
  }
  Aktion: clientSecret und agentApiKey werden mit KMS verschlüsselt vor dem Speichern.

GET    /api/connections/:id          → Connection Details (ohne Secrets)
PATCH  /api/connections/:id          → Connection bearbeiten
DELETE /api/connections/:id          → Connection löschen (cascades tokens + logs)

POST   /api/connections/:id/test     → Connection testen (OAuth Token holen, SAP DM /health pingen)
  Response: { "status": "ok|error", "sapTokenOk": true, "sapApiReachable": true, "agentReachable": true }
```

### API Token Endpoints

```
GET    /api/tokens                   → Eigene Tokens (Token-Wert wird NIE zurückgegeben, nur Prefix)
POST   /api/tokens
  Body: { "sapConnectionId": "uuid", "label": "POD Plugin Prod" }
  Response: { "token": "sdmg_a3f8xxxxxxxxxxxxxxxxxxxx", "id": "uuid", ... }
  WICHTIG: Der echte Token wird NUR bei der Erstellung angezeigt. Danach nur noch der Prefix.
  Token-Format: "sdmg_" + 40 Zeichen random hex
  Speicherung: SHA-256 Hash in DB, Klartext wird nie gespeichert.

PATCH  /api/tokens/:id              → Label ändern, aktivieren/deaktivieren
DELETE /api/tokens/:id              → Token löschen (revoke)
```

### Log Endpoints

```
GET    /api/logs
  Query Params:
    ?target=agent|sap_dm            → Filter nach Ziel
    ?connectionId=uuid               → Filter nach Connection
    ?tokenId=uuid                    → Filter nach Token
    ?status=2xx|4xx|5xx             → Filter nach Status-Range
    ?from=2025-01-01T00:00:00Z      → Zeitfenster Start
    ?to=2025-01-31T23:59:59Z        → Zeitfenster Ende
    ?page=1&limit=50                → Pagination
  Response: { "data": [...], "total": 1234, "page": 1, "pages": 25 }

GET    /api/logs/stats
  Query Params: ?connectionId=uuid&period=24h|7d|30d
  Response: {
    "totalRequests": 4521,
    "byTarget": { "agent": 2100, "sap_dm": 2421 },
    "byStatus": { "2xx": 4200, "4xx": 280, "5xx": 41 },
    "avgDurationMs": { "agent": 1200, "sap_dm": 340 },
    "topPaths": [{ "path": "/sfc/v1/sfcdetail", "count": 890 }, ...]
  }
```

### Gateway Proxy Endpoints (mit API Token Auth)

```
POST /gw/agent/{any path}
  Header: x-api-key: sdmg_a3f8xxxxxxxxxxxxxxxxxxxx
  Body: { ... } (wird 1:1 weitergeleitet)
  Aktion:
    1. Token validieren → sap_connection laden
    2. agent_api_key aus connection entschlüsseln
    3. Request an agentApiUrl weiterleiten mit agent_api_key als x-api-key
    4. Response 1:1 zurückgeben
    5. Log schreiben (inbound + outbound)

ANY /gw/dm/{any path}
  Header: x-api-key: sdmg_a3f8xxxxxxxxxxxxxxxxxxxx
  Body: { ... } (wird 1:1 weitergeleitet)
  Aktion:
    1. Token validieren → sap_connection laden
    2. SAP Bearer Token holen/cachen (sap-token.service.ts)
    3. Request an sapBaseUrl/{path} weiterleiten mit Bearer Token
    4. Bei 401: Token refreshen, einmal retry
    5. Response 1:1 zurückgeben
    6. Log schreiben (inbound + outbound)
    CORS: Erlaubt für die SAP DM Origin + localhost:*

GET /gw/health
  Kein Auth nötig
  Response: { "status": "healthy", "version": "1.0.0", "uptime": 3600 }
```

---

## Implementierungsdetails

### SAP Token Manager (sap-token.service.ts)

```
- In-Memory Cache: Map<connectionId, { token, expiresAt }>
- getToken(connectionId):
    1. Prüfe Cache: Wenn token vorhanden UND expiresAt > now + 120s → return cached
    2. Sonst: Connection aus DB laden → clientSecret entschlüsseln
    3. POST tokenUrl mit client_credentials grant
    4. Token + expiresAt cachen
    5. Return token
- invalidate(connectionId): Cache-Eintrag löschen (nach 401)
```

### Crypto Service (crypto.service.ts)

```
Zwei Modi je nach Umgebung:
- Produktion (AWS): KMS Encrypt/Decrypt mit Key ARN aus ENV
- Lokal (Development): AES-256-GCM mit einem lokalen Schlüssel aus ENV
  → Damit man lokal ohne AWS KMS entwickeln kann

encrypt(plaintext: string): Promise<string>  → Base64-encoded ciphertext
decrypt(ciphertext: string): Promise<string> → Klartext
```

### Request Logger Middleware (request-logger.ts)

```
- Nur für /gw/* Routen aktiv (nicht für /api/* Admin-Routen)
- Loggt: method, path, status, duration, body sizes
- NIEMALS loggen: Authorization Header, x-api-key Werte, Request/Response Bodies
- Asynchron: Log-Write darf Response nicht verzögern (fire-and-forget)
```

### CORS Middleware (cors.ts)

```
- /gw/* Routen: Dynamische Origin basierend auf der SAP Connection
  → Allowed Origins: sapBaseUrl Origin + localhost:*
- /api/* Routen: Nur Same-Origin (Frontend wird vom gleichen Server serviert)
- OPTIONS Preflight: Immer 204, max-age 3600
```

### Rate Limiting (rate-limit.ts)

```
- /api/auth/login: 5 Versuche pro Minute pro IP
- /gw/*: 100 Requests pro Minute pro API Token
- /api/*: 30 Requests pro Minute pro User
- Implementierung: In-Memory (express-rate-limit) für den Anfang, Redis wenn nötig
```

---

## Frontend Seiten

### LoginPage
- Einfaches Login-Formular: Username + Password
- Bei Erfolg: JWT speichern (Memory, nicht localStorage), Redirect zu Dashboard
- Error Handling: "Falsche Zugangsdaten" Meldung

### DashboardPage
- **Statistik-Karten** oben: Requests heute, Erfolgsrate, Avg. Latenz, Aktive Connections
- **Request-Chart**: Requests über Zeit (letzte 24h, gruppiert pro Stunde) als Balkendiagramm
- **Letzte 10 Requests**: Mini-Tabelle mit Status, Ziel, Pfad, Dauer
- **Connection Status**: Grün/Rot für jede Connection (letzer erfolgreicher Request)

### ConnectionsPage
- **Tabelle**: Name, SAP Base URL, Status (aktiv/inaktiv), Anzahl Tokens, Letzter Request
- **Erstellen-Dialog**: Formular mit:
  - Name (Freitext)
  - SAP Base URL (https://...)
  - Token URL (https://...authentication.../oauth/token)
  - Client ID
  - Client Secret (Password-Feld)
  - Agent API URL (optional)
  - Agent API Key (optional, Password-Feld)
- **Test-Button**: Connection testen → Ergebnis anzeigen
- **Bearbeiten**: Inline oder Modal, Secret-Felder nur wenn man explizit "ändern" klickt
- **Löschen**: Confirm-Dialog mit Warnung "Alle Tokens und Logs werden gelöscht"

### TokensPage
- **Tabelle**: Prefix (sdmg_a3f8...), Label, Connection Name, Status, Erstellt, Zuletzt benutzt, Request Count
- **Erstellen-Dialog**:
  - Connection auswählen (Dropdown)
  - Label eingeben
  - → Token wird angezeigt mit Copy-Button + Warnung "Diesen Token sicher aufbewahren, er wird nicht erneut angezeigt"
- **Revoke-Button**: Token deaktivieren (soft) oder löschen (hard)

### LogsPage
- **Filter-Leiste**: Target (Agent/SAP DM), Connection, Status Range, Zeitraum
- **Tabelle**: Zeitstempel, Richtung (→/←), Target, Method, Path, Status, Dauer, Token-Prefix
- **Farbkodierung**: 2xx=grün, 4xx=gelb, 5xx=rot
- **Pagination**: 50 pro Seite, Blättern
- **Auto-Refresh**: Toggle für automatisches Aktualisieren (alle 10 Sekunden)

---

## Docker Setup

### Dockerfile (Multi-Stage)

```dockerfile
# Stage 1: Frontend bauen
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend bauen
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Production Image
FROM node:20-alpine
WORKDIR /app
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/package.json ./
COPY --from=frontend-build /app/frontend/dist ./public
# Backend serviert Frontend als statische Files aus /public

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### docker-compose.yml (Lokale Entwicklung)

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://gateway:gateway@db:5432/gateway
      - JWT_SECRET=dev-secret-change-me
      - ENCRYPTION_KEY=0123456789abcdef0123456789abcdef  # 32 Byte hex für lokale AES
      - ENCRYPTION_MODE=local
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=admin123
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: gateway
      POSTGRES_USER: gateway
      POSTGRES_PASSWORD: gateway
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gateway"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

---

## Umgebungsvariablen (.env.example)

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://gateway:gateway@localhost:5432/gateway

# Auth
JWT_SECRET=change-me-in-production-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Initial Admin (nur beim ersten Start)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me

# Encryption
ENCRYPTION_MODE=local          # "local" oder "kms"
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef   # Nur für ENCRYPTION_MODE=local
KMS_KEY_ARN=                   # Nur für ENCRYPTION_MODE=kms

# CORS
ALLOWED_ORIGINS=https://syntax-dmc-demo.execution.eu20-quality.web.dmc.cloud.sap,http://localhost:5173

# Rate Limiting
RATE_LIMIT_PROXY=100           # Requests pro Minute pro Token
RATE_LIMIT_API=30              # Requests pro Minute pro User
RATE_LIMIT_LOGIN=5             # Login-Versuche pro Minute pro IP

# Logging
LOG_LEVEL=info
LOG_RETENTION_DAYS=30
```

---

## Reihenfolge der Implementierung

Baue das Projekt in dieser Reihenfolge auf:

### Phase 1: Backend Grundgerüst
1. Express App Setup mit TypeScript (`backend/src/index.ts`)
2. Config laden (`config.ts`)
3. DB Connection Pool (`db/pool.ts`)
4. Migration Runner + alle 4 Migrations ausführen
5. Auth Service + Auth Routes (Login, Refresh, Logout)
6. Auth Middleware (JWT Verification)
7. → Testen: Login funktioniert, JWT wird zurückgegeben

### Phase 2: CRUD Routen
1. User Service + Routes (CRUD, nur Admin)
2. Crypto Service (lokaler Modus mit AES)
3. Connection Service + Routes (CRUD mit Encryption)
4. API Token Service + Routes (Create mit Hash, List ohne Token-Wert)
5. → Testen: Connections und Tokens können erstellt werden

### Phase 3: Proxy Engine
1. Token Auth Middleware (x-api-key → Connection laden)
2. SAP Token Manager Service (OAuth2 + Caching)
3. Proxy Service (Request Forwarding)
4. Agent Proxy Route (`/gw/agent/*`)
5. DM Proxy Route (`/gw/dm/*`)
6. Request Logger Middleware
7. CORS Middleware für /gw/* Routen
8. → Testen: Requests werden weitergeleitet, Logs in DB

### Phase 4: Frontend
1. Vite + React + Tailwind Setup
2. API Client mit JWT Interceptor
3. Auth Context + Login Page
4. Layout (Sidebar + Header)
5. Dashboard Page mit Stats
6. Connections Page (CRUD)
7. Tokens Page (Create, Revoke)
8. Logs Page (Filter, Pagination)
9. → Testen: Komplett durchklicken

### Phase 5: Docker + Deploy
1. Dockerfile (Multi-Stage)
2. docker-compose.yml für lokale Tests
3. Backend serviert Frontend aus /public
4. Health Check Endpoint
5. → Testen: `docker compose up` → App läuft auf :3000

---

## Wichtige Regeln

1. **Secrets niemals loggen**: Kein API Key, kein Bearer Token, kein Client Secret in Console oder DB Logs
2. **Token nur einmal zeigen**: API Token wird bei Erstellung angezeigt, danach nur noch Prefix
3. **Client Secrets verschlüsselt speichern**: Immer via Crypto Service, nie Klartext in DB
4. **CORS nur für /gw/ Routen**: Frontend wird same-origin serviert, braucht kein CORS
5. **Request Bodies nicht loggen**: Nur Größe, nicht den Inhalt (Datenschutz)
6. **Graceful Error Handling**: Proxy-Fehler dürfen nicht die ganze App crashen
7. **SAP Token Caching**: Nicht bei jedem Request einen neuen Token holen, Cache mit Auto-Refresh
8. **Migrations idempotent**: `CREATE TABLE IF NOT EXISTS`, damit sie mehrfach laufen können

