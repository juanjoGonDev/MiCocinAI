import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  // Skip auth for login/register endpoints
  if (req.url.includes('/auth/login') || req.url.includes('/auth/register')) {
    return next(req);
  }

  // Add token to request
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // If 401, try to refresh token
      if (error.status === 401 && token) {
        return authService.refreshToken().pipe(
          switchMap(response => {
            // Retry request with new token
            const clonedReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${response.token}`
              }
            });
            return next(clonedReq);
          }),
          catchError(refreshError => {
            // Refresh failed, logout
            authService.logout();
            return throwError(() => refreshError);
          })
        );
      }

      return throwError(() => error);
    })
  );
};
