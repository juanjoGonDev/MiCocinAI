import { HttpInterceptorFn, HttpErrorResponse, HttpContextToken } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

/**
 * Peticiones cuyo fracaso tiene pantalla propia. Cerrar una compra con lineas sin precio
 * es un 409 que abre una hoja para escribirlos ahi mismo: un toast encima repitiendo el
 * codigo del server es ruido encima de la solucion.
 */
export const SILENT_TOAST = new HttpContextToken<boolean>(() => false);

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
            // Traducido a lo que se puede hacer, no al codigo. Un 401 callado es la peor
            // combinacion posible: la app sigue ensenando lo que hay en el cache —el nombre, la
            // foto, la lista— mientras toda escritura falla, que es exactamente el aspecto de una
            // cuenta que ya no existe en el servidor (una base de datos restaurada o sustituida).
            errorMessage = 'La sesion que guarda este navegador ya no vale. Cierra sesion y vuelve a entrar.';
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
      const throttleMs = error.status === 429 || error.status === 401 ? 30_000 : 4_000;
      const silent = req.context?.get(SILENT_TOAST) === true;
      // Un 401 contra el propio login NO se cuenta aqui: esa pantalla ya dice su mensaje al lado
      // del campo, yrepetirlo es un mensaje que se desconfia de si mismo.
      const authAttempt = /^\/api\/auth\/(login|register|refresh|me)$/.test(req.url);
      if (!silent && !(error.status === 401 && authAttempt) && now - last > throttleMs) {
        recentlyShown.set(error.status, now);
        const retryAfter = Number(error.error?.retryAfter ?? error.headers?.get('Retry-After') ?? '');
        toastService.error(
          error.status === 429 ? 'Demasiadas peticiones' : error.status === 401 ? 'Sesion caducada' : 'Error',
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
