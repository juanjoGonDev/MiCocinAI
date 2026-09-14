import { Component, inject, OnInit, OnDestroy, AfterViewChecked, ElementRef, ViewChild, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogService, LogEntry, LogLevel, LogSource } from '../../core/services/log.service';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  template: `
    <div class="logs-page">
      <!-- Toolbar -->
      <div class="logs-toolbar">
        <div class="logs-toolbar__title">
          <h1>📋 Logs</h1>
          <span
            class="logs-status"
            [class.logs-status--connected]="logService.connected()"
            [class.logs-status--disconnected]="!logService.connected()"
          >
            <span class="logs-status__dot"></span>
            {{ logService.connected() ? 'En vivo' : 'Desconectado' }}
          </span>
          <span class="logs-count">{{ visibleCount() }} / {{ logService.logs().length }}</span>
        </div>

        <div class="logs-toolbar__filters">
          <select
            class="logs-select"
            [ngModel]="logService.sourceFilter()"
            (ngModelChange)="onSourceChange($event)"
          >
            <option *ngFor="let opt of sourceOptions" [value]="opt.value">{{ opt.label }}</option>
          </select>

          <select
            class="logs-select"
            [ngModel]="logService.levelFilter()"
            (ngModelChange)="onLevelChange($event)"
          >
            <option *ngFor="let opt of levelOptions" [value]="opt.value">{{ opt.label }}</option>
          </select>

          <app-button
            [variant]="logService.paused() ? 'primary' : 'ghost'"
            size="sm"
            (onClick)="logService.togglePause()"
          >
            {{ logService.paused() ? '▶ Reanudar' : '⏸ Pausar' }}
          </app-button>

          <app-button
            variant="ghost"
            size="sm"
            (onClick)="logService.toggleAutoScroll()"
          >
            Auto-scroll: {{ logService.autoScroll() ? 'ON' : 'OFF' }}
          </app-button>

          <app-button
            variant="ghost"
            size="sm"
            (onClick)="clearLogs()"
          >
            🗑 Limpiar
          </app-button>
        </div>
      </div>

      <!-- Terminal -->
      <div class="terminal" #terminalEl>
        <div class="terminal__header">
          <div class="terminal__controls">
            <span class="terminal__dot terminal__dot--red"></span>
            <span class="terminal__dot terminal__dot--yellow"></span>
            <span class="terminal__dot terminal__dot--green"></span>
          </div>
          <div class="terminal__title">MiCocinAI — terminal</div>
          <div class="terminal__spacer"></div>
        </div>
        <div class="terminal__body" #bodyEl>
          <div
            *ngFor="let entry of filtered()"
            class="terminal__line"
            [class]="'terminal__line--' + entry.level + ' terminal__line--source-' + entry.source"
          >
            <span class="terminal__time">{{ formatTime(entry.timestamp) }}</span>
            <span class="terminal__source">{{ entry.source === 'server' ? '[SRV]' : '[CLI]' }}</span>
            <span class="terminal__level">{{ levelTag(entry.level) }}</span>
            <span class="terminal__msg">{{ entry.message }}</span>
            <pre *ngIf="entry.stack" class="terminal__stack">{{ entry.stack }}</pre>
          </div>
          <div *ngIf="filtered().length === 0" class="terminal__empty">
            Esperando logs…
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .logs-page {
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      height: calc(100vh - 56px - 64px - env(safe-area-inset-bottom));
    }

    @media (min-width: 1024px) {
      .logs-page {
        padding: var(--space-6);
        height: 100vh;
      }
    }

    /* Toolbar */
    .logs-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: center;
      justify-content: space-between;
    }

    .logs-toolbar__title {
      display: flex;
      align-items: center;
      gap: var(--space-3);

      h1 {
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--font-bold);
        margin: 0;
      }
    }

    .logs-toolbar__filters {
      display: flex;
      gap: var(--space-2);
      flex-wrap: wrap;
      align-items: center;
    }

    .logs-status {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-full);
      background: var(--error-subtle);
      color: var(--error);

      &--connected {
        background: #dcfce7;
        color: #15803d;
      }
    }

    .logs-status__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .logs-count {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .logs-select {
      padding: var(--space-2) var(--space-3);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--text-primary);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: pointer;

      &:focus {
        outline: none;
        border-color: var(--primary);
      }
    }

    /* Terminal */
    .terminal {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #0b1021;
      border-radius: var(--radius-xl);
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25);
      border: 1px solid rgba(255,255,255,0.05);
      min-height: 300px;
    }

    .terminal__header {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      background: rgba(255,255,255,0.04);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .terminal__controls {
      display: flex;
      gap: 6px;
    }

    .terminal__dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      &--red    { background: #ff5f57; }
      &--yellow { background: #febc2e; }
      &--green  { background: #28c840; }
    }

    .terminal__title {
      flex: 1;
      text-align: center;
      font-size: var(--text-xs);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: rgba(255,255,255,0.6);
    }

    .terminal__spacer {
      width: 54px;
    }

    .terminal__body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-3);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12.5px;
      line-height: 1.5;
      color: #e6edf3;
    }

    .terminal__empty {
      color: rgba(255,255,255,0.4);
      font-style: italic;
      padding: var(--space-4);
      text-align: center;
    }

    .terminal__line {
      display: grid;
      grid-template-columns: 72px 48px 60px 1fr;
      gap: var(--space-2);
      align-items: start;
      padding: 1px 0;
      word-break: break-word;
      white-space: pre-wrap;

      &--error .terminal__msg { color: #ff6b6b; }
      &--warn  .terminal__msg { color: #ffd166; }
      &--info  .terminal__msg { color: #4fc3f7; }
      &--debug .terminal__msg { color: rgba(255,255,255,0.5); }
    }

    .terminal__time {
      color: rgba(255,255,255,0.4);
      font-size: 11px;
    }

    .terminal__source {
      color: #a5b4fc;
      font-weight: 600;
    }

    .terminal__line--source-browser .terminal__source {
      color: #fca5a5;
    }

    .terminal__level {
      text-transform: uppercase;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: rgba(255,255,255,0.5);

      .terminal__line--error & { color: #ff6b6b; }
      .terminal__line--warn  & { color: #ffd166; }
      .terminal__line--info  & { color: #4fc3f7; }
    }

    .terminal__msg {
      color: #e6edf3;
    }

    .terminal__stack {
      grid-column: 2 / -1;
      color: rgba(255,255,255,0.5);
      font-size: 11px;
      margin: 0;
      padding-left: var(--space-2);
      border-left: 2px solid rgba(255,107,107,0.4);
    }
  `]
})
export class LogsComponent implements OnInit, OnDestroy, AfterViewChecked {
  logService = inject(LogService);

