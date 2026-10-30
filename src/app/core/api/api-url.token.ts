import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/** URL base del backend. Se puede sustituir en pruebas. */
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});
