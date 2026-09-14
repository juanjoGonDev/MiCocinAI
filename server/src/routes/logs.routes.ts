import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { AppEnv } from '../types/hono-env.js';
import { addLog, getLogs, totalLogs, clearLogs, LogEntry } from '../utils/log-store.js';

const logRoutes = new Hono<AppEnv>();

// Clients subscribed to live logs via SSE
const sseClients = new Set<(entry: LogEntry) => void>();

function broadcast(entry: LogEntry): void {
  for (const send of sseClients) {
    try { send(entry); } catch { /* ignore */ }
  }
}

// Wrap addLog to also broadcast
function record(entry: LogEntry): void {
  addLog(entry);
  broadcast(entry);
}

// GET /api/logs/stream - Server-Sent Events stream of live logs
logRoutes.get('/stream', (c) => {
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return stream(c, (s) => {
    return new Promise<void>((resolve) => {
      let finished = false;
      const send = (entry: LogEntry) => {
        if (finished) return;
        void s.write(`data: ${JSON.stringify(entry)}\n\n`);
      };

      sseClients.add(send);

      // Connected event
      void s.write(`: connected\n`);
      void s.write(`data: ${JSON.stringify({ type: 'connected', total: totalLogs() })}\n\n`);

      // Heartbeat
      const heartbeat = setInterval(() => {
        if (finished) return;
        void s.write(`: ping\n`);
      }, 15000);

      const cleanup = () => {
        if (finished) return;
        finished = true;
        clearInterval(heartbeat);
        sseClients.delete(send);
        resolve();
      };

      c.req.raw.signal.addEventListener('abort', cleanup);

      // Safety: if the stream's close fires, clean up
      s.onAbort?.(cleanup);
    });
  }, async (err, _s) => {
    if (err) {
      console.error('[logs/SSE] stream error:', err);
    }
  });
});

// POST /api/logs - Receive browser console logs
logRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();

    const entry: LogEntry = {
      timestamp: body.timestamp || new Date().toISOString(),
      level: body.level || 'error',
      source: 'browser',
      message: body.message || '',
      stack: body.stack,
      url: body.url,
    };

    record(entry);

    return c.json({ success: true });
  } catch {
    return c.json({ success: false }, 400);
  }
});

// GET /api/logs - Get recent logs (supports ?limit, ?level, ?source, ?since)
logRoutes.get('/', (c) => {
  const limit = Number(c.req.query('limit')) || 500;
  const level = c.req.query('level');
  const source = c.req.query('source');
  const since = c.req.query('since');

  const logs = getLogs({ limit, level, source, since });

  return c.json({
    success: true,
    data: {
      logs,
      total: totalLogs()
    }
  });
});

// DELETE /api/logs - Clear logs
logRoutes.delete('/', (c) => {
  clearLogs();
  return c.json({ success: true, message: 'Logs cleared' });
});

// Public helper for server code to add entries that are also broadcast.
export function addServerLog(level: string, message: string, stack?: string): void {
  record({
    timestamp: new Date().toISOString(),
    level: (level as LogEntry['level']) || 'info',
    source: 'server',
    message,
    stack,
  });
}

export { logRoutes };
