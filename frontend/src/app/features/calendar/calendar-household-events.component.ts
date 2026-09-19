import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import {
  HOUSEHOLD_EVENT_META,
  HouseholdEvent,
  eventTimeLabel
} from '../../shared/models/calendar.model';

/**
 * Las sueltas de la casa dentro de una celda (HOGARIA-SPEC §8f).
 *
 * Componente aparte en vez de marcar el HTML en cada vista por el mismo motivo que
 * `app-calendar-event`: en mes son una linea de 11 px, en semana un bloque corto y en el
 * dia la linea entera, y eso es color, sangria y orden — no tres versiones de lo mismo que
 * divergen en cuanto alguien cambia una.
 *
 * Con `dense` (mes) no se pinta quien la escribio: en una celda de 90 px el nombre del autor
 * se come el titulo, que es lo que de verdad interesa ahi dentro.
 */
@Component({
  selector: 'app-calendar-household-events',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    @for (event of events; track event.id) {
      <button
        type="button"
        class="cal-evt"
        [class.cal-evt--done]="dense && event.allDay"
        [style.--event-color]="event.color ?? metaOf(event).color"
        [attr.title]="tip(event)"
        [attr.data-test]="'household-event' + (dense ? '-dense' : '')"
        (click)="$event.stopPropagation(); edit.emit(event)"
      >
        <span class="cal-evt__dot" aria-hidden="true"></span>
        @if (!dense) {
          <app-icon [name]="metaOf(event).icon" [size]="12" [label]="null" />
        }
        <span class="cal-evt__title">{{ event.title }}</span>
        @if (timeOf(event)) {
          <span class="cal-evt__when">{{ timeOf(event) }}</span>
        }
        @if (!dense && event.authorName) {
          <span class="cal-evt__who">{{ initialsOf(event) }}</span>
        }
      </button>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .cal-evt {
        display: flex;
        align-items: center;
        gap: 4px;
        width: 100%;
        border: none;
        border-left: 3px solid var(--event-color, var(--primary));
        border-radius: 4px;
        background: color-mix(in srgb, var(--event-color, var(--primary)) 12%, transparent);
        color: var(--text-primary);
        font-family: inherit;
        font-size: 11px;
        line-height: 1.25;
        text-align: left;
        padding: 2px 4px;
        margin-top: 2px;
        cursor: pointer;
        overflow: hidden;
        transition: var(--transition-fast);
      }
      .cal-evt:hover {
        background: color-mix(in srgb, var(--event-color, var(--primary)) 22%, transparent);
      }
      .cal-evt__dot {
        width: 6px;
        height: 6px;
        border-radius: var(--radius-full);
        background: var(--event-color, var(--primary));
        flex: 0 0 auto;
      }
      .cal-evt__title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cal-evt--done .cal-evt__title {
        text-decoration: line-through;
        color: var(--text-tertiary);
      }
      .cal-evt__when {
        color: var(--text-tertiary);
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
      }
      .cal-evt__who {
        margin-left: auto;
        font-size: 9px;
        color: var(--text-tertiary);
        text-transform: uppercase;
        flex: 0 0 auto;
      }
    `
  ]
})
export class CalendarHouseholdEventsComponent {
  @Input() events: HouseholdEvent[] = [];
  @Input() dense = false;
  @Output() edit = new EventEmitter<HouseholdEvent>();

  metaOf(event: HouseholdEvent) {
    return HOUSEHOLD_EVENT_META[event.kind] ?? HOUSEHOLD_EVENT_META.other;
  }

  timeOf(event: HouseholdEvent): string {
    return this.dense ? '' : eventTimeLabel(event);
  }

  tip(event: HouseholdEvent): string {
    const when = eventTimeLabel(event);
    const who = event.authorName ? ` · de ${event.authorName}` : '';
    return `${event.title}${when ? ' · ' + when : ''}${this.metaOf(event).label ? ' · ' + this.metaOf(event).label : ''}${who}`;
  }

  initialsOf(event: HouseholdEvent): string {
    const parts = String(event.authorName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
}
