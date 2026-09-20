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
import { UNIT_FAMILIES, canonicalUnit, familyOf } from './unit-families';

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
      @if (familyLabel()) {
        <span class="unit-picker__family">
          <app-icon [name]="familyIcon()" [size]="14" [label]="null" />
          {{ familyLabel() }}
        </span>
      }
    </div>
  `,
  styles: [
    `
      .unit-picker {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      /* Lo que la familia hace por detras: «kg» no es un dato, es «peso, en kilogramos». */
      .unit-picker__family {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
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
   * Primer la familia (elegirla ya elige su unidad por defecto), despues sus unidades. Un solo
   * `role=listbox`, sin chips al lado repitiendo la misma decision.
   */
  readonly options = computed<PickerOption[]>(() => {
    const out: PickerOption[] = [];
    for (const family of UNIT_FAMILIES) {
      out.push({
        value: family.defaultUnit,
        label: family.label,
        hint: `${family.defaultUnit} · despues ${family.units.filter((u) => u !== family.defaultUnit).join(', ')}`
      });
      for (const unit of family.units) {
        if (unit === family.defaultUnit) continue;
        out.push({ value: unit, label: unit, hint: family.label });
      }
    }
    return out;
  });

  readonly familyIcon = computed<IconName>(() => familyOf(this.value)?.icon ?? 'unfold_more');
  readonly familyLabel = computed<string | null>(() => {
    const family = familyOf(this.value);
    return family && family.label !== this.value ? family.label : null;
  });

  pick(value: string | null): void {
    this.valueChange.emit(canonicalUnit(value));
  }
}
