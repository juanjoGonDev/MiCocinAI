import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('show', () => {
    it('should add a toast', () => {
      service.show({ type: 'success', title: 'Test' });

      expect(service.toasts().length).toBe(1);
      expect(service.toasts()[0].title).toBe('Test');
      expect(service.toasts()[0].type).toBe('success');
    });

    it('should return toast id', () => {
      const id = service.show({ title: 'Test' });
      expect(id).toBeTruthy();
    });

    it('should auto-dismiss after duration', (done) => {
      service.show({ title: 'Test', duration: 100 });

      expect(service.toasts().length).toBe(1);

      setTimeout(() => {
        expect(service.toasts().length).toBe(0);
        done();
      }, 150);
    });

    it('should not auto-dismiss if duration is 0', () => {
      service.show({ title: 'Test', duration: 0 });

      expect(service.toasts().length).toBe(1);
    });
  });

  describe('success', () => {
    it('should create success toast', () => {
      service.success('Success', 'Operation completed');

      expect(service.toasts().length).toBe(1);
      expect(service.toasts()[0].type).toBe('success');
      expect(service.toasts()[0].title).toBe('Success');
      expect(service.toasts()[0].message).toBe('Operation completed');
    });
  });

  describe('error', () => {
    it('should create error toast', () => {
      service.error('Error', 'Something went wrong');

      expect(service.toasts().length).toBe(1);
      expect(service.toasts()[0].type).toBe('error');
      expect(service.toasts()[0].title).toBe('Error');
    });
  });

  describe('warning', () => {
    it('should create warning toast', () => {
      service.warning('Warning', 'Be careful');

      expect(service.toasts().length).toBe(1);
      expect(service.toasts()[0].type).toBe('warning');
    });
  });

  describe('info', () => {
    it('should create info toast', () => {
      service.info('Info', 'FYI');

      expect(service.toasts().length).toBe(1);
      expect(service.toasts()[0].type).toBe('info');
    });
  });

  describe('dismiss', () => {
    it('should remove toast by id', () => {
      const id = service.show({ title: 'Test' });
      expect(service.toasts().length).toBe(1);

      service.dismiss(id);
      expect(service.toasts().length).toBe(0);
    });

    it('should not affect other toasts', () => {
      service.show({ title: 'First' });
      const id2 = service.show({ title: 'Second' });
      service.show({ title: 'Third' });

      service.dismiss(id2);

      expect(service.toasts().length).toBe(2);
      expect(service.toasts().find(t => t.title === 'Second')).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should remove all toasts', () => {
      service.show({ title: 'One' });
      service.show({ title: 'Two' });
      service.show({ title: 'Three' });

      expect(service.toasts().length).toBe(3);

      service.clear();
      expect(service.toasts().length).toBe(0);
    });
  });
});
