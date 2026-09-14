import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('setTheme', () => {
    it('should set light theme', () => {
      service.setTheme('light');

      expect(service.theme()).toBe('light');
      expect(service.isDark()).toBeFalse();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('should set dark theme', () => {
      service.setTheme('dark');

      expect(service.theme()).toBe('dark');
      expect(service.isDark()).toBeTrue();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should save theme to localStorage', () => {
      service.setTheme('dark');

      expect(localStorage.getItem('theme')).toBe('dark');
    });
  });

  describe('toggleTheme', () => {
    it('should toggle from light to dark', () => {
      service.setTheme('light');
      service.toggleTheme();

      expect(service.theme()).toBe('dark');
    });

    it('should toggle from dark to light', () => {
      service.setTheme('dark');
      service.toggleTheme();

      expect(service.theme()).toBe('light');
    });
  });

  describe('system theme', () => {
    it('should use system preference when theme is system', () => {
      service.setTheme('system');

      expect(service.theme()).toBe('system');
    });
  });

  describe('initialization', () => {
    it('should load theme from localStorage', () => {
      localStorage.setItem('theme', 'dark');

      // Create new instance to test initialization
      const newService = new ThemeService();

      expect(newService.theme()).toBe('dark');
    });

    it('should default to system if no stored theme', () => {
      const newService = new ThemeService();

      expect(newService.theme()).toBe('system');
    });
  });
});
