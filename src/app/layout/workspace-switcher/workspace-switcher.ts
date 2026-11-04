import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Select } from 'primeng/select';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { NameDialog } from '../../shared/components/name-dialog/name-dialog';

/** Selector del workspace activo, con un botón para crear otro. */
@Component({
  selector: 'app-workspace-switcher',
  imports: [Select, Button, FormsModule, NameDialog],
  templateUrl: './workspace-switcher.html',
  styleUrl: './workspace-switcher.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSwitcher {
  protected readonly store = inject(WorkspaceStore);

  protected readonly creating = signal(false);
  protected readonly saving = signal(false);

  protected readonly placeholder = computed(() => {
    switch (this.store.status()) {
      case 'loading':
        return 'Cargando…';
      case 'error':
        return 'Sin conexión';
      default:
        return 'Crea un workspace';
    }
  });

  protected create(name: string): void {
    this.saving.set(true);
    this.store.create(name).subscribe({
      next: () => {
        this.saving.set(false);
        this.creating.set(false);
      },
      error: () => this.saving.set(false), // el interceptor ya avisó; el diálogo sigue abierto
    });
  }
}
