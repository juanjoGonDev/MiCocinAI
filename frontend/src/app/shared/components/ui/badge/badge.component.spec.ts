import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BadgeComponent } from './badge.component';

describe('BadgeComponent', () => {
  let component: BadgeComponent;
  let fixture: ComponentFixture<BadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BadgeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BadgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should apply primary variant by default', () => {
    const badge = fixture.nativeElement.querySelector('span');
    expect(badge.className).toContain('badge--primary');
  });

  it('should apply specified variant', () => {
    component.variant = 'success';
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('span');
    expect(badge.className).toContain('badge--success');
  });

  it('should apply specified size', () => {
    component.size = 'lg';
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('span');
    expect(badge.className).toContain('badge--lg');
  });

  it('should show dot when dot is true', () => {
    component.dot = true;
    fixture.detectChanges();

    const dot = fixture.nativeElement.querySelector('.badge__dot');
    expect(dot).toBeTruthy();
  });

  it('should not show dot when dot is false', () => {
    component.dot = false;
    fixture.detectChanges();

    const dot = fixture.nativeElement.querySelector('.badge__dot');
    expect(dot).toBeFalsy();
  });

  describe('getClasses', () => {
    it('should return correct classes', () => {
      component.variant = 'warning';
      component.size = 'sm';

      expect(component.getClasses()).toBe('badge badge--warning badge--sm');
    });
  });
});
