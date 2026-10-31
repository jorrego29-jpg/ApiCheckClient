import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  untracked,
} from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { finalize } from 'rxjs';
import { EnvironmentStore } from '../../core/state/environment.store';
import {
  VariableRow,
  duplicateKeys,
  invalidKeys,
  rowsFromVariables,
  sameRows,
  unnamedRows,
} from '../../core/variables/variables';
import { KeyValueTable } from '../../shared/components/key-value-table/key-value-table';
import { NameDialog } from '../../shared/components/name-dialog/name-dialog';

/** Lo que se está seleccionando en la lista: el entorno de variables globales o uno elegible. */
const GLOBAL_KEY = 'global';

type Naming = 'create' | 'rename';

/**
 * Gestión de entornos: la lista a la izquierda (primero las variables globales) y, a la derecha,
 * las variables del seleccionado en una tabla. Los cambios de la tabla no se envían hasta pulsar Guardar.
 */
@Component({
  selector: 'app-environments-dialog',
  imports: [Dialog, Button, ConfirmDialog, KeyValueTable, NameDialog],
  providers: [ConfirmationService],
  templateUrl: './environments-dialog.html',
  styleUrl: './environments-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsDialog {
  readonly visible = model(false);

  protected readonly store = inject(EnvironmentStore);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly globalKey = GLOBAL_KEY;
  protected readonly selectedKey = signal(GLOBAL_KEY);
  protected readonly saving = signal(false);
  protected readonly naming = signal<Naming | null>(null);
  protected readonly working = signal(false);

  /** Las filas editadas del seleccionado; null mientras no se ha tocado nada. */
  private readonly edits = signal<VariableRow[] | null>(null);

  protected readonly isGlobal = computed(() => this.selectedKey() === GLOBAL_KEY);

  /** El entorno seleccionado. Los globales pueden no existir aún: se crean al guardar la primera variable. */
  protected readonly selected = computed(() =>
    this.isGlobal()
      ? (this.store.globals()[0] ?? null)
      : (this.store.environments().find((environment) => environment.id === this.selectedKey()) ??
        null),
  );

  protected readonly globalCount = computed(() =>
    this.store.globals().reduce((total, environment) => total + environment.variables.length, 0),
  );

  private readonly saved = computed(() => rowsFromVariables(this.selected()?.variables ?? []));
  protected readonly rows = computed(() => this.edits() ?? this.saved());
  // Un valor escrito sin nombre no cuenta como variable, pero tampoco se puede perder sin avisar.
  protected readonly dirty = computed(() => {
    const edits = this.edits();
    return edits !== null && (!sameRows(edits, this.saved()) || unnamedRows(edits) > 0);
  });

  protected readonly invalid = computed(() => invalidKeys(this.rows()));
  protected readonly duplicated = computed(() => duplicateKeys(this.rows()));
  protected readonly unnamed = computed(() => unnamedRows(this.rows()));
  protected readonly canSave = computed(
    () => this.dirty() && this.invalid().length === 0 && this.unnamed() === 0 && !this.saving(),
  );

  /** Cómo se escribe una variable en una petición; va en una propiedad porque en la plantilla `{{` abre una interpolación. */
  protected readonly example = '{{nombre}}';
  protected readonly description = computed(() =>
    this.isGlobal()
      ? 'Se aplican a todas las peticiones del workspace, con cualquier entorno. Si el entorno activo define la misma variable, gana la del entorno.'
      : `Se usan mientras el entorno esté activo. En las peticiones escríbelas como ${this.example}.`,
  );

  constructor() {
    // Al abrir, parte del entorno activo y sin cambios pendientes.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        this.selectedKey.set(this.store.activeId() || GLOBAL_KEY);
        this.edits.set(null);
      });
    });
  }

  protected edit(rows: VariableRow[]): void {
    this.edits.set(rows);
  }

  protected discard(): void {
    this.edits.set(null);
  }

  protected choose(key: string): void {
    if (key === this.selectedKey()) return;
    this.guard(() => {
      this.selectedKey.set(key);
      this.edits.set(null);
    });
  }

  protected close(): void {
    this.guard(() => {
      this.edits.set(null);
      this.visible.set(false);
    });
  }

  protected save(): void {
    if (!this.canSave()) return;
    const environment = this.selected();
    const rows = this.rows();

    this.saving.set(true);
    (environment ? this.store.saveVariables(environment.id, rows) : this.store.createGlobals(rows))
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => this.edits.set(null),
        // Tras un fallo el store ya volvió a leer lo que quedó guardado: se muestra eso.
        error: () => {
          if (environment) this.edits.set(null);
        },
      });
  }

  // --- Crear, renombrar y eliminar ---
  protected startCreate(): void {
    this.guard(() => this.naming.set('create'));
  }

  protected startRename(): void {
    if (this.selected() && !this.isGlobal()) this.naming.set('rename');
  }

  protected nameVisible(visible: boolean): void {
    if (!visible) this.naming.set(null);
  }

  protected confirmName(name: string): void {
    this.working.set(true);
    if (this.naming() === 'rename') {
      const environment = this.selected();
      if (!environment) return;
      this.store
        .rename(environment.id, name)
        .pipe(finalize(() => this.working.set(false)))
        .subscribe({ next: () => this.naming.set(null), error: () => undefined });
      return;
    }
    this.store
      .create(name)
      .pipe(finalize(() => this.working.set(false)))
      .subscribe({
        next: (environment) => {
          this.selectedKey.set(environment.id);
          this.edits.set(null);
          this.naming.set(null);
        },
        error: () => undefined, // el interceptor ya avisó; el diálogo sigue abierto
      });
  }

  protected remove(): void {
    const environment = this.selected();
    if (!environment || this.isGlobal()) return;
    this.confirmation.confirm({
      header: 'Confirmar eliminación',
      message: `¿Eliminar el entorno «${environment.name}» con sus ${environment.variables.length} variables?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-text',
      accept: () =>
        this.store.remove(environment.id).subscribe({
          next: () => {
            this.selectedKey.set(GLOBAL_KEY);
            this.edits.set(null);
          },
          error: () => undefined,
        }),
    });
  }

  /** Hace lo pedido ya, o tras confirmar si hay variables editadas sin guardar. */
  private guard(proceed: () => void): void {
    if (!this.dirty()) {
      proceed();
      return;
    }
    this.confirmation.confirm({
      header: 'Cambios sin guardar',
      message: 'Hay variables editadas sin guardar. ¿Descartarlas?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Descartar',
      rejectLabel: 'Seguir editando',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-text',
      accept: proceed,
    });
  }
}
