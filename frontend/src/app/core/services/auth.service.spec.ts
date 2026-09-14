import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: Router, useValue: routerSpy }
      ]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('login', () => {
    it('should login successfully', () => {
      const credentials = { email: 'test@test.com', password: 'Password1' };
      const mockResponse = {
        user: { id: '1', email: 'test@test.com', name: 'Test User' },
        token: 'mock-token',
        refreshToken: 'mock-refresh-token'
      };

      service.login(credentials).subscribe(response => {
        expect(response.user.email).toBe('test@test.com');
        expect(service.isAuthenticated()).toBeTrue();
        expect(service.currentUser()?.name).toBe('Test User');
      });

      const req = httpMock.expectOne('/api/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(credentials);
      req.flush(mockResponse);
    });

    it('should handle login error', () => {
      const credentials = { email: 'test@test.com', password: 'wrong' };

      service.login(credentials).subscribe({
        error: (error) => {
          expect(error).toBeTruthy();
          expect(service.isAuthenticated()).toBeFalse();
        }
      });

      const req = httpMock.expectOne('/api/auth/login');
      req.flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });
    });

    it('should store tokens in localStorage', () => {
      const credentials = { email: 'test@test.com', password: 'Password1' };
      const mockResponse = {
        user: { id: '1', email: 'test@test.com', name: 'Test' },
        token: 'token123',
        refreshToken: 'refresh123'
      };

      service.login(credentials).subscribe();

      const req = httpMock.expectOne('/api/auth/login');
      req.flush(mockResponse);

      expect(localStorage.getItem('auth_token')).toBe('token123');
      expect(localStorage.getItem('refresh_token')).toBe('refresh123');
    });
  });

  describe('register', () => {
    it('should register successfully', () => {
      const data = {
        name: 'New User',
        email: 'new@test.com',
        password: 'Password1',
        cookingLevel: 'beginner' as const
      };

      const mockResponse = {
        user: { id: '2', email: 'new@test.com', name: 'New User' },
        token: 'new-token',
        refreshToken: 'new-refresh'
      };

      service.register(data).subscribe(response => {
        expect(response.user.name).toBe('New User');
        expect(service.isAuthenticated()).toBeTrue();
      });

      const req = httpMock.expectOne('/api/auth/register');
      expect(req.request.method).toBe('POST');
      req.flush(mockResponse);
    });
  });

  describe('logout', () => {
    it('should clear tokens and redirect to login', () => {
      // Setup logged in state
      localStorage.setItem('auth_token', 'token');
      localStorage.setItem('refresh_token', 'refresh');
      localStorage.setItem('current_user', JSON.stringify({ id: '1' }));

      service.logout();

      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
      expect(service.isAuthenticated()).toBeFalse();
      expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
    });
  });

  describe('getToken', () => {
    it('should return token from localStorage', () => {
      localStorage.setItem('auth_token', 'test-token');
      expect(service.getToken()).toBe('test-token');
    });

    it('should return null if no token', () => {
      expect(service.getToken()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when not logged in', () => {
      expect(service.isAuthenticated()).toBeFalse();
    });

    it('should return true when logged in with valid token', () => {
      // Create a valid JWT token (not expired)
      const payload = { sub: '1', email: 'test@test.com', exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = 'header.' + btoa(JSON.stringify(payload)).replace(/=/g, '') + '.signature';

      localStorage.setItem('auth_token', token);
      localStorage.setItem('current_user', JSON.stringify({ id: '1', email: 'test@test.com' }));

      // Reinitialize to pick up stored values
      service = TestBed.inject(AuthService);

      expect(service.isAuthenticated()).toBeTrue();
    });
  });

  describe('forgotPassword', () => {
    it('should send forgot password request', () => {
      service.forgotPassword('test@test.com').subscribe();

      const req = httpMock.expectOne('/api/auth/forgot-password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'test@test.com' });
      req.flush({});
    });
  });
});
