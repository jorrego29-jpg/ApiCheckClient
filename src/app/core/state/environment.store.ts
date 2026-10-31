import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  EMPTY,
  Observable,
  Subscription,
  catchError,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { EnvironmentsApi } from '../api/environments.api';
import { Environment } from '../models';
import { NotificationService } from '../notifications/notification.service';
import {
  VariableMap,
  VariableRow,
  cleanRows,
  diffVariables,
  mergeVariables,
} from '../variables/variables';
import { LoadStatus } from './load-status';
import { WorkspaceStore } from './workspace.store';

/** Dónde se recuerda el entorno elegido; cada workspace tiene el suyo (`apicheck.environment.<id>`). */
export const ACTIVE_ENVIRONMENT_KEY = 'apicheck.environment';

/** Nombre del entorno que guarda las variables globales de un workspace. */
export const GLOBAL_ENVIRONMENT_NAME = 'Globales';

/**
 * Entornos del workspace activo y cuál está elegido. Las variables que ve una petición son las de
 * los entornos globales más las del elegido, que las pisan. Como en los demás stores, cada
 * mutación devuelve un Observable que emite al terminar bien y los errores los avisa el interceptor.
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentStore {
  private readonly api = inject(EnvironmentsApi);
  private readonly workspaces = inject(WorkspaceStore);
  private readonly notifications = inject(NotificationService);

  private readonly state = signal<Environment[]>([]);
  private readonly loadStatus = signal<LoadStatus>('idle');
  /** El id elegido; vacío es "sin entorno". */
  private readonly chosen = signal('');
  private inflight?: Subscription;

  readonly status = this.loadStatus.asReadonly();

  /** Los que se pueden elegir, por nombre. Los globales no: aplican siempre. */
  readonly environments = computed(() =>
    this.state()
      .filter((environment) => !environment.isGlobal)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  );

  readonly globals = computed(() => this.state().filter((environment) => environment.isGlobal));

  /**
   * El entorno elegido, o vacío si no hay o ya no existe. Mientras la lista no ha llegado se confía
   * en lo recordado, para que un envío temprano no salga sin entorno.
   */
  readonly activeId = computed(() => {
    const id = this.chosen();
    if (!id) return '';
    if (this.loadStatus() !== 'ready') return id;
    return this.environments().some((environment) => environment.id === id) ? id : '';
  });

  readonly active = computed(
    () => this.environments().find((environment) => environment.id === this.activeId()) ?? null,
  );

  /** Lo que se sustituye al enviar: globales y entorno activo, solo variables habilitadas. */
  readonly variables = computed<VariableMap>(() => mergeVariables(this.globals(), this.active()));

  constructor() {
    // Cada workspace tiene sus entornos: al cambiar se descarta lo cargado y se pide lo del nuevo.
    effect(() => {
      const workspaceId = this.workspaces.activeId();
      untracked(() => this.loadWorkspace(workspaceId));
    });
  }

  /** Elige el entorno activo (vacío, ninguno) y lo recuerda para este workspace. */
  select(id: string): void {
    this.chosen.set(id);
    storeId(this.workspaces.activeId(), id);
  }

  create(name: string): Observable<Environment> {
    const workspaceId = this.workspaces.activeId();
    if (!workspaceId) return EMPTY;
    return this.api.create({ name, workspaceId }).pipe(
      tap((environment) => this.add(environment)),
      tap(() => this.notifications.success(`Entorno «${name}» creado`)),
    );
  }

  rename(id: string, name: string): Observable<void> {
    return this.api.update(id, { name }).pipe(
      tap((environment) => this.replace(environment)),
      this.done('Entorno renombrado'),
    );
  }

  /** Borra también sus variables. */
  remove(id: string): Observable<void> {
    return this.api.remove(id).pipe(
      tap(() => {
        this.state.update((list) => list.filter((environment) => environment.id !== id));
        if (this.chosen() === id) this.select('');
      }),
      this.done('Entorno eliminado'),
    );
  }

  /** Deja las variables del entorno como las filas: crea, cambia y borra solo lo que difiere. */
  saveVariables(environmentId: string, rows: readonly VariableRow[]): Observable<void> {
    const environment = this.state().find((candidate) => candidate.id === environmentId);
    if (!environment) return EMPTY;

    const changes = diffVariables(environment.variables, rows);
    const calls: Observable<unknown>[] = [
      ...changes.remove.map((id) => this.api.removeVariable(id)),
      ...changes.update.map(({ id, changes: patch }) => this.api.updateVariable(id, patch)),
      ...changes.create.map((row) =>
        this.api.addVariable(environmentId, {
          key: row.key,
          value: row.value,
          enabled: row.enabled,
        }),
      ),
    ];

    return (calls.length ? forkJoin(calls) : of([])).pipe(
      switchMap(() => this.api.get(environmentId)),
      tap((fresh) => this.replace(fresh)),
      // Si algo falló a medias, se vuelve a leer lo que quedó para no duplicar al reintentar.
      catchError((error: unknown) =>
        this.api.get(environmentId).pipe(
          tap((fresh) => this.replace(fresh)),
          catchError(() => of(null)),
          switchMap(() => throwError(() => error)),
        ),
      ),
      this.done('Variables guardadas'),
    );
  }

  /** Crea el entorno de variables globales del workspace con estas filas. */
  createGlobals(rows: readonly VariableRow[]): Observable<void> {
    const workspaceId = this.workspaces.activeId();
    if (!workspaceId) return EMPTY;
    const variables = cleanRows(rows).map(({ key, value, enabled }) => ({ key, value, enabled }));
    return this.api
      .create({ name: GLOBAL_ENVIRONMENT_NAME, workspaceId, isGlobal: true, variables })
      .pipe(
        tap((environment) => this.add(environment)),
        this.done('Variables guardadas'),
      );
  }

  // --- Internos ---
  private loadWorkspace(workspaceId: string | null): void {
    this.inflight?.unsubscribe();
    this.state.set([]);
    this.chosen.set(workspaceId ? readStoredId(workspaceId) : '');

    if (!workspaceId) {
      this.loadStatus.set('idle');
      return;
    }

    this.loadStatus.set('loading');
    this.inflight = this.api.list(workspaceId).subscribe({
      next: (environments) => {
        this.state.set(environments);
        this.loadStatus.set('ready');
      },
      error: () => this.loadStatus.set('error'), // el interceptor ya avisó al usuario
    });
  }

  /** Solo entra si sigue siendo del workspace activo (la respuesta pudo tardar y haberse cambiado). */
  private add(environment: Environment): void {
    if (environment.workspaceId !== this.workspaces.activeId()) return;
    this.state.update((list) => [...list, environment]);
  }

  private replace(environment: Environment): void {
    this.state.update((list) =>
      list.map((candidate) => (candidate.id === environment.id ? environment : candidate)),
    );
  }

  private done(message: string) {
    return (source: Observable<unknown>): Observable<void> =>
      source.pipe(
        tap(() => this.notifications.success(message)),
        map(() => undefined),
      );
  }
}

const keyFor = (workspaceId: string) => `${ACTIVE_ENVIRONMENT_KEY}.${workspaceId}`;

function readStoredId(workspaceId: string): string {
  try {
    return globalThis.localStorage?.getItem(keyFor(workspaceId)) ?? '';
  } catch {
    return '';
  }
}

function storeId(workspaceId: string | null, id: string): void {
  if (!workspaceId) return;
  try {
    if (id) globalThis.localStorage?.setItem(keyFor(workspaceId), id);
    else globalThis.localStorage?.removeItem(keyFor(workspaceId));
  } catch {
    // Sin almacenamiento: el entorno activo simplemente no se recuerda.
  }
}
