import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CardComponent } from './card.component';

describe('CardComponent', () => {
  let component: CardComponent;
  let fixture: ComponentFixture<CardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should apply default variant class', () => {
    const card = fixture.nativeElement.querySelector('.card');
    expect(card).toBeTruthy();
    expect(card.className).not.toContain('card--');
  });

  it('should apply variant class', () => {
    component.variant = 'interactive';
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.card');
    expect(card.className).toContain('card--interactive');
  });

  it('should show image when provided', () => {
    component.image = 'test.jpg';
    component.imageAlt = 'Test';
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('.card__image');
    expect(img).toBeTruthy();
    expect(img.src).toContain('test.jpg');
    expect(img.alt).toBe('Test');
  });

  it('should not show image when not provided', () => {
    component.image = undefined;
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('.card__image');
    expect(img).toBeFalsy();
  });

  it('should show header when showHeader is true', () => {
    component.showHeader = true;
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('.card__header');
    expect(header).toBeTruthy();
  });

  it('should show footer when showFooter is true', () => {
    component.showFooter = true;
    fixture.detectChanges();

    const footer = fixture.nativeElement.querySelector('.card__footer');
    expect(footer).toBeTruthy();
  });

  describe('getClasses', () => {
    it('should return card class', () => {
      expect(component.getClasses()).toBe('card');
    });

    it('should include variant class', () => {
      component.variant = 'flat';
      expect(component.getClasses()).toContain('card--flat');
    });
  });
});
