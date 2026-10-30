import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PrimeTemplate } from 'primeng/api';
import { Select } from 'primeng/select';
import { Splitter } from 'primeng/splitter';
import { ApiConnection, ApiStatus } from '../../core/state/api-status';

const STATUS_LABEL: Record<ApiConnection, string> = {
  checking: 'Conectando…',
  online: 'API conectada',
  offline: 'API sin conexión',
};

const STATUS_HINT: Record<ApiConnection, string> = {
  checking: 'Comprobando la conexión con el backend',
  online: 'El backend responde. Clic para comprobar de nuevo',
  offline: 'No hay conexión con el backend. Clic para reintentar',
};

/** Estructura de la app: barra superior y tres zonas redimensionables (árbol, petición y respuesta). */
@Component({
  selector: 'app-shell',
  imports: [Splitter, PrimeTemplate, Select],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly apiStatus = inject(ApiStatus);

  protected readonly statusLabel = computed(() => STATUS_LABEL[this.apiStatus.state()]);
  protected readonly statusHint = computed(() => STATUS_HINT[this.apiStatus.state()]);

  constructor() {
    this.apiStatus.check();
  }
}
