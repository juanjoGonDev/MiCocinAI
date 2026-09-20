import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CalendarDayView,
  CalendarMeal,
  HOUSEHOLD_EVENT_META,
  HouseholdEvent,
  MEAL_TYPE_META,
  MealType,
  eventTimeLabel
} from '../../shared/models/calendar.model';
import {
  HOUR_HEIGHT_PX,
  MEAL_ANCHOR_MINUTES,
  GridItem,
  PlacedBlock,
  allDayOf,
  hoursOf,
  mealTypeForMinutes,
  minutesAtOffset,
  minutesFromTime,
  nowMinutes,
  placeDay,
  scrollTopFor,
  timeFromMinutes,
  windowFor
} from '../../core/calendar-grid';

/**
 * Lo que se pinta en la rejilla. Añade al item geometrico de `calendar-grid` lo que hace falta para
 * pintar (de donde viene y a quien se le avisa): la geometria no conoce `CalendarMeal` ni
 * `HouseholdEvent`, y asi puede seguir probandose con numeros sueltos.
 */
interface TimelineItem extends GridItem {
  kind: 'meal' | 'event';
  meal?: CalendarMeal;
  mealType?: MealType;
  event?: HouseholdEvent;
}
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import { IconButtonComponent } from '../../shared/components/ui/icon-button/icon-button.component';
import { AvatarComponent } from '../../shared/components/ui/avatar/avatar.component';

/**
 * La rejilla de horas del día y de la semana —el sustituto de las cuatro franjas de comida.
 *
 * Por que no son franjas: una franja por «desayuno/almuerzo/cena/merienda» pinta el día como un
 * cuestionario de comidas y no deja sitio para nada que no sea comer (una cita a las 9:30 caia en la
 * franja del desayuno, que es peor que no tenerla). Aquí el eje es la hora, como en cualquier
 * calendario que la gente ya sabe leer, y la comida es UNA COSA MAS con su color y su etiqueta.
 *
 * Por que no se ven 24 horas: `windowFor` recorta la vista a lo que hay (mas una hora de aire por
 * lado, redondeado a hora en punto). Enseñar las 24 y dejar que el usuario busque es lo que hacia
 * esta pantalla antes, con la diferencia de que antes no habia nada que buscar.
 *
 * La geometria no vive aqui: vive en `core/calendar-grid.ts`, que es un fichero de numeros y por eso
 * se puede probar. Este componente solo pinta lo que aquellos numeros dicen.
 */
