import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { config } from './config';
import { migrate } from './db/migrate';

// Middleware
import { corsMiddleware } from './middleware/cors';
import { loginLimiter, apiLimiter } from './middleware/rate-limit';

// Routes – Admin API
import authRoutes from './routes/auth.routes';
import tenantsRoutes from './routes/tenants.routes';
import usersRoutes from './routes/users.routes';
import connectionsRoutes from './routes/connections.routes';
import tokensRoutes from './routes/tokens.routes';
import logsRoutes from './routes/logs.routes';
import explorerRoutes from './routes/explorer.routes';
import catalogRoutes from './routes/catalog.routes';
import registryRoutes from './routes/registry.routes';
import orchestratorAdminRoutes from './routes/orchestrator-admin.routes';
import exportRoutes from './routes/export.routes';

// Routes – Gateway Proxy
import proxyDmRoutes from './routes/proxy-dm.routes';
import proxyAgentRoutes from './routes/proxy-agent.routes';
import orchestratorRoutes from './routes/orchestrator.routes';

const app = express();

// ── Global middleware ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
app.use(corsMiddleware);

// Body parsing (only for /api/* – proxy routes stream raw bodies)
app.use('/api', express.json({ limit: '10mb' }));
app.use('/api', express.urlencoded({ extended: true }));
// /gw/* routes: parse JSON so proxy can re-serialize if needed
app.use('/gw', express.json({ limit: '10mb' }));

// ── Health check (no auth, no rate limit) ──────────────────
app.get('/gw/health', (_req, res) => {
  res.json({ status: 'healthy' });
});

// ── Admin API routes ───────────────────────────────────────
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/tenants', apiLimiter, tenantsRoutes);
app.use('/api/users', apiLimiter, usersRoutes);
app.use('/api/connections', apiLimiter, connectionsRoutes);
app.use('/api/tokens', apiLimiter, tokensRoutes);
app.use('/api/logs', apiLimiter, logsRoutes);
app.use('/api/explorer', apiLimiter, explorerRoutes);
app.use('/api/catalog', apiLimiter, catalogRoutes);
app.use('/api/registry', apiLimiter, registryRoutes);
app.use('/api/orchestrator', apiLimiter, orchestratorAdminRoutes);
app.use('/api/export', apiLimiter, exportRoutes);

// ── Gateway proxy routes ───────────────────────────────────
// Rate limit + token auth + logging are applied inside each proxy router
app.use('/gw/dm', proxyDmRoutes);
app.use('/gw/agent', proxyAgentRoutes);
app.use('/gw/query', orchestratorRoutes);

// ── Serve frontend static files ────────────────────────────
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// SPA fallback: serve index.html for non-API/GW routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/gw/')) {
    next();
    return;
  }
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) next();
  });
});

// ── Start server ───────────────────────────────────────────
async function start(): Promise<void> {
  await migrate();
  app.listen(config.port, () => {
    console.log(`Gateway running on port ${config.port} (${config.nodeEnv})`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
