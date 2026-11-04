import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, switchMap, tap } from 'rxjs';
import { WorkspacesApi } from '../api/workspaces.api';
import { Workspace, WorkspaceSummary } from '../models';
import { NotificationService } from '../notifications/notification.service';
import { LoadStatus } from './load-status';

export const ACTIVE_WORKSPACE_KEY = 'apicheck.workspace';

/** Workspaces del usuario y cuál está activo. El activo se recuerda entre sesiones. */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly api = inject(WorkspacesApi);
  private readonly notifications = inject(NotificationService);

  private readonly list = signal<WorkspaceSummary[]>([]);
  private readonly loadStatus = signal<LoadStatus>('idle');
  private readonly chosenId = signal<string | null>(readStoredId());

  readonly workspaces = this.list.asReadonly();
  readonly status = this.loadStatus.asReadonly();

  /** El elegido si todavía existe; si no, el primero de la lista (o null si no hay ninguno). */
  readonly activeId = computed(() => {
    const workspaces = this.list();
    const chosen = this.chosenId();
    if (chosen && workspaces.some((workspace) => workspace.id === chosen)) return chosen;
    return workspaces[0]?.id ?? null;
  });

  readonly active = computed(
    () => this.list().find((workspace) => workspace.id === this.activeId()) ?? null,
  );

  load(): void {
    this.loadStatus.set('loading');
    this.api.list().subscribe({
      next: (workspaces) => {
        this.list.set(sortByCreation(workspaces));
        this.loadStatus.set('ready');
      },
      error: () => this.loadStatus.set('error'), // el interceptor ya avisó al usuario
    });
  }

  select(id: string): void {
    this.chosenId.set(id);
    storeId(id);
  }

  /** Crea el workspace y lo deja activo. */
  create(name: string): Observable<void> {
    return this.api.create({ name }).pipe(
      switchMap((created: Workspace) =>
        this.api.list().pipe(
          tap((workspaces) => {
            this.list.set(sortByCreation(workspaces));
            this.loadStatus.set('ready');
            this.select(created.id);
          }),
        ),
      ),
      tap(() => this.notifications.success(`Workspace «${name}» creado`)),
      map(() => undefined),
    );
  }
}

function sortByCreation<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function readStoredId(): string | null {
  try {
    return globalThis.localStorage?.getItem(ACTIVE_WORKSPACE_KEY) ?? null;
  } catch {
    return null;
  }
}

function storeId(id: string): void {
  try {
    globalThis.localStorage?.setItem(ACTIVE_WORKSPACE_KEY, id);
  } catch {
    // Sin almacenamiento: el workspace activo simplemente no se recuerda.
  }
}