@Component({
  selector: 'app-calendar-timeline',
  standalone: true,
  imports: [CommonModule, IconComponent, IconButtonComponent, AvatarComponent],
  template: `
    <div class="tl" [class.tl--single]="single()" [style.--hour-px]="hourPx">
      <!-- Cabecera: el hueco de las horas + una columna por dia. -->
      <div class="tl__head" [style.grid-template-columns]="columns()">
        <span class="tl__gutter" aria-hidden="true"></span>
        @for (day of days; track day.iso) {
          <div class="tl__dayhead" [class.is-today]="day.isToday">
            <button
              type="button"
              class="tl__daynum"
              [attr.aria-current]="day.isToday ? 'date' : null"
              [title]="'Ver el día ' + day.iso"
              (click)="openDay.emit(day.iso)"
            >
              <span class="tl__dow">{{ dayLabel(day) }}</span>
              <span class="tl__num">{{ dayNumber(day) }}</span>
            </button>
            <!-- Las calorias del dia viven aqui desde que la vista de dia es la misma rejilla: era lo
                 unico que la vista antigua aportaba, y perderlo habria sido cambiar un diseno por una
                 perdida de funcion. -->
            @if (kitchen && (day.hasNutrition || (single() && targetCalories > 0))) {
              <span class="tl__kcal" data-test="timeline-kcal" [title]="kcalTip(day)">{{ kcalOf(day) }}</span>
            }
            @if (kitchen) {
              <app-icon-button
                icon="add"
                label="Añadir comida"
                size="sm"
                variant="ghost"
                data-test="timeline-add-meal"
                [attr.title]="'Añadir comida el ' + day.iso"
                (onClick)="onAddMeal(day)"
              />
            }
          </div>
        }
      </div>

      <!-- Banda de «todo el dia»: lo que no tiene hora no se inventa una. -->
      <div class="tl__band" [style.grid-template-columns]="columns()">
        <span class="tl__gutter tl__gutter--band">Todo el día</span>
        @for (day of days; track day.iso) {
          <div
            class="tl__bandcol"
            data-test="timeline-band"
            (click)="onBandClick(day)"
          >
            @for (item of bandOf(day); track item.id) {
              <button
                type="button"
                class="tl__chip"
                [style.--event-color]="colorOf(item)"
                [attr.title]="tipOf(item)"
                (click)="$event.stopPropagation(); onOpen(item)"
              >
                {{ titleOf(item) }}
              </button>
            }
            @if (!bandOf(day).length) {
              <span class="tl__bandempty" aria-hidden="true">—</span>
            }
          </div>
        }
      </div>

      <!-- La rejilla. Un scroll propio, con alturas fijas: es lo que hace que la cabecera no se vaya. -->
      <div class="tl__scroll" #scroll (click)="onGridClick($event)">
        <div class="tl__inner" [style.height.px]="heightPx()" [style.grid-template-columns]="columns()">
          <div class="tl__gutter tl__hours" aria-hidden="true">
            @for (hour of hourLabels(); track hour) {
              <span class="tl__hour">{{ hourLabel(hour) }}</span>
            }
          </div>

          @for (day of days; track day.iso) {
            <div
              class="tl__col"
              [class.is-today]="day.isToday"
              [attr.data-date]="day.iso"
              data-test="timeline-col"
            >

              @if (day.isToday && nowTop() !== null) {
                <span class="tl__now" [style.top.px]="nowTop()" aria-hidden="true"></span>
              }
              @for (block of blocksOf(day); track block.item.id) {
                <button
                  type="button"
                  class="tl__block"
                  [class.tl__block--meal]="block.item.kind === 'meal'"
                  [class.is-done]="block.item.meal?.completed"
                  [style.--event-color]="colorOf(block.item)"
                  [style.top.px]="block.topPx"
                  [style.height.px]="block.heightPx"
                  [style.left.%]="(block.column / block.columns) * 100"
                  [style.width.%]="100 / block.columns - 0.6"
                  [attr.title]="tipOf(block.item)"
                  [attr.data-test]="'timeline-block-' + block.item.kind"
                  (click)="$event.stopPropagation(); onOpen(block.item)"
                >
                  <span class="tl__block-when">{{ whenOf(block.item) }}</span>
                  <span class="tl__block-title">{{ titleOf(block.item) }}</span>
                  @if (facesOf(block.item).length) {
                    <!-- Las caras son identidad: la de quien escribio el evento (solo si no soy yo,
                         que para eso esta el boton de salir) y la de quien esta invitado. Un nombre sin
                         foto es media identidad, y media identidad es lo que hace preguntar «¿cuanta
                         Ana?» cuando en la casa hay dos. -->
                    <span class="tl__block-faces" aria-hidden="true">
                      @for (person of facesOf(block.item); track person.id) {
                        <app-avatar [name]="person.name" [src]="person.avatar ?? undefined" size="xs" [title]="person.who" />
                      }
                    </span>
                  }
                </button>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .tl {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
        overflow: hidden;
      }

      .tl__head,
      .tl__band,
      .tl__inner {
        display: grid;
        align-items: stretch;
      }

      .tl__head {
        border-bottom: 1px solid var(--border-default);
        background: var(--bg-tertiary);
      }

      .tl__gutter {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        padding: var(--space-2) var(--space-1);
        text-align: right;
        white-space: nowrap;
      }

      .tl__dayhead {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-1);
        padding: var(--space-1) var(--space-2);
        min-width: 0;
        border-left: 1px solid var(--border-default);
      }

      .tl__dayhead.is-today {
        background: color-mix(in srgb, var(--primary) 10%, transparent);
      }

      .tl__daynum {
        display: flex;
        align-items: baseline;
        gap: var(--space-1);
        min-width: 0;
        padding: 2px 4px;
        border: none;
        border-radius: var(--radius-sm);
        background: none;
        color: var(--text-primary);
        font: inherit;
        cursor: pointer;
      }

      .tl__daynum:hover {
        background: color-mix(in srgb, var(--primary) 16%, transparent);
      }

      .tl__dow {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .tl__kcal {
        font-size: 10px;
        font-variant-numeric: tabular-nums;
        color: var(--text-secondary);
        white-space: nowrap;
      }

      .tl__num {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        font-variant-numeric: tabular-nums;
      }

      .tl__band {
        border-bottom: 1px solid var(--border-default);
      }

      .tl__gutter--band {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        font-size: 10px;
      }

      .tl__bandcol {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
        align-content: center;
        min-height: 26px;
        min-width: 0;
        padding: 3px 4px;
        border-left: 1px solid var(--border-default);
        cursor: pointer;
      }

      .tl__chip {
        max-width: 100%;
        padding: 1px 6px;
        border: none;
        border-radius: var(--radius-full);
        background: color-mix(in srgb, var(--event-color, var(--primary)) 18%, var(--bg-secondary));
        color: var(--text-primary);
        font: inherit;
        font-size: 10px;
        line-height: 1.5;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
      }

      .tl__bandempty {
        color: var(--text-tertiary);
        font-size: 10px;
      }

      .tl__scroll {
        position: relative;
        /* Las 24 horas no caben en una pantalla, y a proposito no se fuerza que quepan: la ventana
           ya recorta, y si recorta mucho el usuario scrollea dos franjas, no doce. */
        max-height: min(62vh, 560px);
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      .tl__inner {
        position: relative;
      }

      .tl__hours {
        display: grid;
        grid-template-rows: repeat(auto-fill, var(--hour-px));
        padding-top: 0;
      }

      .tl__hour {
        height: var(--hour-px);
        padding: 0 var(--space-1);
        font-size: 10px;
        line-height: 1;
        color: var(--text-tertiary);
        text-align: right;
        transform: translateY(-5px);
        font-variant-numeric: tabular-nums;
      }

      .tl__col {
        position: relative;
        min-width: 0;
        border-left: 1px solid var(--border-default);
        cursor: copy;
      }

      .tl__col.is-today {
        background: color-mix(in srgb, var(--primary) 4%, transparent);
      }

      /* Lineas de hora y de media hora, pintadas por el fondo y no por elementos: una fila de DOM por
         cada linea seria 48 nodos por columna y siete columnas, para decorar. Con repeating-linear-gradient
         la rejilla no se desalinea nunca, porque el tamaño de fila es la UNICA cifra (--hour-px), que es
         la misma que usa la geometria para colocar los bloques. */
      .tl__col {
        background-image:
          repeating-linear-gradient(
            to bottom,
            var(--border-default) 0 1px,
            transparent 1px var(--hour-px)
          ),
          repeating-linear-gradient(
            to bottom,
            transparent 0 calc(var(--hour-px) / 2),
            color-mix(in srgb, var(--border-default) 45%, transparent) calc(var(--hour-px) / 2) calc(var(--hour-px) / 2 + 1px),
            transparent calc(var(--hour-px) / 2 + 1px) var(--hour-px)
          );
        background-size: 100% var(--hour-px), 100% var(--hour-px);
      }

      .tl__block {
        position: absolute;
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
        padding: 2px 4px;
        border: none;
        border-left: 3px solid var(--event-color, var(--primary));
        border-radius: 4px;
        background: color-mix(in srgb, var(--event-color, var(--primary)) 16%, var(--bg-secondary));
        color: var(--text-primary);
        font: inherit;
        font-size: 10px;
        line-height: 1.25;
        text-align: left;
        overflow: hidden;
        cursor: pointer;
        box-shadow: var(--shadow-xs);
        transition: var(--transition-fast);
      }

      .tl__block:hover {
        background: color-mix(in srgb, var(--event-color, var(--primary)) 28%, var(--bg-secondary));
      }

      .tl__block:focus-visible {
        outline: 2px solid var(--event-color, var(--primary));
        outline-offset: 1px;
      }

      .tl__block-when {
        color: var(--text-secondary);
        font-variant-numeric: tabular-nums;
      }

      .tl__block--meal .tl__block-when {
        /* Una comida sin hora escrita no lleva etiqueta: su posición es la hora media del tipo, y
           ponerle un reloj seria ensenar un dato que nadie escribio. */
        display: none;
      }

      .tl__block-title {
        font-weight: var(--font-medium);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tl__block.is-done .tl__block-title {
        text-decoration: line-through;
        color: var(--text-secondary);
      }

      .tl__block-faces {
        display: flex;
        gap: 2px;
        margin-top: 1px;
      }

      .tl__now {
        position: absolute;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--error);
        pointer-events: none;
      }

      .tl__now::before {
        content: '';
        position: absolute;
        left: -3px;
        top: -2px;
        width: 6px;
        height: 6px;
        border-radius: var(--radius-full);
        background: var(--error);
      }

      @media (max-width: 720px) {
        .tl__hour {
          font-size: 9px;
        }
        .tl__block {
          font-size: 9px;
        }
      }
    `
  ]
})
export class CalendarTimelineComponent implements AfterViewInit, OnChanges {
  @Input() days: CalendarDayView[] = [];
  /** Con la cocina apagada no hay comidas que pintar: la rejilla es solo agenda. */
  @Input() kitchen = true;
  /** El objetivo del día, para que la cifra de kcal signifique algo en lugar de ser un número suelto. */
  @Input() targetCalories = 0;

