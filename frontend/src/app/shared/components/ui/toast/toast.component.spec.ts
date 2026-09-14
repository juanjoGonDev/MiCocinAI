import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastComponent } from './toast.component';
import { ToastService } from '../../../../core/services/toast.service';

describe('ToastComponent', () => {
  let component: ToastComponent;
  let fixture: ComponentFixture<ToastComponent>;
  let toastService: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastComponent],
      providers: [ToastService]
    }).compileComponents();

    fixture = TestBed.createComponent(ToastComponent);
    component = fixture.componentInstance;
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render toasts from service', () => {
    toastService.success('Test Title', 'Test Message');
    fixture.detectChanges();

    const toasts = fixture.nativeElement.querySelectorAll('.toast');
    expect(toasts.length).toBe(1);
  });

  it('should display toast title', () => {
    toastService.info('Info Title');
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.toast__title');
    expect(title.textContent.trim()).toBe('Info Title');
  });

  it('should display toast message', () => {
    toastService.warning('Warning', 'Warning message');
    fixture.detectChanges();

    const message = fixture.nativeElement.querySelector('.toast__message');
    expect(message.textContent.trim()).toBe('Warning message');
  });

  it('should not show message when not provided', () => {
    toastService.success('Only Title');
    fixture.detectChanges();

    const message = fixture.nativeElement.querySelector('.toast__message');
    expect(message).toBeFalsy();
  });

  it('should apply correct type class', () => {
    toastService.error('Error');
    fixture.detectChanges();

    const toast = fixture.nativeElement.querySelector('.toast');
    expect(toast.className).toContain('toast--error');
  });

  it('should show close button for dismissible toasts', () => {
    toastService.show({ title: 'Test', dismissible: true });
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.toast__close');
    expect(closeBtn).toBeTruthy();
  });

  it('should dismiss toast on close click', () => {
    toastService.show({ title: 'Test', dismissible: true });
    fixture.detectChanges();

    expect(toastService.toasts().length).toBe(1);

    const closeBtn = fixture.nativeElement.querySelector('.toast__close');
    closeBtn.click();
    fixture.detectChanges();

    expect(toastService.toasts().length).toBe(0);
  });

  describe('getIcon', () => {
    it('should return success icon', () => {
      expect(component.getIcon('success')).toBe('✓');
    });

    it('should return error icon', () => {
      expect(component.getIcon('error')).toBe('✕');
    });

    it('should return warning icon', () => {
      expect(component.getIcon('warning')).toBe('⚠');
    });

    it('should return info icon', () => {
      expect(component.getIcon('info')).toBe('ℹ');
    });

    it('should return info icon for unknown type', () => {
      expect(component.getIcon('unknown')).toBe('ℹ');
    });
  });

  describe('trackById', () => {
    it('should return toast id', () => {
      const toast = { id: 'test-id', type: 'info' as const, title: 'Test', duration: 0, dismissible: true };
      expect(component.trackById(0, toast)).toBe('test-id');
    });
  });

  describe('getToastClasses', () => {
    it('should return correct classes', () => {
      const toast = { id: '1', type: 'success' as const, title: 'Test', duration: 0, dismissible: true };
      expect(component.getToastClasses(toast)).toBe('toast toast--success');
    });
  });
});
