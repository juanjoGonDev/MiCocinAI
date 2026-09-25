import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ReceiptsService } from '../../../core/services/receipts.service';
import { IconComponent } from '../ui/icon/icon.component';
import { ButtonComponent } from '../ui/button/button.component';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import type { ReceiptJob } from '../../../shared/models/receipt.model';

/**
 * El icono de la cola de lectura de tickets (HOGARIA-SPEC ## 12aj): la única puerta de la app
 * que siempre enseña qué está haciendo la IA LOCAL por dentro.
 *
 * Tres caras, una sola pieza:
 *  - **Procesando** (queued o running): un ANILLO QUE GIRA alrededor del icono —el círculo
 *    de carga del parte— mientras el modelo lee el ticket.
 *  - **Error** (algún failed): el mismo anillo, pero quieto y con BORDE ROJO, que no hay
 *    nada más ruidoso que un fallo silencioso.
 *  - **Vacío**: el icono apagado, y el clic lleva a la bandeja de tickets.
 *
 * El clic abre el panel: progreso de cada trabajo (líneas leídas, intento n de m), parar
 * TODO de golpe, o parar/reintentar un trabajo individual. Vive en la cabecera del layout,
 * así que la cola se sigue viendo moverse al navegar entre secciones.
 */
@Component({
  selector: 'app-receipt-queue',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent, ButtonComponent, TranslatePipe],
  template: `
    <div class="rq" (keydown.escape)="panelOpen.set(false)">
      <button
        type="button"
        class="rq__button"
        [class.rq__button--busy]="procesando()"
        [class.rq__button--error]="conErrores()"
        [attr.aria-label]="'receipts.cola_de_lectura' | t"
        [attr.data-count]="activo()"
        (click)="togglePanel()"
        data-test="receipt-queue-icon"
      >
        <!-- El anillo: girando mientras lee, quieto y rojo si algo falló. -->
        <span class="rq__ring" aria-hidden="true"></span>
        <app-icon name="receipt_long" [size]="20" [label]="null" />
        @if (activo() > 0) {
          <span class="rq__badge" aria-hidden="true">{{ activo() }}</span>
        }
      </button>

      @if (panelOpen()) {
        <div
          class="rq__panel"
          role="dialog"
          [attr.aria-label]="'receipts.cola_de_lectura' | t"
          data-test="receipt-queue-panel"
        >
          <header class="rq__panel-head">
            <span class="rq__panel-title">{{ 'receipts.cola_de_lectura' | t }}</span>
            @if (detenibles().length > 0) {
              <app-button
                variant="ghost"
                size="sm"
                type="button"
                [loading]="service.queueBusy()"
                (onClick)="pararTodo()"
              >
                {{ 'receipts.parar_todo' | t }}
              </app-button>
            }
          </header>

          @if (trabajos().length === 0) {
            <div class="rq__empty">
              <span class="rq__empty-title">{{ 'receipts.nada_en_cola' | t }}</span>
              <span class="rq__empty-hint">{{ 'receipts.nada_en_cola_hint' | t }}</span>
            </div>
          } @else {
            <ul class="rq__jobs">
              @for (trabajo of trabajos(); track trabajo.id) {
                <li
                  class="rq__job"
                  [class.rq__job--failed]="trabajo.status === 'failed'"
                  [attr.data-test]="'queue-job-' + trabajo.status"
                >
                  <!-- El circulito de estado: girando si corre, rojo si falló. -->
                  <span
                    class="rq__job-dot"
                    [class.rq__job-dot--running]="trabajo.status === 'running'"
                    [class.rq__job-dot--failed]="trabajo.status === 'failed'"
                    aria-hidden="true"
                  ></span>
                  <div class="rq__job-main">
                    <a
                      class="rq__job-name"
                      [routerLink]="['/receipts', trabajo.receipt_id]"
                      (click)="panelOpen.set(false)"
                    >
                      {{ trabajo.store || trabajo.file_name || ('receipts.titulo' | t) }}
                    </a>
                    <span class="rq__job-meta">
                      @if (trabajo.status === 'running' || trabajo.status === 'queued') {
                        {{
                          (trabajo.status === 'running'
                            ? 'receipts.en_curso'
                            : 'receipts.estado.queued'
                          ) | t
                        }}
                        ·
                        {{
                          trabajo.items > 0
                            ? ('receipts.lineas' | t: { n: trabajo.items })
                            : ('receipts.nada_leido_todavia' | t)
                        }}
                      } @else if (trabajo.status === 'failed') {
                        {{ 'receipts.estado.failed' | t }} ·
                        {{
                          'receipts.intentos' | t: { n: trabajo.attempts, m: trabajo.max_attempts }
                        }}
                      } @else {
                        {{ 'receipts.parado' | t }}
                      }
                    </span>
                  </div>
                  <div class="rq__job-actions">
                    @if (trabajo.status === 'queued' || trabajo.status === 'running') {
                      <app-button
                        variant="ghost"
                        size="sm"
                        type="button"
                        (onClick)="pararUno(trabajo)"
                      >
                        {{ 'receipts.parar' | t }}
                      </app-button>
                    } @else if (trabajo.status === 'failed' || trabajo.status === 'stopped') {
                      <app-button
                        variant="outline"
                        size="sm"
                        type="button"
                        (onClick)="reintentarUno(trabajo)"
                      >
                        {{ 'receipts.reintentar' | t }}
                      </app-button>
                    }
                    <app-button
                      variant="ghost"
                      size="sm"
                      type="button"
                      [routerLink]="['/receipts', trabajo.receipt_id]"
                      (onClick)="panelOpen.set(false)"
                    >
                      {{ 'receipts.abrir' | t }}
                    </app-button>
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .rq {
        position: relative;
        display: inline-flex;
      }

      .rq__button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: var(--radius-full, 999px);
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }

      .rq__button:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }

      /* El anillo de carga del parte: mientras la IA local lee, gira. */
      .rq__ring {
        position: absolute;
        inset: 3px;
        border-radius: 999px;
        border: 2px solid transparent;
        pointer-events: none;
      }

      .rq__button--busy .rq__ring {
        border-top-color: var(--primary, #4f7df9);
        border-right-color: var(--primary, #4f7df9);
        animation: rq-girar 0.9s linear infinite;
      }

      /* El error no gira: se queda quieto y ROJO, que es lo que se ve desde el otro lado
         de la habitacion. */
      .rq__button--error .rq__ring {
        border-color: var(--danger, #d64545);
        border-top-color: var(--danger, #d64545);
      }

      .rq__button--busy,
      .rq__button--error {
        color: var(--text-primary);
      }

      .rq__button--error {
        color: var(--danger, #d64545);
      }

      .rq__badge {
        position: absolute;
        top: 1px;
        right: 0;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        border-radius: 999px;
        background: var(--primary, #4f7df9);
        color: #fff;
        font-size: 10px;
        font-weight: var(--font-bold, 700);
        line-height: 16px;
        text-align: center;
      }

      @keyframes rq-girar {
        to {
          transform: rotate(360deg);
        }
      }

      .rq__panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 60;
        width: min(380px, calc(100vw - 32px));
        padding: var(--space-3, 12px);
        border: 1px solid var(--border-color, #e2e5ea);
        border-radius: var(--radius-lg, 12px);
        background: var(--bg-primary, #fff);
        box-shadow: var(--shadow-lg, 0 12px 32px rgba(16, 24, 40, 0.16));
      }

      .rq__panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-2, 8px);
      }

      .rq__panel-title {
        font-size: var(--text-sm, 14px);
        font-weight: var(--font-semibold, 600);
        color: var(--text-primary);
      }

      .rq__empty {
        display: grid;
        gap: 2px;
        padding: var(--space-2, 8px) 0;
      }

      .rq__empty-title {
        font-size: var(--text-sm, 14px);
        color: var(--text-primary);
        font-weight: var(--font-medium, 500);
      }

      .rq__empty-hint {
        font-size: var(--text-xs, 12px);
        color: var(--text-secondary);
      }

      .rq__jobs {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        max-height: 320px;
        overflow-y: auto;
      }

      .rq__job {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-2, 8px) 0;
        border-top: 1px solid var(--border-color, #eef0f3);
      }

      .rq__job:first-child {
        border-top: none;
      }

      .rq__job-dot {
        width: 10px;
        height: 10px;
        flex: none;
        border-radius: 999px;
        background: var(--text-tertiary, #9aa1ab);
      }

      .rq__job-dot--running {
        background: var(--primary, #4f7df9);
        animation: rq-latir 1.1s ease-in-out infinite;
      }

      .rq__job-dot--failed {
        background: var(--danger, #d64545);
      }

      @keyframes rq-latir {
        50% {
          transform: scale(1.45);
        }
      }

      .rq__job-main {
        flex: 1;
        min-width: 0;
        display: grid;
        gap: 1px;
      }

      .rq__job-name {
        font-size: var(--text-sm, 14px);
        font-weight: var(--font-medium, 500);
        color: var(--text-primary);
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .rq__job-name:hover {
        text-decoration: underline;
      }

      .rq__job-meta {
        font-size: var(--text-xs, 12px);
        color: var(--text-secondary);
      }

      .rq__job--failed .rq__job-meta {
        color: var(--danger, #d64545);
      }

      .rq__job-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: none;
      }
    `
  ]
})
export class ReceiptQueueComponent implements OnInit, OnDestroy {
  readonly service = inject(ReceiptsService);
  private readonly router = inject(Router);