  @Output() openMeal = new EventEmitter<CalendarMeal>();
  @Output() toggleMeal = new EventEmitter<CalendarMeal>();
  @Output() removeMeal = new EventEmitter<CalendarMeal>();
  @Output() editEvent = new EventEmitter<HouseholdEvent>();
  @Output() addMeal = new EventEmitter<{ date: string; mealType: MealType; time?: string }>();
  @Output() addEvent = new EventEmitter<{ date: string; startTime: string }>();
  @Output() openDay = new EventEmitter<string>();

  @ViewChild('scroll') private scroller?: ElementRef<HTMLDivElement>;

  /** El ancho de las franjas vacias, y si el click ha caido en una. */
  private readonly stepMinutes = 30;

  protected readonly gridItems = signal<Map<string, TimelineItem[]>>(new Map());
  protected readonly window = signal({ startMinutes: 0, endMinutes: 60 });

  readonly single = computed(() => this.days.length === 1);

  readonly hourLabels = computed(() => hoursOf(this.window()));

  readonly heightPx = computed(() => {
    const { startMinutes, endMinutes } = this.window();
    return ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT_PX;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['days'] || changes['kitchen']) this.rebuild();
  }

  ngAfterViewInit(): void {
    this.scrollToStart();
  }

  protected columns(): string {
    // 46 px de gutter para las etiquetas de hora y el resto repartido. El gutter es fijo en px por el
    // ancho de «22:00»: si fuera liquido, etiquetas y lineas dejarian de alinear en la vista de día,
    // que es donde mas se nota.
    return `46px repeat(${Math.max(1, this.days.length)}, minmax(0, 1fr))`;
  }