  @ViewChild('bodyEl') bodyEl!: ElementRef<HTMLDivElement>;

  sourceOptions: FilterOption<LogSource | 'all'>[] = [
    { value: 'all', label: 'Todos' },
    { value: 'server', label: 'Servidor' },
    { value: 'browser', label: 'Cliente' }
  ];

  levelOptions: FilterOption<LogLevel | 'all'>[] = [
    { value: 'all', label: 'Todos los niveles' },
    { value: 'error', label: 'Error' },
    { value: 'warn', label: 'Warning' },
    { value: 'info', label: 'Info' },
    { value: 'log', label: 'Log' },
    { value: 'debug', label: 'Debug' }
  ];

  filtered = computed<LogEntry[]>(() =>
    this.logService.logs().filter(e => this.logService.isVisible(e))
  );
  visibleCount = computed(() => this.filtered().length);
  private lastLen = 0;

  ngOnInit(): void {
    this.logService.connect();
  }

  ngOnDestroy(): void {
    this.logService.disconnect();
  }

  ngAfterViewChecked(): void {
    if (!this.bodyEl) return;
    const el = this.bodyEl.nativeElement;
    const logs = this.logService.logs();
    if (this.logService.autoScroll() && logs.length !== this.lastLen) {
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight;
      });
      this.lastLen = logs.length;
    }
  }

  onSourceChange(v: string): void {
    this.logService.setSourceFilter(v as any);
  }

  onLevelChange(v: string): void {
    this.logService.setLevelFilter(v as any);
  }

  clearLogs(): void {
    if (confirm('¿Borrar todos los logs?')) {
      this.logService.clear();
    }
  }

  formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      const ms = String(d.getMilliseconds()).padStart(3, '0');
      return `${hh}:${mm}:${ss}.${ms}`;
    } catch { return iso; }
  }

  levelTag(level: string): string {
    return level.toUpperCase().slice(0, 5);
  }
}
