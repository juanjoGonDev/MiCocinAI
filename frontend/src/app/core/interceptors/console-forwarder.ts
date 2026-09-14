/**
 * Captures browser console errors and forwards them to the server
 * so they appear in the terminal output.
 */

const API_URL = '/api/logs';

interface LogEntry {
  level: 'error' | 'warn' | 'info';
  message: string;
  stack?: string;
  url: string;
  timestamp: string;
  userAgent: string;
}

function sendToServer(entry: LogEntry): void {
  try {
    const blob = new Blob([JSON.stringify(entry)], { type: 'application/json' });
    navigator.sendBeacon(API_URL, blob);
  } catch {
    // Silently fail - don't create infinite loops
  }
}

function formatArgs(args: unknown[]): string {
  return args.map(arg => {
    if (arg instanceof Error) {
      return arg.message + (arg.stack ? '\n' + arg.stack : '');
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

export function installConsoleForwarder(): void {
  if (typeof window === 'undefined') return;

  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: unknown[]) => {
    originalError.apply(console, args);

    const message = formatArgs(args);
    const entry: LogEntry = {
      level: 'error',
      message,
      stack: args.find(a => a instanceof Error)?.stack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    sendToServer(entry);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args);

    const message = formatArgs(args);
    const entry: LogEntry = {
      level: 'warn',
      message,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    sendToServer(entry);
  };

  // Also capture unhandled errors
  window.addEventListener('error', (event) => {
    const entry: LogEntry = {
      level: 'error',
      message: event.message,
      stack: event.error?.stack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };
    sendToServer(entry);
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const entry: LogEntry = {
      level: 'error',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };
    sendToServer(entry);
  });
}