  /** La altura de hora, una sola vez: la geometria y el CSS tienen que medir lo mismo. */
  protected readonly hourPx = `${HOUR_HEIGHT_PX}px`;

  protected blocksOf(day: CalendarDayView): PlacedBlock<TimelineItem>[] {
    return placeDay(this.gridItems().get(day.iso) ?? [], this.window());
  }

  protected bandOf(day: CalendarDayView): TimelineItem[] {
    return allDayOf(this.gridItems().get(day.iso) ?? []);
  }

  protected nowTop(): number | null {
    const today = this.days.some((day) => day.isToday);
    if (!today) return null;
    const now = nowMinutes();
    const { startMinutes, endMinutes } = this.window();
    if (now < startMinutes || now > endMinutes) return null;
    return ((now - startMinutes) / 60) * HOUR_HEIGHT_PX;
  }

  protected dayLabel(day: CalendarDayView): string {
    return new Intl.DateTimeFormat('es-ES', { weekday: 'short' })
      .format(day.date)
      .replace('.', '')
      .toUpperCase();
  }

  protected dayNumber(day: CalendarDayView): string {
    return String(day.date.getDate());
  }

  /**
   * Quien sale en la foto del bloque. El autor solo aparece cuando NO es esta cuenta: si no, cada
   * bloque propio llevaria la cara del dueño repetida siete veces por semana.
   */
  protected facesOf(item: TimelineItem): { id: string; name: string; avatar?: string | null; who: string }[] {
    const event = item.event;
    if (!event) return [];
    const faces: { id: string; name: string; avatar?: string | null; who: string }[] = [];
    // `userId` es quien escribio el evento; `editable` ya lo dice el servidor, y es lo que separa
    // «esto es mio, se edita» de «esto es de otra persona, me puedo salir».
    if (event.editable === false && event.userId) {
      faces.push({ id: event.userId, name: event.authorName ?? 'Alguien', avatar: event.authorAvatar, who: `Lo apunto ${event.authorName ?? 'otra persona'}` });
    }
    for (const person of event.attendees ?? []) {
      faces.push({ id: person.id, name: person.name, avatar: person.avatar, who: `Invitado: ${person.name}` });
    }
    return faces;
  }

