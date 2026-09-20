import { serve } from '@hono/node-server';
import { relative } from 'node:path';

import { config } from './config/app.config.js';
import { initializeDatabase } from './config/database.js';
import { memoryMonitor } from './utils/memory-monitor.js';
import { installConsoleCapture } from './utils/log-store.js';
import { uploadsRoot } from './utils/uploads.js';
import { createApp, rateLimitFromEnv, resolveStaticDir } from './app.js';

// Install console capture BEFORE anything else so that startup messages
// (including DB init errors) make it into the in-app log viewer.
installConsoleCapture();

const staticDir = resolveStaticDir();
const app = createApp({ rateLimit: rateLimitFromEnv(), staticDir });

// ═══════════════════════════════════════════════════════════════════
// Server Startup
// ═══════════════════════════════════════════════════════════════════

async function startServer() {
  try {
    await initializeDatabase();
    console.log('[SERVER] ✓ Database initialized');

    memoryMonitor.start();
    console.log('[SERVER] ✓ Memory monitor started');
    // Donde viven las fotos subidas, en absoluto y una sola vez. Sin esta linea, un 404 de un
    // `img` obliga a adivinar con que `cwd` se arranco el proceso —y ahi se va la tarde.
    console.log(`[SERVER] ✓ Uploads en ${uploadsRoot()}`);

    const port = config.server.port;
    serve(
      {
        fetch: app.fetch,
        port,
        hostname: '0.0.0.0'
      },
      (info) => {
        const shown = staticDir ? relative(process.cwd(), staticDir) : null;
        console.log(`
[SERVER] ══════════════════════════════════════════════════════════
[SERVER]   HogarIA Server
[SERVER]   Status:  Running
[SERVER]   Port:    ${info.port}
[SERVER]   Env:     ${config.server.env}
[SERVER]   Web:     ${shown ?? 'API solo (sin estaticos)'}
[SERVER]   PID:     ${process.pid}
[SERVER] ══════════════════════════════════════════════════════════
        `);
      }
    );
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
