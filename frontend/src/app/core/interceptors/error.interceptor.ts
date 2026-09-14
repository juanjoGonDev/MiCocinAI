import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'Ha ocurrido un error inesperado';

      if (error.error instanceof ErrorEvent) {
        // Client-side error
        errorMessage = error.error.message;
      } else {
        // Server-side error
        switch (error.status) {
          case 400:
            errorMessage = error.error?.message || 'Solicitud incorrecta';
            break;
          case 401:
            errorMessage = 'No autorizado';
            break;
          case 403:
            errorMessage = 'No tienes permiso para realizar esta acción';
            break;
          case 404:
            errorMessage = 'Recurso no encontrado';
            break;
          case 409:
            errorMessage = error.error?.message || 'Conflicto con el recurso';
            break;
          case 422:
            errorMessage = error.error?.message || 'Datos de entrada inválidos';
            break;
          case 429:
            errorMessage = 'Demasiadas solicitudes. Inténtalo más tarde';
            break;
          case 500:
            errorMessage = 'Error del servidor';
            break;
          case 503:
            errorMessage = 'Servicio no disponible';
            break;
        }
      }

      // Show error toast for non-auth errors
      if (error.status !== 401) {
        toastService.error('Error', errorMessage);
      }

      return throwError(() => ({
        status: error.status,
        message: errorMessage,
        original: error
      }));
    })
  );
};
