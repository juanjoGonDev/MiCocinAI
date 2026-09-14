import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { memoryMonitor } from './memory-monitor';

describe('MemoryMonitor', () => {
  beforeEach(() => {
    memoryMonitor.stop();
  });

  afterEach(() => {
    memoryMonitor.stop();
  });

  it('should be created', () => {
    expect(memoryMonitor).toBeTruthy();
  });

  describe('check', () => {
    it('should return memory stats', () => {
      const stats = memoryMonitor.check();

      expect(stats).toHaveProperty('heapUsed');
      expect(stats).toHaveProperty('heapTotal');
      expect(stats).toHaveProperty('rss');
      expect(stats).toHaveProperty('systemFree');
      expect(stats).toHaveProperty('systemTotal');
      expect(stats).toHaveProperty('systemUsagePercent');
      expect(stats).toHaveProperty('timestamp');
    });

    it('should return numeric values', () => {
      const stats = memoryMonitor.check();

      expect(typeof stats.heapUsed).toBe('number');
      expect(typeof stats.heapTotal).toBe('number');
      expect(typeof stats.rss).toBe('number');
      expect(typeof stats.systemFree).toBe('number');
      expect(typeof stats.systemTotal).toBe('number');
      expect(typeof stats.systemUsagePercent).toBe('number');
    });

    it('should store last stats', () => {
      memoryMonitor.check();

      const stats = memoryMonitor.getStats();
      expect(stats).toBeTruthy();
    });
  });

  describe('getStats', () => {
    it('should return null before first check', () => {
      const stats = memoryMonitor.getStats();
      expect(stats).toBeNull();
    });

    it('should return stats after check', () => {
      memoryMonitor.check();

      const stats = memoryMonitor.getStats();
      expect(stats).toBeTruthy();
      expect(stats?.heapUsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      memoryMonitor.start();

      // Should have interval running
      expect(memoryMonitor['intervalId']).toBeTruthy();
    });

    it('should stop monitoring', () => {
      memoryMonitor.start();
      memoryMonitor.stop();

      expect(memoryMonitor['intervalId']).toBeNull();
    });

    it('should not start multiple times', () => {
      memoryMonitor.start();
      const firstId = memoryMonitor['intervalId'];

      memoryMonitor.start();
      const secondId = memoryMonitor['intervalId'];

      expect(firstId).toBe(secondId);
    });
  });
});
