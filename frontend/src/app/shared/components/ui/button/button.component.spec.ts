import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ButtonComponent } from './button.component';

describe('ButtonComponent', () => {
  let component: ButtonComponent;
  let fixture: ComponentFixture<ButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ButtonComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should apply primary variant by default', () => {
    const button = fixture.nativeElement.querySelector('button');
    expect(button.className).toContain('btn--primary');
  });

  it('should apply specified variant', () => {
    component.variant = 'secondary';
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.className).toContain('btn--secondary');
  });

  it('should apply specified size', () => {
    component.size = 'lg';
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.className).toContain('btn--lg');
  });

  it('should disable button when disabled is true', () => {
    component.disabled = true;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBeTrue();
  });

  it('should disable button when loading', () => {
    component.loading = true;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBeTrue();
  });

  it('should show spinner when loading', () => {
    component.loading = true;
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('.btn__spinner');
    expect(spinner).toBeTruthy();
  });

  it('should emit onClick when clicked', () => {
    spyOn(component.onClick, 'emit');

    const button = fixture.nativeElement.querySelector('button');
    button.click();

    expect(component.onClick.emit).toHaveBeenCalled();
  });

  it('should not emit onClick when disabled', () => {
    spyOn(component.onClick, 'emit');
    component.disabled = true;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    button.click();

    expect(component.onClick.emit).not.toHaveBeenCalled();
  });

  it('should apply full width class', () => {
    component.fullWidth = true;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.className).toContain('btn--full-width');
  });

  it('should set button type', () => {
    component.type = 'submit';
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.type).toBe('submit');
  });

  describe('getClasses', () => {
    it('should return correct classes', () => {
      component.variant = 'outline';
      component.size = 'sm';

      expect(component.getClasses()).toContain('btn--outline');
      expect(component.getClasses()).toContain('btn--sm');
    });

    it('should include full-width class when fullWidth is true', () => {
      component.fullWidth = true;

      expect(component.getClasses()).toContain('btn--full-width');
    });
  });
});
