const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ── Color palette ──────────────────────────────────────────────
const COLORS = {
  primary: '#1a365d',
  secondary: '#2c5282',
  accent: '#3182ce',
  critical: '#c53030',
  high: '#dd6b20',
  medium: '#d69e2e',
  low: '#38a169',
  info: '#718096',
  positive: '#2f855a',
  text: '#1a202c',
  muted: '#4a5568',
  light: '#e2e8f0',
  bg: '#f7fafc',
  white: '#ffffff',
};

// ── Helpers ────────────────────────────────────────────────────
function severityColor(sev) {
  return COLORS[sev.toLowerCase()] || COLORS.text;
}

function addHeader(doc, text, level = 1) {
  const sizes = { 1: 22, 2: 17, 3: 14 };
  const colors = { 1: COLORS.primary, 2: COLORS.secondary, 3: COLORS.accent };
  doc.moveDown(level === 1 ? 1.5 : 0.8);
  doc.fontSize(sizes[level] || 14).fillColor(colors[level] || COLORS.text).text(text);
  if (level === 1) {
    doc.moveDown(0.2);
    doc.moveTo(doc.x, doc.y).lineTo(doc.x + 460, doc.y).strokeColor(COLORS.accent).lineWidth(1.5).stroke();
  }
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor(COLORS.text);
}

function addParagraph(doc, text) {
  doc.fontSize(10).fillColor(COLORS.text).text(text, { lineGap: 3 });
  doc.moveDown(0.3);
}

function addBullet(doc, text, indent = 20) {
  const x = doc.x;
  doc.fontSize(10).fillColor(COLORS.muted).text('•', x + indent - 12, doc.y, { continued: true });
  doc.fillColor(COLORS.text).text('  ' + text, { lineGap: 2 });
}

function addFinding(doc, id, title, severity, component, description, remediation) {
  // Check if we need a new page (need at least 200pt)
  if (doc.y > 620) doc.addPage();

  const color = severityColor(severity);

  // Finding header with severity badge
  doc.moveDown(0.6);
  doc.fontSize(11).fillColor(color).text(`[${severity.toUpperCase()}] ${id}: ${title}`, { underline: false });
  doc.moveDown(0.2);

  if (component) {
    doc.fontSize(8.5).fillColor(COLORS.muted).text(`Component: ${component}`);
    doc.moveDown(0.2);
  }

  doc.fontSize(9.5).fillColor(COLORS.text).text(description, { lineGap: 2.5 });
  doc.moveDown(0.2);

  if (remediation) {
    doc.fontSize(9.5).fillColor(COLORS.secondary).text('Remediation: ', { continued: true });
    doc.fillColor(COLORS.text).text(remediation, { lineGap: 2.5 });
  }
  doc.moveDown(0.3);
}

function addTableRow(doc, cols, widths, isHeader = false) {
  const startX = doc.x;
  let startY = doc.y;
  if (startY > 680) { doc.addPage(); startY = doc.y; }

  if (isHeader) {
    doc.rect(startX, startY - 2, widths.reduce((a, b) => a + b, 0), 18).fill(COLORS.primary);
    doc.fillColor(COLORS.white);
  } else {
    doc.fillColor(COLORS.text);
  }

  let x = startX;
  cols.forEach((col, i) => {
    doc.fontSize(isHeader ? 9 : 8.5).text(col, x + 4, startY + 2, { width: widths[i] - 8, height: 15 });
    x += widths[i];
  });
  doc.y = startY + 18;
  doc.fillColor(COLORS.text);
}

