import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, shareReplay, take } from 'rxjs';
import { BehaviorSubject, filter } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Prevent infinite refresh loops when several requests fail with 401 at once.
let isRefreshing = false;
let refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  // Never attach auth to login / register / refresh / public endpoints
  const isAuthEndpoint =
    req.url.includes('/auth/login') ||
    req.url.includes('/auth/register') ||
    req.url.includes('/auth/forgot-password') ||
    req.url.includes('/auth/reset-password');

  if (isAuthEndpoint) {
    return next(req);
  }

  // Add token to request if available
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // If 401, try to refresh token (but don't trigger refresh from /refresh itself)
      if (error.status === 401 && token && !req.url.includes('/auth/refresh')) {
        if (!isRefreshing) {
          isRefreshing = true;
          refreshTokenSubject.next(null);

          return authService.refreshToken().pipe(
            switchMap(response => {
              isRefreshing = false;
              const newToken = response?.token || authService.getToken();
              refreshTokenSubject.next(newToken);
              if (!newToken) {
                authService.logout();
                return throwError(() => error);
              }
              const clonedReq = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` }
              });
              return next(clonedReq);
            }),
            catchError(refreshError => {
              isRefreshing = false;
              refreshTokenSubject.next(null);
              authService.logout();
              return throwError(() => refreshError);
            })
          );
        } else {
          // Wait for the in-flight refresh to finish, then retry
          return refreshTokenSubject.pipe(
            filter(t => t !== null),
            take(1),
            switchMap(newToken => {
              const clonedReq = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` }
              });
              return next(clonedReq);
            }),
            catchError(() => throwError(() => error))
          );
        }
      }

      return throwError(() => error);
    })
  );
};