  readonly panelOpen = signal(false);

  /** Los trabajos que aún cuentan para el badge: en cola, corriendo o con fallo. */
  readonly trabajos = computed(() => this.service.queue().jobs);
  readonly procesando = computed(
    () => this.service.queue().counts.queued + this.service.queue().counts.running > 0
  );
  readonly conErrores = computed(
    () => this.service.queue().counts.failed > 0 && !this.procesando()
  );
  readonly activo = computed(() => this.trabajos().length);
  readonly detenibles = computed(() =>
    this.trabajos().filter((trabajo) => trabajo.status === 'queued' || trabajo.status === 'running')
  );

  ngOnInit(): void {
    this.service.watch();
  }

  ngOnDestroy(): void {
    this.service.unwatch();
  }

  togglePanel(): void {
    this.panelOpen.update((abierto) => !abierto);
  }

  async pararTodo(): Promise<void> {
    await this.service.stopAll();
    await firstValueFrom(this.service.refreshQueue());
  }

  async pararUno(trabajo: ReceiptJob): Promise<void> {
    if (!trabajo.receipt_id) return;
    await this.service.stopJob(trabajo.receipt_id);
    await firstValueFrom(this.service.refreshQueue());
  }

  async reintentarUno(trabajo: ReceiptJob): Promise<void> {
    if (!trabajo.receipt_id) return;
    await this.service.retryJob(trabajo.receipt_id);
    await firstValueFrom(this.service.refreshQueue());
  }
}
