import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CheckboxComponent } from './checkbox.component';

@Component({
  standalone: true,
  imports: [CheckboxComponent],
  template: `<app-checkbox label="Todo el dia" [checked]="on" [disabled]="disabled" (checkedChange)="on = $event" />`
})
class HostComponent {
  on = false;
  disabled = false;
}

describe('CheckboxComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;

  it('es un control accesible y no un input suelto con un label al lado', () => {
    expect(button().getAttribute('role')).toBe('checkbox');
    expect(button().getAttribute('aria-checked')).toBe('false');
    expect(button().getAttribute('type')).toBe('button');
    expect(button().textContent).toContain('Todo el dia');
  });

  it('cambia y avisa al padre', () => {
    button().click();
    expect(fixture.componentInstance.on).toBeTrue();
    expect(button().getAttribute('aria-checked')).toBe('true');
  });

  it('inhabilitada no cambia', () => {
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();
    button().click();
    expect(fixture.componentInstance.on).toBeFalse();
  });
});