function addCoverPage(doc, title, subtitle) {
  doc.moveDown(6);
  doc.fontSize(32).fillColor(COLORS.primary).text(title, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor(COLORS.secondary).text(subtitle, { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(12).fillColor(COLORS.muted).text('Syntax DM Gateway', { align: 'center' });
  doc.moveDown(0.3);
  doc.text('Self-Service API Gateway for SAP Digital Manufacturing', { align: 'center' });
  doc.moveDown(2);

  // Meta info
  doc.fontSize(10).fillColor(COLORS.text);
  const meta = [
    ['Date:', new Date().toISOString().split('T')[0]],
    ['Version:', '1.0.0'],
    ['Stack:', 'Node 20 + Express + TypeScript + PostgreSQL + Docker'],
    ['Scope:', 'Backend, Frontend, Infrastructure, Docker'],
    ['Classification:', 'Confidential'],
  ];
  meta.forEach(([k, v]) => {
    doc.fillColor(COLORS.muted).text(k, 180, doc.y, { continued: true, width: 80 });
    doc.fillColor(COLORS.text).text('  ' + v);
  });

  doc.addPage();
}

// ══════════════════════════════════════════════════════════════
// REPORT 1: Security Audit Report
// ══════════════════════════════════════════════════════════════
function generateSecurityReport() {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 60, right: 60 } });
  const stream = fs.createWriteStream(path.join(__dirname, 'security-audit-report.pdf'));
  doc.pipe(stream);

  // ── Cover Page ──
  addCoverPage(doc, 'Security Audit Report', 'OWASP Top 10 & Infrastructure Assessment');

  // ── Table of Contents ──
  addHeader(doc, 'Table of Contents');
  const toc = [
    '1. Executive Summary',
    '2. Risk Matrix',
    '3. Critical Findings (3)',
    '4. High Findings (6)',
    '5. Medium Findings (8)',
    '6. Low Findings (6)',
    '7. Informational Observations (5)',
    '8. Positive Findings (12)',
    '9. Top 3 Priority Actions',
    '10. Appendix: Files Audited',
  ];
  toc.forEach(t => addBullet(doc, t));
  doc.addPage();

  // ── 1. Executive Summary ──
  addHeader(doc, '1. Executive Summary');
  addParagraph(doc,
    'The Syntax DM Gateway demonstrates a solid foundational security posture with parameterized queries, ' +
    'proper cryptographic implementations, ownership-based access control, and sensible secret handling. ' +
    'The development team has made several good security decisions: in-memory JWT storage, SHA-256 API key ' +
    'hashing, AES-256-GCM encryption, bcrypt password hashing, and header redaction in logs.'
  );
  addParagraph(doc,
    'However, three critical gaps require attention before production hardening: (1) Server-Side Request ' +
    'Forgery via user-controlled upstream URLs could allow an authenticated user to scan internal networks ' +
    'and access cloud metadata endpoints. (2) Production secrets are stored in plaintext configuration files. ' +
    '(3) JWT tokens cannot be revoked once issued. The high-severity findings around CORS localhost bypass, ' +
    'missing security headers, and broken tenant admin scoping should be addressed concurrently.'
  );
  addParagraph(doc,
    'The frontend has a strong security posture with zero Critical, High, or Medium findings. Zero usage of ' +
    'dangerouslySetInnerHTML, eval, or innerHTML. Strict TypeScript with zero "any" types. JWTs stored in ' +
    'module-scoped variables (not localStorage), eliminating both XSS token theft and CSRF attack classes.'
  );

  // ── 2. Risk Matrix ──
  addHeader(doc, '2. Risk Matrix');
  const widths = [120, 80, 80, 80, 80];
  addTableRow(doc, ['Component', 'Critical', 'High', 'Medium', 'Low'], widths, true);
  addTableRow(doc, ['Backend', '3', '6', '8', '6'], widths);
  addTableRow(doc, ['Frontend', '0', '0', '0', '3'], widths);
  addTableRow(doc, ['Infrastructure', '(in backend)', '(in backend)', '(in backend)', '(in backend)'], widths);
  doc.moveDown(0.3);
  addTableRow(doc, ['TOTAL', '3', '6', '8', '9'], widths, true);
  doc.moveDown(0.5);

  addParagraph(doc, 'Additional: 5 Informational, 12 Positive findings across backend. Frontend: 4 Informational, 10 Positive.');

  // ── 3. Critical Findings ──
  addHeader(doc, '3. Critical Findings');

  addFinding(doc, 'C-1', 'Server-Side Request Forgery (SSRF) via User-Controlled URLs', 'Critical',
    'connection.service.ts, proxy.service.ts',
    'Users supply sapBaseUrl, tokenUrl, and agentApiUrl when creating connections. These URLs are used ' +
    'directly by the proxy engine and SAP token service to make server-side HTTP requests. No validation ' +
    'restricts URLs to public hosts. An attacker can target internal services (e.g., http://169.254.169.254/ ' +
    'for AWS metadata, http://localhost:5432 for the database, or internal network hosts).',
    'Implement URL validation: enforce HTTPS-only, block private IP ranges (10.x, 172.16-31.x, 192.168.x, ' +
    '169.254.x, 127.x, ::1), block cloud metadata endpoints. Apply at connection creation and update time.'
  );

  addFinding(doc, 'C-2', 'Production Secrets Exposed in Configuration Files', 'Critical',
    '.env, docker-compose.yml, config.ts',
    'JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL (with password), and ADMIN_PASSWORD are stored in plaintext ' +
    'in .env. The database password is additionally hardcoded in docker-compose.yml. The config.ts has a ' +
    'default admin password fallback of "admin123". While .env is in .gitignore, it exists on disk and is ' +
    'accessible to any process running on the host.',
    'Move secrets to AWS Secrets Manager, Docker secrets, or environment variable injection from CI/CD. ' +
    'Remove hardcoded passwords from docker-compose.yml. Make ADMIN_PASSWORD required (no fallback) in production.'
  );

  addFinding(doc, 'C-3', 'No JWT Revocation Mechanism', 'Critical',
    'auth.service.ts, auth.ts middleware',
    'There is no token blacklist or revocation mechanism. The /api/auth/logout endpoint is a no-op (not ' +
    'even implemented). Once a JWT is issued, it remains valid until expiry (15 minutes for access, 7 days ' +
    'for refresh). A compromised token cannot be invalidated. Deactivating a user only takes effect when ' +
    'their access token expires and refresh fails.',
    'Implement a lightweight in-memory revocation set using JTI (JWT ID) claims. On logout/deactivation, ' +
    'add the JTI to the set. Check the set in auth middleware. Periodically prune expired entries.'
  );

  // ── 4. High Findings ──
  addHeader(doc, '4. High Findings');

  addFinding(doc, 'H-1', 'CORS Localhost Bypass in Production', 'High',
    'middleware/cors.ts (lines 46-48)',
    'The CORS middleware always allows requests from localhost origins (http://localhost:*, http://127.0.0.1:*) ' +
    'regardless of environment. In production, this allows any process running on the server (or an attacker ' +
    'who achieves localhost access) to make cross-origin requests bypassing CORS restrictions.',
    'Only allow localhost origins when NODE_ENV !== "production". Add an explicit CORS_ALLOWED_ORIGINS ' +
    'environment variable for production.'
  );

  addFinding(doc, 'H-2', 'Missing Security Response Headers', 'High',
    'index.ts',
    'No security headers are set on responses: no Content-Security-Policy, no X-Frame-Options, no ' +
    'Strict-Transport-Security, no X-Content-Type-Options, no Referrer-Policy, no Permissions-Policy. ' +
    'This leaves the frontend vulnerable to clickjacking, MIME-type sniffing, and other attacks.',
    'Add the helmet middleware or manually set security headers. At minimum: X-Content-Type-Options: nosniff, ' +
    'X-Frame-Options: DENY, Strict-Transport-Security, Content-Security-Policy.'
  );

  addFinding(doc, 'H-3', 'No TLS Enforcement on Upstream Connections', 'High',
    'proxy.service.ts, sap-token.service.ts',
    'The proxy service accepts both HTTP and HTTPS upstream URLs. SAP token requests and proxy forwarding ' +
    'can be made over unencrypted HTTP, exposing OAuth tokens and SAP data in transit.',
    'Enforce HTTPS-only for sapBaseUrl and tokenUrl. Reject http:// URLs at connection creation time.'
  );

  addFinding(doc, 'H-4', 'Tenant Admin Can Modify Any User (Broken Access Control)', 'High',
    'users.routes.ts PATCH /:id',
    'The PATCH /:id endpoint for user updates uses requireTenantAdmin but does not verify that the target ' +
    'user belongs to the admin\'s active tenant. A tenant admin can modify users in other tenants by ' +
    'providing their user ID.',
    'Add tenant scoping to user update queries: verify user membership in the admin\'s active tenant ' +
    'before allowing modifications.'
  );

  addFinding(doc, 'H-5', 'Request Logger Runs Before Authentication', 'High',
    'proxy-dm.routes.ts, proxy-agent.routes.ts',
    'In the proxy route middleware chain, requestLogger runs before tokenAuthMiddleware. This means ' +
    'unauthenticated requests are logged to the database, enabling log-flooding attacks without valid credentials.',
    'Reorder middleware: tokenAuthMiddleware should run before requestLogger on proxy routes.'
  );

  addFinding(doc, 'H-6', 'Explorer Endpoint Leaks Upstream Error Details', 'High',
    'explorer.routes.ts (line 48)',
    'The explorer error handler returns raw error messages to the client, including SAP token server ' +
    'error responses (up to 200 chars). This leaks information about internal network topology, service ' +
    'versions, and error details.',
    'Return generic error messages to clients. Log detailed errors server-side only.'
  );

  // ── 5. Medium Findings ──
  addHeader(doc, '5. Medium Findings');

  addFinding(doc, 'M-1', 'Default Admin Password Fallback', 'Medium',
    'config.ts (line 30)',
    'ADMIN_PASSWORD defaults to "admin123" if not set in environment. Any deployment forgetting to set ' +
    'this variable will have a trivially guessable admin credential.',
    'Make ADMIN_PASSWORD required in production (no fallback).'
  );

  addFinding(doc, 'M-2', 'Same JWT Key for Access and Refresh Tokens', 'Medium',
    'auth.service.ts (lines 59-67)',
    'Both access and refresh tokens are signed with the same jwtSecret. Distinguished only by a "type" claim. ' +
    'If any code path fails to check the type claim, a 7-day refresh token could be used as an access token.',
    'Use separate signing keys or add audience claims (audience: "access" vs "refresh") and verify in middleware.'
  );

  addFinding(doc, 'M-3', 'Request/Response Bodies Logged with Sensitive SAP Data', 'Medium',
    'middleware/request-logger.ts',
    'Request bodies (up to 64KB) and response bodies are stored in plaintext in the request_logs table. ' +
    'SAP API responses may contain sensitive manufacturing data (production orders, quality data, BOM).',
    'Make body logging configurable (default off in production) or encrypt logged bodies.'
  );

  addFinding(doc, 'M-4', 'No Log Retention Purge Implementation', 'Medium',
    'config.ts, database',
    'LOG_RETENTION_DAYS is configured (default 30) but no purge job exists. The request_logs table grows ' +
    'unboundedly, causing disk exhaustion, performance degradation, and stale sensitive data retention.',
    'Add a periodic cleanup job: DELETE FROM request_logs WHERE created_at < now() - interval.'
  );

  addFinding(doc, 'M-5', 'Timing Side-Channel on Token Hash Comparison (Theoretical)', 'Medium',
    'middleware/token-auth.ts',
    'API key hash comparison is done in SQL (WHERE token_hash = $1). While SHA-256 pre-hashing provides ' +
    'strong mitigation, constant-time comparison is the gold standard for authentication tokens.',
    'Current SHA-256 approach is industry-standard. Risk is theoretical. No immediate action required.'
  );

  addFinding(doc, 'M-6', 'No URL Format Validation on Connection URLs', 'Medium',
    'connections.routes.ts (lines 41-60)',
    'Beyond SSRF (C-1), there is no validation of URL format, length, or structure for user-supplied URLs. ' +
    'Extremely long URLs, injection characters, or unusual schemes would be accepted.',
    'Add URL format validation: enforce http/https protocol, reasonable length, valid hostname.'
  );

  addFinding(doc, 'M-7', 'Race Condition in SAP Token Cache', 'Medium',
    'sap-token.service.ts (lines 23-41)',
    'When a cached SAP token expires and multiple concurrent requests arrive, each will independently call ' +
    'fetchOAuthToken(), causing a thundering herd of token requests to the SAP authorization server.',
    'Implement request deduplication with a pending-promise map to coalesce concurrent token fetches.'
  );

  addFinding(doc, 'M-8', 'Database Connection Without SSL', 'Medium',
    '.env, db/pool.ts',
    'The DATABASE_URL does not enforce SSL. While currently in a Docker Compose network, any future ' +
    'migration to RDS or external PostgreSQL would transmit credentials and queries in plaintext.',
    'Add ?sslmode=require to connection string or configure pool with ssl option for production.'
  );

  // ── 6. Low Findings ──
  addHeader(doc, '6. Low Findings');

  addFinding(doc, 'L-1', 'Docker Container Runs as Root', 'Low',
    'Dockerfile',
    'No USER directive in the Dockerfile. The production process runs as root inside the container.',
    'Add: RUN addgroup -S app && adduser -S app -G app / USER app'
  );

  addFinding(doc, 'L-2', 'Health Endpoint Leaks Server Uptime', 'Low',
    'index.ts (lines 36-42)',
    '/gw/health is unauthenticated and returns server uptime, informing attackers when patches were applied.',
    'Remove uptime from public health endpoint.'
  );

  addFinding(doc, 'L-3', 'Debug Logging Exposes Proxy Request Details', 'Low',
    'proxy.service.ts, proxy-dm.routes.ts',
    'console.log statements output request URLs, body snippets, and header names to stdout.',
    'Guard behind a debug flag or remove for production.'
  );

  addFinding(doc, 'L-4', 'Rate Limiter Key Uses JWT Substring', 'Low',
    'middleware/rate-limit.ts',
    'API rate limiter uses first 40 chars of JWT as key. Token refresh resets the rate limit window.',
    'Extract userId from JWT payload (base64 decode) for rate limiting key.'
  );

  addFinding(doc, 'L-5', 'No Password Complexity Requirements', 'Low',
    'users.routes.ts, auth.routes.ts',
    'User creation only checks presence of password, accepts single-character passwords.',
    'Enforce minimum 12 characters.'
  );

  addFinding(doc, 'L-6', 'expiresAt Not Validated on Token Creation', 'Low',
    'tokens.routes.ts',
    'The expiresAt field passes directly to SQL with no validation (past dates, non-dates accepted).',
    'Validate: must be a valid future date.'
  );

  // Frontend low findings
  addFinding(doc, 'L-7', 'No React Error Boundary (Frontend)', 'Low',
    'frontend/src/App.tsx',
    'A runtime error in any component crashes the entire app with a white screen. No recovery path.',
    'Add an Error Boundary component at the Layout level.'
  );

  addFinding(doc, 'L-8', 'setOnAuthExpired Called During Render (Frontend)', 'Low',
    'frontend/src/components/Layout.tsx (line 17)',
    'setOnAuthExpired is called during component render, which is a React anti-pattern that could cause ' +
    'infinite re-render loops.',
    'Move to useEffect.'
  );

  addFinding(doc, 'L-9', 'alert() Used for Error Feedback (Frontend)', 'Low',
    'ConnectionsPage, TokensPage, UsersPage',
    'Five catch blocks use alert() for error feedback, which blocks the main thread.',
    'Replace with inline toast notifications or error state displays.'
  );

  // ── 7. Informational ──
  addHeader(doc, '7. Informational Observations');

  addFinding(doc, 'I-1', 'Refresh Token in Response Body (Not httpOnly Cookie)', 'Info',
    'auth.routes.ts',
    'Refresh token returned in JSON body. Frontend stores in module-scoped variable. Acceptable for SPA ' +
    'pattern; httpOnly cookies would be stronger but introduce CSRF complexity.',
    null
  );

  addFinding(doc, 'I-2', 'No Rate Limiting on /api/auth/refresh', 'Info',
    'index.ts',
    'Only the general apiLimiter (30/min) applies to /refresh. A stolen refresh token could generate ' +
    'access tokens at 30/min.',
    null
  );

  addFinding(doc, 'I-3', 'No Account Lockout After Failed Logins', 'Info',
    'auth.service.ts, rate-limit.ts',
    'Login rate limiter (5/min/IP) provides basic protection, but no per-account lockout. Distributed ' +
    'attacks can attempt 5 passwords/minute per IP indefinitely.',
    null
  );

  addFinding(doc, 'I-4', 'cors NPM Package Imported But Unused', 'Info',
    'backend/package.json',
    'The cors package is a dependency but the app uses a custom CORS middleware. Dead dependency.',
    null
  );

  addFinding(doc, 'I-5', 'No Frontend Linter or Test Framework', 'Info',
    'frontend/package.json',
    'No ESLint, Prettier, Vitest, Jest, or React Testing Library configured. No test files exist.',
    null
  );

  // ── 8. Positive Findings ──
  addHeader(doc, '8. Positive Findings');
  doc.moveDown(0.3);

  const positives = [
    ['P-1', 'Parameterized Queries Throughout', 'All DB queries use parameterized $1/$2 placeholders. No raw SQL concatenation found. SQL injection effectively eliminated.'],
    ['P-2', 'API Key Hashing with SHA-256', 'Keys hashed before storage, plaintext only returned once at creation. DB compromise does not reveal usable keys.'],
    ['P-3', 'Secrets Never Returned to Clients', 'toPublic() pattern consistently strips password_hash, client_secret_enc, agent_api_key_enc from API responses.'],
    ['P-4', 'Hop-by-Hop Header Stripping', 'Proxy correctly strips x-api-key, proxy-authorization, host, connection, and other dangerous headers.'],
    ['P-5', 'Refresh Token Type Enforcement', 'Auth middleware rejects refresh tokens used as access tokens and vice versa.'],
    ['P-6', 'User Active Status on Refresh', 'Token refresh verifies user is still active in DB. Deactivated users lose access within 15 minutes.'],
    ['P-7', 'AES-256-GCM Implementation', 'Correct implementation with random IVs, proper auth tags, and key length validation.'],
    ['P-8', 'Fire-and-Forget Logging', 'Request logging never blocks proxy responses. Errors caught silently.'],
    ['P-9', 'Sensitive Header Redaction', 'authorization, x-api-key, cookie, set-cookie, csrf tokens never logged.'],
    ['P-10', 'Connection Ownership Verification', 'All CRUD operations verify user_id and tenant_id. IDOR attacks prevented.'],
    ['P-11', 'Bcryptjs Cost Factor 12', '~250ms hash time. Strong against brute-force on stolen hashes.'],
    ['P-12', 'Self-Deactivation Prevention', 'Users cannot deactivate their own account.'],
    ['P-13', 'In-Memory JWT Storage (Frontend)', 'Tokens in module-scoped variables, not localStorage. XSS cannot exfiltrate tokens. CSRF eliminated.'],
    ['P-14', 'Zero dangerouslySetInnerHTML (Frontend)', 'No innerHTML, eval, or dynamic code execution. Primary XSS vector eliminated.'],
    ['P-15', 'Minimal Frontend Dependencies', 'Only 3 runtime deps (react, react-dom, react-router-dom). Minimal supply chain attack surface.'],
    ['P-16', 'Strict TypeScript (Frontend)', 'Strict mode enabled, zero "any" types. Strong type safety throughout.'],
  ];

  positives.forEach(([id, title, desc]) => {
    if (doc.y > 660) doc.addPage();
    doc.fontSize(10).fillColor(COLORS.positive).text(`${id}: ${title}`, { underline: false });
    doc.fontSize(9).fillColor(COLORS.text).text(desc, { lineGap: 2 });
    doc.moveDown(0.4);
  });

  // ── 9. Top 3 Priority Actions ──
  addHeader(doc, '9. Top 3 Priority Actions');

  addParagraph(doc,
    '1. IMPLEMENT URL VALIDATION & SSRF PROTECTION (C-1, H-3, M-6): Add a URL validation utility that ' +
    'enforces HTTPS-only, blocks private IP ranges and cloud metadata endpoints. Apply to all user-supplied ' +
    'URLs at creation/update time. This single fix addresses the most exploitable vulnerability.'
  );
  addParagraph(doc,
    '2. MOVE SECRETS TO SECRETS MANAGER & ADD SECURITY HEADERS (C-2, H-2): Remove all secrets from ' +
    'docker-compose.yml and .env. Use AWS Secrets Manager or CI/CD injection. Add helmet middleware for ' +
    'CSP, HSTS, X-Frame-Options. Rotate all currently exposed secrets.'
  );
  addParagraph(doc,
    '3. IMPLEMENT JWT REVOCATION & FIX MIDDLEWARE ORDERING (C-3, H-5): Add an in-memory token revocation ' +
    'set with JTI claims. Fix proxy route middleware to authenticate before logging. Closes token lifecycle ' +
    'gaps and prevents unauthenticated log flooding.'
  );

  // ── 10. Appendix ──
  addHeader(doc, '10. Appendix: Files Audited');
  const files = [
    'backend/src/index.ts, config.ts, types/index.ts',
    'backend/src/middleware/{auth,token-auth,cors,rate-limit,request-logger}.ts',
    'backend/src/services/{auth,user,connection,api-token,crypto,sap-token,proxy,log,tenant,catalog,explorer}.service.ts',
    'backend/src/routes/{auth,users,connections,tokens,logs,proxy-dm,proxy-agent,tenants,catalog,explorer}.routes.ts',
    'backend/src/db/{pool,migrate}.ts, migrations/001-007',
    'frontend/src/{App,main}.tsx, api/client.ts',
    'frontend/src/hooks/{useAuth,useApi}.ts',
    'frontend/src/pages/{Login,Dashboard,Connections,Tokens,Logs,Explorer,Tenants,Users}Page.tsx',
    'frontend/src/components/{ProtectedRoute,Layout,LogDetailModal,StatsCards}.tsx',
    'frontend/src/types/index.ts, vite.config.ts, tsconfig.json',
    'Dockerfile, docker-compose.yml, .env, .env.example, .gitignore, .dockerignore',
    'backend/package.json, frontend/package.json',
  ];
  files.forEach(f => addBullet(doc, f));

  doc.end();
  return new Promise(resolve => stream.on('finish', resolve));
}

