import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';

describe('ModalComponent', () => {
  let component: ModalComponent;
  let fixture: ComponentFixture<ModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.modal-overlay');
    expect(overlay).toBeFalsy();
  });

  it('should render when isOpen is true', () => {
    component.isOpen = true;
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.modal-overlay');
    expect(overlay).toBeTruthy();
  });

  it('should display title', () => {
    component.isOpen = true;
    component.title = 'Test Modal';
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.modal__title');
    expect(title.textContent.trim()).toBe('Test Modal');
  });

  it('should apply correct size class', () => {
    component.isOpen = true;
    component.size = 'lg';
    fixture.detectChanges();

    const modal = fixture.nativeElement.querySelector('.modal');
    expect(modal.className).toContain('modal--lg');
  });

  it('should show close button when closable', () => {
    component.isOpen = true;
    component.closable = true;
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.modal__close');
    expect(closeBtn).toBeTruthy();
  });

  it('should not show close button when not closable', () => {
    component.isOpen = true;
    component.closable = false;
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.modal__close');
    expect(closeBtn).toBeFalsy();
  });

  it('should close on close button click', () => {
    component.isOpen = true;
    fixture.detectChanges();

    spyOn(component, 'close');

    const closeBtn = fixture.nativeElement.querySelector('.modal__close');
    closeBtn.click();

    expect(component.close).toHaveBeenCalled();
  });

  it('should emit onClose when closed', () => {
    spyOn(component.onClose, 'emit');

    component.isOpen = true;
    component.close();

    expect(component.isOpen).toBeFalse();
    expect(component.isOpenChange.emit).toHaveBeenCalledWith(false);
    expect(component.onClose.emit).toHaveBeenCalled();
  });

  it('should close on overlay click when closeOnOverlay is true', () => {
    component.isOpen = true;
    component.closeOnOverlay = true;
    fixture.detectChanges();

    spyOn(component, 'close');

    const overlay = fixture.nativeElement.querySelector('.modal-overlay');
    overlay.click();

    expect(component.close).toHaveBeenCalled();
  });

  it('should not close on overlay click when closeOnOverlay is false', () => {
    component.isOpen = true;
    component.closeOnOverlay = false;
    fixture.detectChanges();

    spyOn(component, 'close');

    const overlay = fixture.nativeElement.querySelector('.modal-overlay');
    overlay.click();

    expect(component.close).not.toHaveBeenCalled();
  });

  it('should close on escape key', () => {
    component.isOpen = true;
    component.closable = true;

    spyOn(component, 'close');

    component.onEscapeKey();

    expect(component.close).toHaveBeenCalled();
  });

  it('should not close on escape key when not closable', () => {
    component.isOpen = true;
    component.closable = false;

    spyOn(component, 'close');

    component.onEscapeKey();

    expect(component.close).not.toHaveBeenCalled();
  });

  it('should show footer when showFooter is true', () => {
    component.isOpen = true;
    component.showFooter = true;
    fixture.detectChanges();

    const footer = fixture.nativeElement.querySelector('.modal__footer');
    expect(footer).toBeTruthy();
  });

  it('should not show footer when showFooter is false', () => {
    component.isOpen = true;
    component.showFooter = false;
    fixture.detectChanges();

    const footer = fixture.nativeElement.querySelector('.modal__footer');
    expect(footer).toBeFalsy();
  });

  describe('getModalClasses', () => {
    it('should return correct classes', () => {
      component.size = 'xl';
      expect(component.getModalClasses()).toBe('modal modal--xl');
    });
  });
});
