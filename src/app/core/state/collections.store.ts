import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { EMPTY, Observable, Subscription, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { CollectionsApi } from '../api/collections.api';
import { CollectionTree, CreateFolderDto, CreateRequestDto, UpdateRequestDto } from '../models';
import { NotificationService } from '../notifications/notification.service';
import { LoadStatus } from './load-status';
import { findRequest } from './request-lookup';
import { WorkspaceStore } from './workspace.store';

/**
 * Colecciones del workspace activo, con su árbol completo de carpetas y peticiones, y la
 * petición seleccionada. Cada mutación devuelve un Observable que emite al terminar bien:
 * quien la lanza (un diálogo, por ejemplo) decide qué hacer entonces; los errores los avisa el
 * interceptor.
 */
@Injectable({ providedIn: 'root' })
export class CollectionsStore {
  private readonly api = inject(CollectionsApi);
  private readonly workspaces = inject(WorkspaceStore);
  private readonly notifications = inject(NotificationService);

  private readonly state = signal<CollectionTree[]>([]);
  private readonly loadStatus = signal<LoadStatus>('idle');
  private readonly selected = signal<string | null>(null);
  private inflight?: Subscription;

  readonly trees = this.state.asReadonly();
  readonly status = this.loadStatus.asReadonly();
  readonly selectedRequestId = this.selected.asReadonly();

  constructor() {
    // Al cambiar de workspace se descarta lo cargado y se pide lo del nuevo.
    effect(() => {
      const workspaceId = this.workspaces.activeId();
      untracked(() => this.loadWorkspace(workspaceId));
    });
  }

  /** Vuelve a pedir lo del workspace activo; la petición seleccionada se conserva si sigue existiendo. */
  reload(): void {
    this.loadWorkspace(this.workspaces.activeId(), false);
  }

  selectRequest(id: string | null): void {
    this.selected.set(id);
  }

  // --- Colecciones ---
  createCollection(name: string): Observable<void> {
    const workspaceId = this.workspaces.activeId();
    if (!workspaceId) return EMPTY;
    return this.api.create({ name, workspaceId }).pipe(
      switchMap((collection) => this.api.tree(collection.id)),
      tap((tree) => this.state.update((trees) => [...trees, tree])),
      this.done(`Colección «${name}» creada`),
    );
  }

  renameCollection(id: string, name: string): Observable<void> {
    return this.api.update(id, { name }).pipe(
      switchMap(() => this.refresh(id)),
      this.done('Colección renombrada'),
    );
  }

  deleteCollection(id: string): Observable<void> {
    return this.api.remove(id).pipe(
      tap(() => {
        this.state.update((trees) => trees.filter((tree) => tree.id !== id));
        this.dropSelectionIfMissing();
      }),
      this.done('Colección eliminada'),
    );
  }

  // --- Carpetas ---
  createFolder(dto: CreateFolderDto): Observable<void> {
    return this.api.createFolder(dto).pipe(
      switchMap(() => this.refresh(dto.collectionId)),
      this.done(`Carpeta «${dto.name}» creada`),
    );
  }

  renameFolder(collectionId: string, id: string, name: string): Observable<void> {
    return this.api.updateFolder(id, { name }).pipe(
      switchMap(() => this.refresh(collectionId)),
      this.done('Carpeta renombrada'),
    );
  }

  /** Borra también las subcarpetas y las peticiones que contiene. */
  deleteFolder(collectionId: string, id: string): Observable<void> {
    return this.api.removeFolder(id).pipe(
      switchMap(() => this.refresh(collectionId)),
      this.done('Carpeta eliminada'),
    );
  }

  // --- Peticiones ---
  createRequest(dto: CreateRequestDto): Observable<void> {
    return this.api.createRequest(dto).pipe(
      switchMap((request) => this.refresh(dto.collectionId).pipe(map(() => request))),
      tap((request) => this.selected.set(request.id)),
      this.done(`Petición «${dto.name}» creada`),
    );
  }

  /** Guarda los cambios de una petición (el editor) y refresca su árbol. */
  updateRequest(collectionId: string, id: string, dto: UpdateRequestDto): Observable<void> {
    return this.api.updateRequest(id, dto).pipe(
      switchMap(() => this.refresh(collectionId)),
      this.done('Petición guardada'),
    );
  }

  renameRequest(collectionId: string, id: string, name: string): Observable<void> {
    return this.api.updateRequest(id, { name }).pipe(
      switchMap(() => this.refresh(collectionId)),
      this.done('Petición renombrada'),
    );
  }

  deleteRequest(collectionId: string, id: string): Observable<void> {
    return this.api.removeRequest(id).pipe(
      switchMap(() => this.refresh(collectionId)),
      this.done('Petición eliminada'),
    );
  }

  // --- Internos ---
  private loadWorkspace(workspaceId: string | null, resetSelection = true): void {
    this.inflight?.unsubscribe();
    if (resetSelection) this.selected.set(null);

    if (!workspaceId) {
      this.state.set([]);
      this.loadStatus.set('idle');
      return;
    }

    this.loadStatus.set('loading');
    this.inflight = this.api
      .list(workspaceId)
      .pipe(
        switchMap((collections) =>
          collections.length
            ? forkJoin(
                [...collections]
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                  .map((collection) => this.api.tree(collection.id)),
              )
            : of([] as CollectionTree[]),
        ),
      )
      .subscribe({
        next: (trees) => {
          this.state.set(trees);
          this.loadStatus.set('ready');
          this.dropSelectionIfMissing();
        },
        error: () => {
          this.state.set([]);
          this.loadStatus.set('error'); // el interceptor ya avisó al usuario
        },
      });
  }

  /** Vuelve a pedir el árbol de una colección y lo reemplaza en su sitio. */
  private refresh(collectionId: string): Observable<void> {
    return this.api.tree(collectionId).pipe(
      tap((tree) => {
        this.state.update((trees) => trees.map((t) => (t.id === collectionId ? tree : t)));
        this.dropSelectionIfMissing();
      }),
      map(() => undefined),
    );
  }

  private dropSelectionIfMissing(): void {
    const id = this.selected();
    if (id && !findRequest(this.state(), id)) this.selected.set(null);
  }

  private done(message: string) {
    return (source: Observable<unknown>): Observable<void> =>
      source.pipe(
        tap(() => this.notifications.success(message)),
        map(() => undefined),
      );
  }
}
