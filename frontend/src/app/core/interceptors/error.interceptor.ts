import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

/** Última vez que se mostró un toast por código de estado. */
const recentlyShown = new Map<number, number>();

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

      // Un 429 llega en tanda (cada peticion en vuelo lo recibe), y un toast por cada
      // una es literalmente la pantalla inutil: no se ve la app debajo. Se agrupan por
      // mensaje y ventana, y el 429 anade cuanto hay que esperar —el `Retry-After` del
      // server— en vez de invitar a machacar F5, que es lo que multiplica las peticiones.
      const now = Date.now();
      const last = recentlyShown.get(error.status) ?? 0;
      const throttleMs = error.status === 429 ? 30_000 : 4_000;
      if (error.status !== 401 && now - last > throttleMs) {
        recentlyShown.set(error.status, now);
        const retryAfter = Number(error.error?.retryAfter ?? error.headers?.get('Retry-After') ?? '');
        toastService.error(
          error.status === 429 ? 'Demasiadas peticiones' : 'Error',
          error.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
            ? `El servidor te esta frenando. Se puede seguir en ${Math.ceil(retryAfter)} s.`
            : errorMessage
        );
      }

      return throwError(() => ({
        status: error.status,
        message: errorMessage,
        original: error
      }));
    })
  );
};
