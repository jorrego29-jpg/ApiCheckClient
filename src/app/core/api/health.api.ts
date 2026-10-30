import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { SKIP_ERROR_NOTIFICATION } from '../interceptors/error.interceptor';
import { API_URL } from './api-url.token';

@Injectable({ providedIn: 'root' })
export class HealthApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** GET / del backend (responde texto plano). El indicador de estado muestra el fallo, no un aviso. */
  check() {
    return this.http.get(`${this.baseUrl}/`, {
      responseType: 'text',
      context: new HttpContext().set(SKIP_ERROR_NOTIFICATION, true),
    });
  }
}
