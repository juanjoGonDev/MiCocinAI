import { Hono } from 'hono';
import type { AppEnv } from '../types/hono-env.js';

const logRoutes = new Hono<AppEnv>();

// Store recent logs in memory (last 500 entries)
const MAX_LOGS = 500;
const recentLogs: Array<{
  timestamp: string;
  level: string;
  source: 'browser' | 'server';
  message: string;
  stack?: string;
  url?: string;
}> = [];

function addLog(entry: typeof recentLogs[0]) {
  recentLogs.push(entry);
  if (recentLogs.length > MAX_LOGS) {
    recentLogs.shift();
  }
}

// POST /api/logs - Receive browser console logs
logRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();

    const entry = {
      timestamp: body.timestamp || new Date().toISOString(),
      level: body.level || 'error',
      source: 'browser' as const,
      message: body.message || '',
      stack: body.stack,
      url: body.url
    };

    addLog(entry);

    // Also log to server terminal with prefix
    const prefix = `[SERVER] [BROWSER ${entry.level.toUpperCase()}]`;
    if (entry.level === 'error') {
      console.error(`\x1b[31m${prefix}\x1b[0m ${entry.message}`);
    } else if (entry.level === 'warn') {
      console.warn(`\x1b[33m${prefix}\x1b[0m ${entry.message}`);
    } else {
      console.log(`\x1b[36m${prefix}\x1b[0m ${entry.message}`);
    }

    return c.json({ success: true });
  } catch {
    return c.json({ success: false }, 400);
  }
});

// GET /api/logs - Get recent logs
logRoutes.get('/', async (c) => {
  const limit = Number(c.req.query('limit')) || 100;
  const level = c.req.query('level');
  const source = c.req.query('source');

  let filtered = [...recentLogs];

  if (level) {
    filtered = filtered.filter(l => l.level === level);
  }

  if (source) {
    filtered = filtered.filter(l => l.source === source);
  }

  // Return most recent first
  filtered.reverse();

  return c.json({
    success: true,
    data: {
      logs: filtered.slice(0, limit),
      total: filtered.length
    }
  });
});

// DELETE /api/logs - Clear logs
logRoutes.delete('/', async (c) => {
  recentLogs.length = 0;
  return c.json({ success: true, message: 'Logs cleared' });
});

// Helper to add server logs
export function addServerLog(level: string, message: string, stack?: string) {
  addLog({
    timestamp: new Date().toISOString(),
    level,
    source: 'server',
    message,
    stack
  });
}

export { logRoutes };
