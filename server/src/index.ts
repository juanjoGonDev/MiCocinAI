import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
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

const app = new Hono();

// ═══════════════════════════════════════════════════════════════════
// Global Middleware
// ═══════════════════════════════════════════════════════════════════

app.use('*', secureHeaders());
app.use('*', logger());
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
app.use('/api/*', rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: 'draft-6',
  keyGenerator: (c) => {
    return c.req.header('x-forwarded-for') || 
           c.req.header('x-real-ip') || 
           'unknown';
  }
}));

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
[SERVER]   MiCocinAI Server
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
