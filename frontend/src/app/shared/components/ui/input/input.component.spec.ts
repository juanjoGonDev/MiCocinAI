import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { InputComponent } from './input.component';

describe('InputComponent', () => {
  let component: InputComponent;
  let fixture: ComponentFixture<InputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputComponent, FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(InputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render input element', () => {
    const input = fixture.nativeElement.querySelector('input');
    expect(input).toBeTruthy();
  });

  it('should set input type', () => {
    component.type = 'email';
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input');
    expect(input.type).toBe('email');
  });

  it('should set placeholder', () => {
    component.placeholder = 'Enter email';
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input');
    expect(input.placeholder).toBe('Enter email');
  });

  it('should disable input when disabled', () => {
    component.disabled = true;
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input');
    expect(input.disabled).toBeTrue();
  });

  it('should show label when provided', () => {
    component.label = 'Email';
    fixture.detectChanges();

    const label = fixture.nativeElement.querySelector('.input__label');
    expect(label.textContent.trim()).toBe('Email');
  });

  it('should not show label when not provided', () => {
    component.label = '';
    fixture.detectChanges();

    const label = fixture.nativeElement.querySelector('.input__label');
    expect(label).toBeFalsy();
  });

  it('should show required indicator', () => {
    component.label = 'Email';
    component.required = true;
    fixture.detectChanges();

    const required = fixture.nativeElement.querySelector('.input__required');
    expect(required).toBeTruthy();
  });

  it('should show error message', () => {
    component.error = 'Field is required';
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('.input__error');
    expect(error.textContent.trim()).toBe('Field is required');
  });

  it('should show helper text', () => {
    component.helper = 'Enter your email';
    fixture.detectChanges();

    const helper = fixture.nativeElement.querySelector('.input__helper');
    expect(helper.textContent.trim()).toBe('Enter your email');
  });

  it('should apply error class when error exists', () => {
    component.error = 'Error';
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input');
    expect(input.className).toContain('input--error');
  });

  it('propaga el cambio al modelo (ControlValueAccessor)', () => {
    const propagate = jasmine.createSpy('registerOnChange');
    component.registerOnChange(propagate);

    const input = fixture.nativeElement.querySelector('input');
    input.value = 'test';
    input.dispatchEvent(new Event('input'));

    expect(component.value).toBe('test');
    expect(propagate).toHaveBeenCalledWith('test');
  });

  it('should toggle password visibility', () => {
    component.type = 'password';
    component.showToggle = true;
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector('.input__toggle');
    expect(toggle).toBeTruthy();

    toggle.click();
    fixture.detectChanges();

    expect(component.showPassword).toBeTrue();
    expect(component.type).toBe('text');
  });

  describe('ControlValueAccessor', () => {
    it('should write value', () => {
      component.writeValue('test value');
      expect(component.value).toBe('test value');
    });

    it('should register onChange', () => {
      const fn = jasmine.createSpy('onChange');
      component.registerOnChange(fn);

      component.onInput({ target: { value: 'test' } } as any);
      expect(fn).toHaveBeenCalledWith('test');
    });

    it('should register onTouched', () => {
      const fn = jasmine.createSpy('onTouched');
      component.registerOnTouched(fn);

      component.onInput({ target: { value: 'test' } } as any);
      expect(fn).toHaveBeenCalled();
    });

    it('should set disabled state', () => {
      component.setDisabledState(true);
      expect(component.disabled).toBeTrue();
    });
  });

  describe('getClasses', () => {
    it('should return correct group classes', () => {
      component.fullWidth = true;
      expect(component.getGroupClasses()).toContain('input-group--full-width');
    });

    it('should return correct input classes', () => {
      component.size = 'lg';
      component.error = 'Error';

      const classes = component.getInputClasses();
      expect(classes).toContain('input--lg');
      expect(classes).toContain('input--error');
    });
  });
});
