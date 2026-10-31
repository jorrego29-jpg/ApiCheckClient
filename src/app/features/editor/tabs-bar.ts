import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { EditorTab, TabsStore } from '../../core/state/tabs.store';

/** Las peticiones abiertas, como pestañas. Cerrar una con cambios pide confirmación. */
@Component({
  selector: 'app-tabs-bar',
  imports: [ConfirmDialog],
  providers: [ConfirmationService],
  templateUrl: './tabs-bar.html',
  styleUrl: './tabs-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabsBar {
  protected readonly store = inject(TabsStore);
  private readonly confirmation = inject(ConfirmationService);

  protected badge(tab: EditorTab): string {
    return tab.draft.protocol === 'SOAP' ? 'SOAP' : tab.draft.method;
  }

  protected close(tab: EditorTab): void {
    if (!this.store.dirtyIds().has(tab.id)) {
      this.store.close(tab.id);
      return;
    }
    this.confirmation.confirm({
      header: 'Cambios sin guardar',
      message: `«${tab.title}» tiene cambios sin guardar. ¿Cerrarla y descartarlos?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Descartar y cerrar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-text',
      accept: () => this.store.close(tab.id),
    });
  }
}