  protected kcalTip(day: CalendarDayView): string {
    const bits = [`${this.fmt(day.calories)} kcal`];
    if (this.targetCalories > 0) bits.push(`objetivo ${this.fmt(this.targetCalories)}`);
    if (day.planned > 0) bits.push(`${day.done} de ${day.planned} hechas`);
    return bits.join(' · ');
  }

  protected kcalOf(day: CalendarDayView): string {
    // En la vista de día el número suelto no dice nada: alli SI cabe el denominador, porque hay sitio
    // para una linea. En la semana, un «0 kcal» bajo cada día seria ruido.
    if (this.single() && this.targetCalories > 0) {
      return `${this.fmt(day.calories)} / ${this.fmt(this.targetCalories)} kcal`;
    }
    return `${this.fmt(day.calories)} kcal`;
  }

  protected fmt(value: number): string {
    return new Intl.NumberFormat('es-ES').format(Math.round(value ?? 0));
  }

  protected hourLabel(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`;
  }

  protected colorOf(item: TimelineItem): string {
    if (item.kind === 'event') return item.event?.color ?? HOUSEHOLD_EVENT_META[item.event?.kind ?? 'other'].color;
    return item.mealType ? MEAL_TYPE_META[item.mealType].color : 'var(--primary)';
  }

  protected titleOf(item: TimelineItem): string {
    return item.kind === 'event' ? (item.event?.title ?? '') : (item.meal?.title ?? '');
  }

  protected whenOf(item: TimelineItem): string {
    if (item.kind === 'event' && item.event) return eventTimeLabel(item.event);
    // Solo la hora ESCRITA se pinta: la ancla del tipo es posición, no dato del usuario, y
    // imprimirla seria ensenar un reloj que nadie puso. Lo que si cabe es el nombre del tipo, que es
    // el dato real (una comida generada por la IA tiene tipo, no tiene hora).
    if (item.timed && item.meal?.time) return item.meal.time;
    return item.mealType ? MEAL_TYPE_META[item.mealType].label : '';
  }

  protected tipOf(item: TimelineItem): string {
    const parts = [this.titleOf(item)];
    const when = this.whenOf(item);
    if (when) parts.push(when);
    if (item.allDay) parts.push('todo el día');
    if (item.kind === 'event' && item.event) {
      if (item.event.authorName) parts.push(`de ${item.event.authorName}`);
      const invited = (item.event.attendees ?? []).map((person) => person.name);
      if (invited.length) parts.push(`con ${invited.join(', ')}`);
    }
    if (item.kind === 'meal' && item.mealType) parts.push(MEAL_TYPE_META[item.mealType].label);
    return parts.filter(Boolean).join(' · ');
  }

  protected onOpen(item: TimelineItem): void {
    if (item.kind === 'meal' && item.meal) this.openMeal.emit(item.meal);
    else if (item.kind === 'event' && item.event) this.editEvent.emit(item.event);
  }

  protected onAddMeal(day: CalendarDayView): void {
    // La hora por defecto es la que se esta viviendo si el día es hoy, y una comida de mediodia si
    // se planifica para manana: son los dos unicos casos con sentido, y evitar preguntar es el
    // motivo de existir de este boton.
    const minutes = day.isToday ? nowMinutes() : 14 * 60;
    this.addMeal.emit({
      date: day.iso,
      mealType: mealTypeForMinutes(minutes),
      time: day.isToday ? timeFromMinutes(minutes) : undefined
    });
  }

  protected onGridClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const column = target.closest<HTMLElement>('.tl__col');
    if (!column) return; // un click sobre un bloque ya tiene su propia accion
    const date = column.dataset['date'];
    if (!date) return;
    const rect = column.getBoundingClientRect();
    const minutes = minutesAtOffset(event.clientY - rect.top, this.window(), this.stepMinutes);
    this.addEvent.emit({ date, startTime: timeFromMinutes(minutes) });
  }

  protected onBandClick(day: CalendarDayView): void {
    // «Todo el día» sin hora: un evento que ocupa la franja, no las 00:00.
    this.addEvent.emit({ date: day.iso, startTime: '' });
  }

  private rebuild(): void {
    const map = new Map<string, TimelineItem[]>();
    const all: TimelineItem[] = [];
    for (const day of this.days) {
      const items: TimelineItem[] = [];
      if (this.kitchen) {
        for (const meal of day.meals) {
          const written = minutesFromTime(meal.time);
          // Sin hora escrita la comida va a su ancla del día (desayuno arriba, cena abajo). La ancla
          // es posición, no dato: `timed: false` hace que el bloque no ensene ninguna hora.
          const start = written ?? MEAL_TYPE_ANCHOR[meal.mealType];
          items.push({
            id: `meal-${meal.id}`,
            date: day.iso,
            kind: 'meal',
            startMinutes: start,
            // Una comida dura hora y media: es lo que se ve, no lo que alguien escribio.
            endMinutes: start + 90,
            timed: written !== null,
            allDay: false,
            meal,
            mealType: meal.mealType
          });
        }
      }
      for (const event of day.events) {
        const start = minutesFromTime(event.startTime);
        const end = minutesFromTime(event.endTime);
        items.push({
          id: `event-${event.id}`,
          date: day.iso,
          kind: 'event',
          startMinutes: start ?? 9 * 60,
          // Sin hora de fin el bloque dura una hora; «hasta el final del día» pintaria una barra
          // enorme para una nota de cinco minutos.
          endMinutes: start === null ? 1440 : Math.max(start + 30, end ?? start + 60),
          timed: start !== null,
          allDay: event.allDay || start === null,
          event
        });
      }
      map.set(day.iso, items);
      all.push(...items);
    }
    this.gridItems.set(map);
    this.window.set(windowFor(all, { minHours: this.days.length === 1 ? 6 : 8 }));
  }

  private scrollToStart(): void {
    const scroller = this.scroller?.nativeElement;
    if (!scroller) return;
    const today = this.days.some((day) => day.isToday);
    const items = this.days.flatMap((day) => this.gridItems().get(day.iso) ?? []);
    scroller.scrollTop = scrollTopFor(this.window(), items, today);
  }
}

/**
 * Las anclas del día vienen de `calendar-grid`, que es donde se prueban; el alias existe para que la
 * lectura del `rebuild` no dependa de saber de donde sale cada número.
 */
const MEAL_TYPE_ANCHOR = MEAL_ANCHOR_MINUTES;