// ══════════════════════════════════════════════════════════════
// REPORT 2: Code Quality & Maturity Assessment
// ══════════════════════════════════════════════════════════════
function generateQualityReport() {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 60, right: 60 } });
  const stream = fs.createWriteStream(path.join(__dirname, 'code-quality-report.pdf'));
  doc.pipe(stream);

  addCoverPage(doc, 'Code Quality &\nMaturity Assessment', 'Architecture, Patterns, and Recommendations');

  // ── TOC ──
  addHeader(doc, 'Table of Contents');
  ['1. Executive Summary', '2. Architecture Rating', '3. Backend Quality Ratings',
   '4. Frontend Quality Ratings', '5. Best Practices Checklist',
   '6. Maturity Assessment', '7. Recommendations'].forEach(t => addBullet(doc, t));
  doc.addPage();

  // ── 1. Executive Summary ──
  addHeader(doc, '1. Executive Summary');
  addParagraph(doc,
    'The Syntax DM Gateway is a well-architected application with clear separation of concerns, ' +
    'consistent patterns, and strong type safety. The codebase demonstrates mature engineering decisions: ' +
    'streaming proxy (no buffering), in-memory token caching with expiry buffer, fire-and-forget logging, ' +
    'AES-256-GCM encryption at rest, and a clean multi-tenancy model.'
  );
  addParagraph(doc,
    'Key strengths include zero SQL injection surface (parameterized queries throughout), excellent ' +
    'TypeScript usage (zero "any" types frontend, strict mode), and a minimal dependency footprint. ' +
    'Areas for improvement center around tooling (no linter, no tests), code duplication in the frontend, ' +
    'and operational maturity (no log rotation, no health monitoring, no CI/CD pipeline).'
  );

  // ── 2. Architecture Rating ──
  addHeader(doc, '2. Architecture Rating');

  addHeader(doc, 'Overall: 8/10', 3);
  addParagraph(doc,
    'Clean layered architecture: routes → services → database. Two distinct auth paths (JWT for admin, ' +
    'API key for proxy) are well-separated. Proxy engine uses native Node.js streaming with no middleware ' +
    'overhead on the hot path. Multi-tenancy implemented via junction table pattern with tenant context ' +
    'carried in JWT. Good separation between frontend and backend with API-first design.'
  );

  const archScores = [
    ['Separation of Concerns', '9/10', 'Clean routes → services → DB layering. Middleware properly isolated.'],
    ['API Design', '8/10', 'RESTful, consistent response shapes. Missing: API versioning, pagination standardization.'],
    ['Error Handling', '7/10', 'Consistent try/catch in routes. Missing: centralized error handler, structured error codes.'],
    ['Configuration', '7/10', 'Centralized config.ts with env vars. Missing: validation, required vars in production.'],
    ['Data Model', '8/10', 'Clean normalized schema. Proper FK constraints, indexes. Multi-tenancy well-modeled.'],
    ['Security Architecture', '8/10', 'Strong foundations. See security report for gaps.'],
  ];

  const aw = [200, 60, 200];
  addTableRow(doc, ['Aspect', 'Score', 'Notes'], aw, true);
  archScores.forEach(r => addTableRow(doc, r, aw));

  // ── 3. Backend Quality ──
  addHeader(doc, '3. Backend Quality Ratings');

  const backendScores = [
    ['Type Safety', '9/10', 'Strict TypeScript, typed DB queries, proper interface definitions. Minor: Express v5 type quirk requires "as string" casts on params.'],
    ['Code Organization', '8/10', 'Consistent file structure. Each service in its own file. Routes cleanly delegate to services.'],
    ['DRY Principle', '7/10', 'Some repetition in route error handling patterns. Tenant scoping added consistently but could use middleware.'],
    ['Error Handling', '7/10', 'Consistent pattern but no centralized error handler. Some error messages leak internal details.'],
    ['Testability', '3/10', 'No tests exist. Services have clear interfaces suitable for unit testing but no test infrastructure.'],
    ['Documentation', '5/10', 'JSDoc comments on key functions. No API documentation (OpenAPI/Swagger). CLAUDE.md is excellent.'],
    ['Dependencies', '9/10', 'Minimal, well-chosen. 0 npm audit vulnerabilities. No unnecessary packages.'],
    ['Performance', '9/10', 'Streaming proxy, in-memory caching, fire-and-forget logging, connection pooling. Well-optimized.'],
  ];

  addTableRow(doc, ['Aspect', 'Score', 'Notes'], [120, 50, 290], true);
  backendScores.forEach(r => {
    if (doc.y > 660) doc.addPage();
    addTableRow(doc, r, [120, 50, 290]);
  });

  // ── 4. Frontend Quality ──
  addHeader(doc, '4. Frontend Quality Ratings');

  const frontendScores = [
    ['Type Safety', '9/10', 'Strict mode, zero "any" types, typed generics for API calls. Exemplary.'],
    ['Architecture', '8/10', 'Clean hook-based architecture. API client → hooks → components pattern.'],
    ['DRY Principle', '6/10', 'formatBytes duplicated 3x, StatusBadge 3x, Modal pattern 5x, table styling repeated.'],
    ['Error Handling', '6/10', 'Auto-refresh with backoff is excellent. But alert() for errors, some silently swallowed.'],
    ['Testability', '4/10', 'No tests. No test framework. Large components mix concerns.'],
    ['Accessibility', '4/10', 'No ARIA labels, no focus trapping in modals, no keyboard navigation.'],
    ['Dependencies', '10/10', 'Only 3 runtime deps. Minimal supply chain surface.'],
    ['UX Consistency', '8/10', 'Consistent dark theme, consistent CRUD patterns, good loading/error states.'],
  ];

  addTableRow(doc, ['Aspect', 'Score', 'Notes'], [120, 50, 290], true);
  frontendScores.forEach(r => {
    if (doc.y > 660) doc.addPage();
    addTableRow(doc, r, [120, 50, 290]);
  });

  // ── 5. Best Practices Checklist ──
  addHeader(doc, '5. Best Practices Checklist');

  const checks = [
    ['Parameterized SQL queries', 'PASS', 'All queries use $1/$2 placeholders'],
    ['TypeScript strict mode', 'PASS', 'Both backend and frontend'],
    ['Zero "any" types', 'PASS', 'Verified via codebase-wide search'],
    ['No hardcoded secrets in source', 'PASS', 'All secrets in .env (see C-2 for .env handling)'],
    ['.env in .gitignore', 'PASS', 'Properly excluded from version control'],
    ['npm audit clean', 'PASS', '0 vulnerabilities in both backend and frontend'],
    ['ESLint configured', 'FAIL', 'No linter configured for either backend or frontend'],
    ['Prettier configured', 'FAIL', 'No code formatter configured'],
    ['Unit tests', 'FAIL', 'No test files or test framework in the project'],
    ['Integration tests', 'FAIL', 'No API or E2E tests'],
    ['CI/CD pipeline', 'FAIL', 'No GitHub Actions, Jenkins, or other CI/CD'],
    ['API documentation', 'FAIL', 'No OpenAPI/Swagger spec'],
    ['Error Boundary (frontend)', 'FAIL', 'No React Error Boundary component'],
    ['Accessibility audit', 'FAIL', 'No ARIA labels, focus trapping, or a11y testing'],
    ['Log rotation/purge', 'FAIL', 'LOG_RETENTION_DAYS configured but not implemented'],
    ['Health monitoring', 'PARTIAL', '/gw/health exists but no external monitoring'],
    ['Rate limiting', 'PASS', 'In-memory rate limits on login, API, and proxy endpoints'],
    ['CORS configuration', 'PARTIAL', 'Custom middleware but localhost always allowed'],
    ['Input validation', 'PARTIAL', 'Presence checks but no format/length validation'],
    ['Docker security', 'PARTIAL', '.dockerignore exists, but runs as root'],
  ];

  const cw = [180, 60, 220];
  addTableRow(doc, ['Check', 'Status', 'Notes'], cw, true);
  checks.forEach(r => {
    if (doc.y > 670) doc.addPage();
    addTableRow(doc, r, cw);
  });

  // ── 6. Maturity Assessment ──
  addHeader(doc, '6. Maturity Assessment');

  addHeader(doc, 'Current Level: 2 - Managed (out of 5)', 3);
  addParagraph(doc,
    'The application demonstrates Level 2 maturity: code is well-structured, patterns are consistent, ' +
    'and security fundamentals are solid. However, the absence of automated testing, CI/CD, linting, ' +
    'and operational tooling (monitoring, log rotation, alerting) prevents advancement to Level 3 (Defined).'
  );

  doc.moveDown(0.5);
  const levels = [
    ['Level 1: Initial', 'Ad-hoc development, no patterns', 'PASSED'],
    ['Level 2: Managed', 'Consistent patterns, good architecture, basic security', 'CURRENT'],
    ['Level 3: Defined', 'Automated tests, CI/CD, linting, documentation', 'TARGET'],
    ['Level 4: Measured', 'Metrics, monitoring, performance baselines, SLOs', 'FUTURE'],
    ['Level 5: Optimized', 'Continuous improvement, chaos engineering, full observability', 'FUTURE'],
  ];

  const lw = [120, 230, 80];
  addTableRow(doc, ['Level', 'Description', 'Status'], lw, true);
  levels.forEach(r => addTableRow(doc, r, lw));

  // ── 7. Recommendations ──
  addHeader(doc, '7. Recommendations');

  addHeader(doc, 'Quick Wins (< 1 day each)', 3);
  const quickWins = [
    'Add ESLint + Prettier to both backend and frontend (~30 min each)',
    'Add React Error Boundary component (~15 min)',
    'Add helmet middleware for security headers (~10 min)',
    'Remove uptime from health endpoint (~5 min)',
    'Add password complexity validation (~15 min)',
    'Add URL format validation on connection creation (~30 min)',
    'Remove or guard debug console.log statements (~15 min)',
    'Add non-root USER to Dockerfile (~5 min)',
  ];
  quickWins.forEach(w => addBullet(doc, w));

  addHeader(doc, 'Medium Effort (1-3 days each)', 3);
  const medium = [
    'Implement SSRF protection with URL allowlist utility',
    'Add JWT revocation mechanism with JTI claims',
    'Extract duplicated frontend components to shared modules',
    'Implement log retention purge job',
    'Add SAP token cache request deduplication',
    'Fix tenant admin access control scoping',
    'Reorder proxy middleware (auth before logging)',
    'Add API documentation with OpenAPI/Swagger',
  ];
  medium.forEach(w => addBullet(doc, w));

  addHeader(doc, 'Strategic (1-2 weeks)', 3);
  const strategic = [
    'Set up CI/CD pipeline (GitHub Actions) with build + lint + test',
    'Add unit tests for all services (target 80% coverage)',
    'Add integration tests for API endpoints',
    'Move secrets to AWS Secrets Manager',
    'Implement structured logging with log levels (pino/winston)',
    'Add application performance monitoring (APM)',
    'Add frontend E2E tests (Playwright)',
    'Implement accessibility improvements (ARIA, focus trapping)',
  ];
  strategic.forEach(w => addBullet(doc, w));

  doc.end();
  return new Promise(resolve => stream.on('finish', resolve));
}

