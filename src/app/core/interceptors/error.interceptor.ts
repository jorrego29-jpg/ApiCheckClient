import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../notifications/notification.service';

/** Úsalo en el `context` de una petición cuando el componente muestra el error por su cuenta. */
export const SKIP_ERROR_NOTIFICATION = new HttpContextToken<boolean>(() => false);

/** Convierte un error HTTP (formato de Nest: { statusCode, message, error }) en un texto legible. */
export function describeHttpError(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'No se pudo conectar con el servidor. Verifica que el backend esté en ejecución.';
  }

  const body: unknown = error.error;
  const message =
    typeof body === 'object' && body !== null ? (body as { message?: unknown }).message : undefined;

  if (Array.isArray(message)) return message.map(String).join('; ');
  if (typeof message === 'string' && message) return message;
  return `Error ${error.status}: ${error.statusText || 'la solicitud falló'}`;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && !req.context.get(SKIP_ERROR_NOTIFICATION)) {
        notifications.error(describeHttpError(error));
      }
      return throwError(() => error);
    }),
  );
};
