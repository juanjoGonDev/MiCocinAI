import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChipSelectComponent } from './chip-select.component';
import { COMMON_ALLERGENS } from '../../../models/taste-profile';

describe('ChipSelectComponent', () => {
  let fixture: ComponentFixture<ChipSelectComponent>;
  let component: ChipSelectComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChipSelectComponent] }).compileComponents();
    fixture = TestBed.createComponent(ChipSelectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps approved preference emojis visible but decorative in the accessible chip name', () => {
    component.options = [COMMON_ALLERGENS[0]];
    fixture.detectChanges();

    const chip: HTMLButtonElement = fixture.nativeElement.querySelector('.chip-select__chip');
    const icon = chip.querySelector<HTMLElement>('.chip-select__icon');
    expect(icon?.textContent?.trim()).toBe(COMMON_ALLERGENS[0].icon);
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(chip.textContent).toContain(COMMON_ALLERGENS[0].value);
  });

  it('uses the edit SVG for selected custom values without adding a glyph to the chip', () => {
    component.options = [COMMON_ALLERGENS[0]];
    component.value = ['Alergia personal'];
    fixture.detectChanges();

    const chips: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.chip-select__chip');
    const custom = Array.from(chips).find((chip) => chip.textContent?.includes('Alergia personal'));
    const icon = custom?.querySelector('app-icon svg');

    expect(custom?.getAttribute('aria-pressed')).toBe('true');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(custom?.textContent).toContain('Alergia personal');
    expect(custom?.querySelector('.chip-select__icon')?.textContent?.trim()).toBe('');
  });

  it('trims custom values, suppresses case-insensitive duplicates, and emits only new selections', () => {
    component.value = ['Alergia existente'];
    const emit = spyOn(component.valueChange, 'emit');

    component.customText = '  Semillas  ';
    component.addCustom();
    expect(component.value).toEqual(['Alergia existente', 'Semillas']);
    expect(component.customText).toBe('');
    expect(emit).toHaveBeenCalledWith(['Alergia existente', 'Semillas']);

    component.customText = '  alergia EXISTENTE ';
    component.addCustom();
    expect(component.value).toEqual(['Alergia existente', 'Semillas']);
    expect(component.customText).toBe('');
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('toggles values both ways and keeps a deduplicated choices list cached by input identity', () => {
    const option = COMMON_ALLERGENS[0];
    component.options = [option, option];
    component.value = ['Personalizado'];
    const emit = spyOn(component.valueChange, 'emit');

    const first = component.choices;
    expect(first.map(({ value }) => value)).toEqual([option.value, 'Personalizado']);
    expect(component.choices).toBe(first);

    component.toggle(option.value);
    expect(component.value).toEqual(['Personalizado', option.value]);
    component.toggle(option.value);
    expect(component.value).toEqual(['Personalizado']);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(component.choices).toBe(first);
  });
});