// ══════════════════════════════════════════════════════════════
// REPORT 3: JSON Export
// ══════════════════════════════════════════════════════════════
function generateJsonExport() {
  const findings = {
    metadata: {
      project: 'Syntax DM Gateway',
      date: new Date().toISOString(),
      version: '1.0.0',
      stack: 'Node 20 + Express + TypeScript + PostgreSQL + Docker',
    },
    summary: {
      critical: 3, high: 6, medium: 8, low: 9, info: 5, positive: 16,
      backendVulnerabilities: 0, frontendVulnerabilities: 0,
      maturityLevel: '2 - Managed',
    },
    findings: [
      { id: 'C-1', severity: 'Critical', title: 'SSRF via User-Controlled URLs', component: 'connection.service.ts, proxy.service.ts' },
      { id: 'C-2', severity: 'Critical', title: 'Production Secrets in Configuration Files', component: '.env, docker-compose.yml' },
      { id: 'C-3', severity: 'Critical', title: 'No JWT Revocation Mechanism', component: 'auth.service.ts' },
      { id: 'H-1', severity: 'High', title: 'CORS Localhost Bypass', component: 'middleware/cors.ts' },
      { id: 'H-2', severity: 'High', title: 'Missing Security Headers', component: 'index.ts' },
      { id: 'H-3', severity: 'High', title: 'No TLS Enforcement on Upstream', component: 'proxy.service.ts' },
      { id: 'H-4', severity: 'High', title: 'Tenant Admin Broken Access Control', component: 'users.routes.ts' },
      { id: 'H-5', severity: 'High', title: 'Request Logger Before Authentication', component: 'proxy-dm.routes.ts' },
      { id: 'H-6', severity: 'High', title: 'Explorer Leaks Error Details', component: 'explorer.routes.ts' },
      { id: 'M-1', severity: 'Medium', title: 'Default Admin Password Fallback', component: 'config.ts' },
      { id: 'M-2', severity: 'Medium', title: 'Same JWT Key for Access/Refresh', component: 'auth.service.ts' },
      { id: 'M-3', severity: 'Medium', title: 'Sensitive Data in Request Logs', component: 'request-logger.ts' },
      { id: 'M-4', severity: 'Medium', title: 'No Log Retention Purge', component: 'config.ts' },
      { id: 'M-5', severity: 'Medium', title: 'Timing Side-Channel (Theoretical)', component: 'token-auth.ts' },
      { id: 'M-6', severity: 'Medium', title: 'No URL Format Validation', component: 'connections.routes.ts' },
      { id: 'M-7', severity: 'Medium', title: 'SAP Token Cache Race Condition', component: 'sap-token.service.ts' },
      { id: 'M-8', severity: 'Medium', title: 'Database Without SSL', component: 'db/pool.ts' },
      { id: 'L-1', severity: 'Low', title: 'Docker Runs as Root', component: 'Dockerfile' },
      { id: 'L-2', severity: 'Low', title: 'Health Endpoint Leaks Uptime', component: 'index.ts' },
      { id: 'L-3', severity: 'Low', title: 'Debug Logging in Production', component: 'proxy.service.ts' },
      { id: 'L-4', severity: 'Low', title: 'Rate Limiter Key Bypass', component: 'rate-limit.ts' },
      { id: 'L-5', severity: 'Low', title: 'No Password Complexity', component: 'users.routes.ts' },
      { id: 'L-6', severity: 'Low', title: 'Token expiresAt Not Validated', component: 'tokens.routes.ts' },
      { id: 'L-7', severity: 'Low', title: 'No React Error Boundary', component: 'frontend/App.tsx' },
      { id: 'L-8', severity: 'Low', title: 'setOnAuthExpired in Render', component: 'frontend/Layout.tsx' },
      { id: 'L-9', severity: 'Low', title: 'alert() for Error Feedback', component: 'frontend/*Page.tsx' },
    ],
    topPriorities: [
      'Implement URL validation & SSRF protection (C-1, H-3, M-6)',
      'Move secrets to secrets manager & add security headers (C-2, H-2)',
      'Implement JWT revocation & fix middleware ordering (C-3, H-5)',
    ],
    qualityScores: {
      backend: { typeSafety: 9, organization: 8, dry: 7, errorHandling: 7, testability: 3, documentation: 5, dependencies: 9, performance: 9 },
      frontend: { typeSafety: 9, architecture: 8, dry: 6, errorHandling: 6, testability: 4, accessibility: 4, dependencies: 10, uxConsistency: 8 },
    },
  };

  fs.writeFileSync(
    path.join(__dirname, 'audit-findings.json'),
    JSON.stringify(findings, null, 2)
  );
}

// ── Main ──
async function main() {
  console.log('Generating Security Audit Report (PDF)...');
  await generateSecurityReport();
  console.log('  → reports/security-audit-report.pdf');

  console.log('Generating Code Quality Report (PDF)...');
  await generateQualityReport();
  console.log('  → reports/code-quality-report.pdf');

  console.log('Generating JSON Export...');
  generateJsonExport();
  console.log('  → reports/audit-findings.json');

  console.log('\nAll reports generated successfully.');
}

main().catch(err => {
  console.error('Report generation failed:', err);
  process.exit(1);
});
