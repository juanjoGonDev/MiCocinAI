import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { rateLimiter } from 'hono-rate-limiter';

import { config } from './config/app.config.js';
import { initializeDatabase } from './config/database.js';
import { errorHandler } from './middleware/error.middleware.js';
import { authRoutes } from './routes/auth.routes.js';
import { pantryRoutes } from './routes/pantry.routes.js';
import { recipeRoutes } from './routes/recipes.routes.js';
import { householdRoutes } from './routes/household.routes.js';
import { calendarRoutes } from './routes/calendar.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { logRoutes } from './routes/logs.routes.js';
import { memoryMonitor } from './utils/memory-monitor.js';
import { installConsoleCapture } from './utils/log-store.js';

// Install console capture BEFORE anything else so that startup messages
// (including DB init errors) make it into the in-app log viewer.
installConsoleCapture();

const app = new Hono();

// ═══════════════════════════════════════════════════════════════════
// Global Middleware
// ═══════════════════════════════════════════════════════════════════

app.use('*', secureHeaders());

// Custom logger: writes to console (which is captured into the log store for
// the in-app viewer) with the same "← /method /path" / "→ status ms" format
// that the user saw in their terminal.
app.use('*', async (c, next) => {
  const start = Date.now();
  const { method, url } = c.req;
  // eslint-disable-next-line no-console
  console.log(`<-- ${method} ${url}`);
  await next();
  const ms = Date.now() - start;
  const status = c.res.status;
  const color =
    status >= 500 ? '\x1b[31m'
    : status >= 400 ? '\x1b[33m'
    : status >= 300 ? '\x1b[36m'
    : '\x1b[32m';
  const reset = '\x1b[0m';
  // eslint-disable-next-line no-console
  console.log(`--> ${color}${method} ${url} ${status}${reset} ${ms}ms`);
});

app.use('*', prettyJSON());

// CORS
app.use('*', cors({
  origin: config.cors.origin,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Request-Id'],
  maxAge: 86400,
  credentials: true
}));

// Rate limiting
// More generous limits: development use, single user, and we want to avoid
// accidental lockouts from refresh storms (which should not happen, but still).
// Logs and health endpoints are exempt from rate limiting.
//
// DISABLE_RATE_LIMIT=1 los apaga. La suite e2e al completo comparte la IP del
// runner, asi que un pico de peticiones dejaba un registro sin redirigir y la
// prueba esperaba 45s su navegacion: parecian fallos de la app y no lo eran.
app.use('/api/health', (_c, next) => next());
app.use('/api/logs', (_c, next) => next());
if (process.env.DISABLE_RATE_LIMIT !== '1') {
  app.use('/api/auth/refresh', rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    limit: 30,          // 30 refreshes per minute is already a lot
    standardHeaders: 'draft-6',
    keyGenerator: (c) => {
      return c.req.header('x-forwarded-for') ||
             c.req.header('x-real-ip') ||
             'unknown';
    }
  }));
  app.use('/api/auth/login', rateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 20,          // 20 login attempts per 15 minutes
    standardHeaders: 'draft-6',
    keyGenerator: (c) => {
      return c.req.header('x-forwarded-for') ||
             c.req.header('x-real-ip') ||
             'unknown';
    }
  }));
  app.use('/api/*', rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    limit: 300,          // 300 req/min is plenty for a single-user app
    standardHeaders: 'draft-6',
    keyGenerator: (c) => {
      return c.req.header('x-forwarded-for') ||
             c.req.header('x-real-ip') ||
             'unknown';
    }
  }));
}

// ═══════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════

// Health check (no auth required)
app.route('/health', healthRoutes);
app.route('/api/health', healthRoutes);

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/pantry', pantryRoutes);
app.route('/api/recipes', recipeRoutes);
app.route('/api/household', householdRoutes);
app.route('/api/calendar', calendarRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/logs', logRoutes);

// Error handling
app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Not Found',
    message: `Route ${c.req.method} ${c.req.url} not found`
  }, 404);
});

// ═══════════════════════════════════════════════════════════════════
// Server Startup
// ═══════════════════════════════════════════════════════════════════

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('[SERVER] ✓ Database initialized');

    // Start memory monitor
    memoryMonitor.start();
    console.log('[SERVER] ✓ Memory monitor started');

    // Start server
    const port = config.server.port;
    serve({
      fetch: app.fetch,
      port,
      hostname: '0.0.0.0'
    }, (info) => {
      console.log(`
[SERVER] ══════════════════════════════════════════════════════════
[SERVER]   HogarIA Server
[SERVER]   Status:  Running
[SERVER]   Port:    ${info.port}
[SERVER]   Env:     ${config.server.env}
[SERVER]   PID:     ${process.pid}
[SERVER] ══════════════════════════════════════════════════════════
      `);
    });
  } catch (error) {
    console.error('[SERVER] Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received. Shutting down gracefully...');
  memoryMonitor.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SERVER] SIGINT received. Shutting down gracefully...');
  memoryMonitor.stop();
  process.exit(0);
});

startServer();

export default app;
