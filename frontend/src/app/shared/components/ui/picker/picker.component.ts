import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-paths';

export type PickerOption = { value: string; label: string; hint?: string; color?: string | null; disabled?: boolean };

/**
 * Selector propio, en vez de `select` nativo (HOGARIA-SPEC §8f).
 *
 * El nativo no se puede pintar con el tema (en Android abre el dialogo del sistema con
 * sus colores, y en iOS una rueda), no admite color por opcion —que en una seccion de la
 * compra ES informacion— y no deja escribir un valor que no esta en la lista, que es
 * justo lo que hace falta con las unidades: «bote de 400 g» no cabe en un enum.
 *
 * Lo que si tiene, y por eso no es un capricho estetico:
 *  - filtro al escribir (una lista de 60 unidades se recorre con el pulgar),
 *  - teclado completo: flechas, Enter, Escape, y se cierra al hacer clic fuera,
 *  - `allowCustom`: la cadena tecleada es un valor valido, no se pierde,
 *  - y el disparador dice SIEMPRE lo que hay dentro, no un placeholder amable.
 */
@Component({
  selector: 'app-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="picker" #root>
      <button
        type="button"
        class="picker__trigger"
        [class.picker__trigger--open]="open()"
        [class.picker__trigger--empty]="!selectedLabel"
        [attr.aria-expanded]="open()"
        [attr.aria-haspopup]="'listbox'"
        [attr.aria-controls]="open() ? listId() : null"
        [disabled]="disabled"
        (click)="toggle()"
        (keydown)="onListKeys($event, true)"
      >
        @if (leadingIcon) {
          <app-icon [name]="leadingIcon" [size]="18" [label]="null" />
        }
        <span class="picker__value">{{ selectedLabel || placeholder }}</span>
        @if (selectedOption()?.color) {
          <span class="picker__dot" [style.background]="selectedOption()?.color" aria-hidden="true"></span>
        }
        <app-icon class="picker__caret" name="expand_more" [size]="20" [label]="null" />
      </button>

      @if (open()) {
        <div class="picker__panel" [id]="listId()" role="listbox" [attr.aria-label]="label" (keydown)="onListKeys($event, false)">
          @if (options.length > filterFrom) {
            <div class="picker__search">
              <app-icon name="search" [size]="16" [label]="null" />
              <input
                #search
                type="text"
                name="pickerQuery"
                [(ngModel)]="query"
                [placeholder]="searchPlaceholder"
                autocomplete="off"
                (keydown)="onSearchKeys($event)"
              />
            </div>
          }
          <ul class="picker__list">
            @if (allowCustom && query.trim() && !exactMatch) {
              <li class="picker__option picker__option--custom" role="option" [attr.aria-selected]="active() === -1" (click)="useCustom()">
                <app-icon name="add" [size]="18" [label]="null" />
                <span>{{ query.trim() }}</span>
                <span class="picker__tag">usar este texto</span>
              </li>
            }
            @for (option of filtered(); track option.value; let i = $index) {
              <li
                class="picker__option"
                role="option"
                [class.picker__option--active]="active() === i"
                [attr.aria-selected]="isSelected(option)"
                [attr.aria-disabled]="option.disabled || null"
                [attr.id]="listId() + '-' + i"
                (click)="choose(option)"
                (mouseenter)="active.set(i)"
              >
                @if (option.color) {
                  <span class="picker__dot" [style.background]="option.color" aria-hidden="true"></span>
                }
                <span class="picker__label">{{ option.label }}</span>
                @if (option.hint) {
                  <span class="picker__hint">{{ option.hint }}</span>
                }
                @if (isSelected(option)) {
                  <app-icon class="picker__check" name="check" [size]="18" [label]="'seleccionado: ' + option.label" />
                }
              </li>
            }
            @if (filtered().length === 0 && !(allowCustom && query.trim())) {
              <li class="picker__none">
                {{ emptyText }}
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }
      .picker__trigger {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        width: 100%;
        min-height: 44px;
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-family: inherit;
        cursor: pointer;
        transition: var(--transition-fast);
      }
      .picker__trigger:hover:not(:disabled) {
        border-color: var(--border-strong);
      }
      .picker__trigger--open {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px var(--primary-soft, rgba(63, 142, 96, 0.18));
      }
      .picker__trigger:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .picker__value {
        flex: 1 1 auto;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .picker__trigger--empty .picker__value {
        color: var(--text-tertiary);
      }
      .picker__caret {
        color: var(--text-tertiary);
        transition: transform var(--transition-fast);
      }
      .picker__trigger--open .picker__caret {
        transform: rotate(180deg);
      }
      .picker__dot {
        width: 10px;
        height: 10px;
        border-radius: var(--radius-full);
        flex: 0 0 auto;
      }
      .picker__panel {
        position: absolute;
        z-index: 30;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.14));
        padding: var(--space-1);
        animation: picker-in 0.14s ease-out;
      }
      /* No hay scale/opacity de medio segundo: un menu que se abre tiene que estar
         debajo del dedo antes de que se levante. */
      @keyframes picker-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .picker__search {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2);
        border-bottom: 1px solid var(--border-default);
        color: var(--text-tertiary);
      }
      .picker__search input {
        flex: 1 1 auto;
        border: none;
        background: transparent;
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-family: inherit;
        outline: none;
        min-height: 32px;
      }
      .picker__list {
        list-style: none;
        margin: 0;
        padding: var(--space-1) 0;
        max-height: 268px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .picker__option {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        font-size: var(--text-sm);
        color: var(--text-primary);
        cursor: pointer;
        min-height: 40px;
      }
      .picker__option--active {
        background: var(--bg-tertiary);
      }
      .picker__option[aria-selected='true'] {
        font-weight: var(--font-semibold);
      }
      .picker__option--custom {
        border-top: 1px dashed var(--border-default);
        border-radius: 0;
        margin-top: var(--space-1);
        color: var(--primary);
      }
      .picker__option[aria-disabled='true'] {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .picker__label {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .picker__hint,
      .picker__tag {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        font-weight: var(--font-normal);
      }
      .picker__check {
        color: var(--primary);
      }
      .picker__none {
        padding: var(--space-3);
        font-size: var(--text-sm);
        color: var(--text-tertiary);
        text-align: center;
      }
    `
  ]
})
export class PickerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) options: PickerOption[] = [];
  @Input() value: string | null = null;
  @Input() placeholder = 'Elegir…';
  @Input() label = 'Opciones';
  @Input() searchPlaceholder = 'Buscar';
  @Input() emptyText = 'Nada que elegir';
  @Input() leadingIcon: IconName | null = null;
  @Input() allowCustom = false;
  @Input() disabled = false;
  /** Por debajo de este numero de opciones el buscador es ruido, no ayuda. */
  @Input() filterFrom = 8;
  @Input() id = `picker-${Math.random().toString(36).slice(2, 8)}`;

  @Output() valueChange = new EventEmitter<string | null>();
  @Output() openChange = new EventEmitter<boolean>();

  @ViewChild('root') rootRef?: ElementRef<HTMLElement>;
  @ViewChild('search') searchRef?: ElementRef<HTMLInputElement>;

  readonly open = signal(false);
  readonly active = signal(0);
  query = '';
  readonly listId = computed(() => `${this.id}-list`);

  private onOutside = (event: MouseEvent) => this.closeOnOutside(event);

  get selectedLabel(): string {
    const found = this.options.find((option) => option.value === this.value);
    return found?.label ?? (this.value ? String(this.value) : '');
  }

  get exactMatch(): boolean {
    const wanted = this.query.trim().toLowerCase();
    return !!wanted && this.filtered().some((option) => option.label.toLowerCase() === wanted);
  }

  readonly filtered = computed(() => {
    const wanted = this.query.trim().toLowerCase();
    if (!wanted) return this.options;
    return this.options.filter(
      (option) => option.label.toLowerCase().includes(wanted) || option.value.toLowerCase().includes(wanted) || (option.hint ?? '').toLowerCase().includes(wanted)
    );
  });

  selectedOption(): PickerOption | undefined {
    return this.options.find((option) => option.value === this.value);
  }

  isSelected(option: PickerOption): boolean {
    return option.value === this.value;
  }

  ngOnInit(): void {
    document.addEventListener('click', this.onOutside, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.onOutside, true);
  }

  toggle(): void {
    this.open.set(!this.open());
    if (this.open()) {
      const index = this.options.findIndex((option) => option.value === this.value);
      this.active.set(index >= 0 ? index : 0);
      this.query = '';
      setTimeout(() => this.searchRef?.nativeElement.focus());
    }
    this.openChange.emit(this.open());
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.openChange.emit(false);
  }

  /**
   * El clic que reventaria el panel: el listener va en fase de captura y comprueba el
   * propio DOM, porque un `mousedown` en el boton ya habria cerrado y vuelto a abrir.
   */
  private closeOnOutside(event: MouseEvent): void {
    if (!this.open()) return;
    const root = this.rootRef?.nativeElement;
    if (root && event.target instanceof Node && !root.contains(event.target)) this.close();
  }

  choose(option: PickerOption): void {
    if (option.disabled) return;
    this.emit(option.value);
  }

  useCustom(): void {
    const text = this.query.trim();
    if (text) this.emit(text);
  }

  private emit(value: string | null): void {
    this.value = value;
    this.valueChange.emit(value);
    this.close();
  }

  onSearchKeys(event: KeyboardEvent): void {
    // Un Enter en el buscador NO cierra sin mas: si hay una coincidencia exacta, esa es
    // la eleccion; si no y el picker admite texto libre, se usa lo tecleado. Cerrar sin
    // decir nada es como si el usuario no hubiera escrito.
    if (event.key === 'Enter') {
      event.preventDefault();
      const match = this.filtered()[0];
      if (this.allowCustom && !this.exactMatch) this.useCustom();
      else if (match) this.choose(match);
      return;
    }
    this.onListKeys(event, false);
  }

  onListKeys(event: KeyboardEvent, fromTrigger: boolean): void {
    const size = this.filtered().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!this.open()) {
          this.toggle();
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.active.set(size ? (this.active() + step + size) % size : 0);
        break;
      }
      case 'Enter':
      case ' ': {
        if (fromTrigger) {
          event.preventDefault();
          this.toggle();
          return;
        }
        const option = this.filtered()[this.active()];
        if (option) {
          event.preventDefault();
          this.choose(option);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'Tab':
        this.close();
        break;
      case 'Home':
        if (this.open()) {
          event.preventDefault();
          this.active.set(0);
        }
        break;
      case 'End':
        if (this.open()) {
          event.preventDefault();
          this.active.set(Math.max(0, size - 1));
        }
        break;
    }
  }
}
