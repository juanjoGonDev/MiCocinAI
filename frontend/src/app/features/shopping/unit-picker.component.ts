import { Component, EventEmitter, Input, Output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import { PickerComponent, type PickerOption } from '../../shared/components/ui/picker/picker.component';
import type { IconName } from '../../shared/components/ui/icon/icon-paths';

export { UNIT_FAMILIES, canonicalUnit, familyOf, type UnitFamily } from './unit-families';

/**
 * El selector de unidad de la hoja de una linea.
 *
 * Antes habia DOS controles para la misma decision: una fila de chips (ud / kg / L / pack) y
 * debajo un desplegable con las demas. Dos controles, dos estados, y la persona que tocaba un
 * chip no veia que el desplegable seguia diciendo «Otra unidad…». Ahi se decide UNA cosa, asi
 * que hay UN control — y el disparador siempre dice lo que hay dentro.
 *
 * La lista no es un pelotón de 49 cadenas: va por familias, y elegir la familia ya vale
 * (coge su unidad por defecto). afinar dentro de la familia es una pulsacion mas, no una
 * obligacion. Y «bote de 400 g» sigue siendo un valor legitimo: el formato de la estanteria no
 * cabe en ninguna enumeracion, y quien lo escribe no puede perder lo que ha tecleado.
 */

/**
 * Las familias y la canonizacion viven en `unit-families.ts` para que se puedan probar sin
 * arrancar Angular — y porque el resto de la pantalla (la fila, el pegado, la hoja) necesita la
 * MISMA regla: dos criterios de «esto es un kg» son dos unidades guardadas para el mismo bote.
 */
import { canonicalUnit, familyOf, unitPickerOptions } from './unit-families';

@Component({
  selector: 'app-unit-picker',
  standalone: true,
  imports: [CommonModule, IconComponent, PickerComponent],
  template: `
    <div class="unit-picker">
      <app-picker
        [label]="label"
        [options]="options()"
        [value]="value"
        [placeholder]="placeholder"
        searchPlaceholder="Buscar unidad o escribir la que quieras"
        emptyText="Nada parecido: usa el texto que has escrito"
        [allowCustom]="true"
        [filterFrom]="6"
        [leadingIcon]="familyIcon()"
        (valueChange)="pick($event)"
        data-test="unit-picker"
      />

    </div>
  `,
  styles: [
    `
      .unit-picker {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
  
    `
  ]
})
export class UnitPickerComponent {
  @Input() value: string | null = null;
  @Input() label = 'Unidad o formato';
  @Input() placeholder = 'Sin unidad';
  @Output() valueChange = new EventEmitter<string | null>();

  /**
   * Las unidades, agrupadas por titulo de familia. Ni descripcion por fila (en una columna
   * de movil se recortaba a dos letras: ruido con puntos suspensivos) ni familia elegible.
   */
  readonly options = computed<PickerOption[]>(() => unitPickerOptions());

  /** El icono de la familia, en el disparador: «kg» se ve, «peso» se intuye. */
  readonly familyIcon = computed<IconName>(() => familyOf(this.value)?.icon ?? 'unfold_more');

  pick(value: string | null): void {
    this.valueChange.emit(canonicalUnit(value));
  }
}
