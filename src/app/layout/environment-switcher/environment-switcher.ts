import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Select } from 'primeng/select';
import { EnvironmentStore } from '../../core/state/environment.store';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { EnvironmentsDialog } from '../../features/environments/environments-dialog';

/** Selector del entorno activo, con un botón para gestionar los entornos y sus variables. */
@Component({
  selector: 'app-environment-switcher',
  imports: [Select, Button, FormsModule, EnvironmentsDialog],
  templateUrl: './environment-switcher.html',
  styleUrl: './environment-switcher.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentSwitcher {
  protected readonly store = inject(EnvironmentStore);
  private readonly workspaces = inject(WorkspaceStore);

  protected readonly managing = signal(false);

  /** Sin workspace, o sin poder leer sus entornos, no hay nada que elegir. */
  protected readonly available = computed(
    () => this.workspaces.activeId() !== null && this.store.status() !== 'error',
  );

  /** Gestionar espera a que lleguen los entornos: guardar sobre una lista a medias duplicaría los globales. */
  protected readonly manageable = computed(
    () => this.workspaces.activeId() !== null && this.store.status() === 'ready',
  );

  /**
   * La primera opción (id vacío) es "sin entorno": las variables globales siguen aplicando.
   * Hasta que los entornos llegan no hay opciones, para que se vea "Cargando…" o "Sin conexión"
   * y no un "Sin entorno" que aún no es cierto.
   */
  protected readonly options = computed(() =>
    this.store.status() === 'ready'
      ? [{ id: '', name: 'Sin entorno' }, ...this.store.environments()]
      : [],
  );

  protected readonly placeholder = computed(() => {
    switch (this.store.status()) {
      case 'loading':
        return 'Cargando…';
      case 'error':
        return 'Sin conexión';
      default:
        return 'Sin entorno';
    }
  });
}
