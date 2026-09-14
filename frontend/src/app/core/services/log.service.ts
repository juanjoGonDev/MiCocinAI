import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'log';
export type LogSource = 'server' | 'browser';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  stack?: string;
  url?: string;
  type?: 'connected' | string;
  total?: number;
}

@Injectable({ providedIn: 'root' })
export class LogService {
  private http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/logs`;

  private logsSignal = signal<LogEntry[]>([]);
  private connectedSignal = signal(false);
  private autoScrollSignal = signal(true);
  private filterSource = signal<LogSource | 'all'>('all');
  private filterLevel = signal<LogLevel | 'all'>('all');
  private pausedSignal = signal(false);

  private eventSource?: EventSource;
  private buffer: LogEntry[] = [];
  private flushTimer?: number;

  readonly logs = this.logsSignal.asReadonly();
  readonly connected = this.connectedSignal.asReadonly();
  readonly autoScroll = this.autoScrollSignal.asReadonly();
  readonly paused = this.pausedSignal.asReadonly();
  readonly sourceFilter = this.filterSource.asReadonly();
  readonly levelFilter = this.filterLevel.asReadonly();

  connect(): void {
    this.disconnect();

    // Load historical logs first
    this.http.get<any>(`${this.apiUrl}?limit=500`).subscribe({
      next: (res) => {
        const entries: LogEntry[] = (res?.data?.logs ?? []);
        // Oldest first for terminal scroll
        this.logsSignal.set(entries.reverse());
      },
      error: () => { /* ignore, SSE will still try */ }
    });

    // Then open an SSE stream for live updates
    try {
      this.eventSource = new EventSource(`${this.apiUrl}/stream`);
      this.eventSource.onopen = () => this.connectedSignal.set(true);
      this.eventSource.onerror = () => this.connectedSignal.set(false);
      this.eventSource.onmessage = (ev) => {
        try {
          const entry: LogEntry = JSON.parse(ev.data);
          if (this.pausedSignal()) return;
          this.pushEntry(entry);
        } catch { /* ignore bad JSON */ }
      };
    } catch {
      this.connectedSignal.set(false);
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    this.connectedSignal.set(false);
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  setSourceFilter(s: LogSource | 'all'): void {
    this.filterSource.set(s);
  }

  setLevelFilter(l: LogLevel | 'all'): void {
    this.filterLevel.set(l);
  }

  toggleAutoScroll(): void {
    this.autoScrollSignal.update(v => !v);
  }

  togglePause(): void {
    this.pausedSignal.update(v => !v);
  }

  clear(): void {
    this.http.delete(`${this.apiUrl}`).subscribe({
      next: () => this.logsSignal.set([]),
    });
  }

  isVisible(entry: LogEntry): boolean {
    if (entry.type === 'connected') return false;
    if (this.filterSource() !== 'all' && entry.source !== this.filterSource()) return false;
    if (this.filterLevel() !== 'all' && entry.level !== this.filterLevel()) return false;
    return true;
  }

  /** Buffer incoming entries so rapid bursts don't cause excessive change detection. */
  private pushEntry(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.flushTimer) return;
    this.flushTimer = window.setTimeout(() => {
      const batch = this.buffer.splice(0);
      this.flushTimer = undefined;
      this.logsSignal.update(list => {
        const merged = [...list, ...batch];
        // Cap at last 1500 entries
        return merged.length > 1500 ? merged.slice(merged.length - 1500) : merged;
      });
    }, 200);
  }
}
