import { TestBed } from '@angular/core/testing';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  let service: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoadingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('start/stop', () => {
    it('should set loading to true on start', () => {
      service.start();
      expect(service.isLoading()).toBeTrue();
    });

    it('should set loading to false on stop', () => {
      service.start();
      service.stop();
      expect(service.isLoading()).toBeFalse();
    });

    it('should handle multiple starts', () => {
      service.start('key1');
      service.start('key2');

      expect(service.isLoading()).toBeTrue();
      expect(service.isLoadingKey('key1')).toBeTrue();
      expect(service.isLoadingKey('key2')).toBeTrue();
    });

    it('should stop specific key', () => {
      service.start('key1');
      service.start('key2');

      service.stop('key1');

      expect(service.isLoading()).toBeTrue();
      expect(service.isLoadingKey('key1')).toBeFalse();
      expect(service.isLoadingKey('key2')).toBeTrue();
    });

    it('should stop loading when all keys are stopped', () => {
      service.start('key1');
      service.start('key2');

      service.stop('key1');
      service.stop('key2');

      expect(service.isLoading()).toBeFalse();
    });
  });

  describe('isLoadingKey', () => {
    it('should return false for non-loading key', () => {
      expect(service.isLoadingKey('nonexistent')).toBeFalse();
    });

    it('should return true for loading key', () => {
      service.start('test-key');
      expect(service.isLoadingKey('test-key')).toBeTrue();
    });
  });

  describe('reset', () => {
    it('should clear all loading states', () => {
      service.start();
      service.start('key1');
      service.start('key2');

      service.reset();

      expect(service.isLoading()).toBeFalse();
      expect(service.isLoadingKey('key1')).toBeFalse();
      expect(service.isLoadingKey('key2')).toBeFalse();
    });
  });
});
