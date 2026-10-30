import { Injectable, inject, signal } from '@angular/core';
import { HealthApi } from '../api/health.api';

export type ApiConnection = 'checking' | 'online' | 'offline';

/** Estado de la conexión con el backend, mostrado en la barra superior. */
@Injectable({ providedIn: 'root' })
export class ApiStatus {
  private readonly health = inject(HealthApi);
  private readonly connection = signal<ApiConnection>('checking');

  readonly state = this.connection.asReadonly();

  check(): void {
    this.connection.set('checking');
    this.health.check().subscribe({
      next: () => this.connection.set('online'),
      error: () => this.connection.set('offline'),
    });
  }
}
