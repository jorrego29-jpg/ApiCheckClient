import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subscription, map, of } from 'rxjs';
import { ExecutionApi } from '../api/execution.api';
import {
  CollectionTree,
  ExecutionResult,
  HistoryDetail,
  WsdlInspection,
  isExecutionError,
} from '../models';
import { resultFromHistory } from '../history/history-result';
import { NotificationService } from '../notifications/notification.service';
import {
  RequestDraft,
  canSend,
  draftFromSaved,
  draftsEqual,
  toExecutionDto,
  toSaveDto,
} from '../requests/request-draft';
import { interpolate } from '../variables/variables';
import { CollectionsStore } from './collections.store';
import { EnvironmentStore } from './environment.store';
import { HistoryStore } from './history.store';
import { findRequest } from './request-lookup';
import { SettingsStore } from './settings.store';
import { WorkspaceStore } from './workspace.store';

/** Una petición abierta en el editor, con sus cambios sin guardar y su última respuesta. */
export interface EditorTab {
  /** Id de la petición guardada: no hay dos pestañas de la misma petición. */
  id: string;
  collectionId: string;
  title: string;
  /** Lo último guardado; contra esto se mide si hay cambios. */
  baseline: RequestDraft;
  draft: RequestDraft;
  running: boolean;
  result: ExecutionResult | null;
  /** Lo último que se leyó del WSDL de una petición SOAP; no se guarda. */
  wsdl: WsdlInspection | null;
}

/** Pestañas del editor. Sigue a la petición seleccionada en el árbol y la mantiene en sincronía con ella. */
@Injectable({ providedIn: 'root' })
export class TabsStore {
  private readonly collections = inject(CollectionsStore);
  private readonly workspaces = inject(WorkspaceStore);
  private readonly environments = inject(EnvironmentStore);
  private readonly executionApi = inject(ExecutionApi);
  private readonly history = inject(HistoryStore);
  private readonly notifications = inject(NotificationService);
  private readonly settings = inject(SettingsStore);

  private readonly list = signal<EditorTab[]>([]);
  private readonly current = signal<string | null>(null);
  private readonly runs = new Map<string, Subscription>();

  readonly tabs = this.list.asReadonly();
  readonly activeId = this.current.asReadonly();
  readonly active = computed(() => this.list().find((tab) => tab.id === this.current()) ?? null);

  /** Ids de las pestañas con cambios sin guardar. */
  readonly dirtyIds = computed(
    () =>
      new Set(
        this.list()
          .filter((tab) => !draftsEqual(tab.draft, tab.baseline))
          .map((tab) => tab.id),
      ),
  );

  constructor() {
    // Elegir una petición en el árbol (o crearla) la abre.
    effect(() => {
      const id = this.collections.selectedRequestId();
      untracked(() => {
        if (id) this.open(id);
      });
    });

    // Lo que cambia en el árbol (renombrar, borrar) se refleja en las pestañas.
    effect(() => {
      const trees = this.collections.trees();
      const ready = this.collections.status() === 'ready';
      untracked(() => {
        if (ready) this.syncWithTrees(trees);
      });
    });
  }

  open(id: string): void {
    if (!this.list().some((tab) => tab.id === id)) {
      const request = findRequest(this.collections.trees(), id);
      if (!request) return;
      const draft = draftFromSaved(request);
      this.list.update((tabs) => [
        ...tabs,
        {
          id,
          collectionId: request.collectionId,
          title: request.name,
          baseline: draft,
          draft,
          running: false,
          result: null,
          wsdl: null,
        },
      ]);
    }
    this.activate(id);
  }

  activate(id: string): void {
    this.current.set(id);
    this.collections.selectRequest(id);
  }

  close(id: string): void {
    this.removeTabs([id]);
  }

  /** Cambia el borrador de una pestaña. */
  edit(id: string, change: (draft: RequestDraft) => RequestDraft): void {
    this.patch(id, (tab) => ({ ...tab, draft: change(tab.draft) }));
  }

  /** Guarda el borrador. Si no hay nada que guardar, no hace nada. */
  save(id: string): Observable<void> {
    const tab = this.byId(id);
    if (!tab) return of(undefined);

    const saved = tab.draft;
    return this.collections.updateRequest(tab.collectionId, id, toSaveDto(saved)).pipe(
      map(() => {
        this.patch(id, (current) => ({ ...current, baseline: saved }));
      }),
    );
  }

  /** Recuerda las operaciones leídas del WSDL de una petición. */
  setWsdl(id: string, wsdl: WsdlInspection | null): void {
    this.patch(id, (tab) => ({ ...tab, wsdl }));
  }

  send(id: string): void {
    const tab = this.byId(id);
    if (!tab || tab.running || !canSend(tab.draft)) return;

    const dto = toExecutionDto(tab.draft, {
      requestId: id,
      workspaceId: this.workspaces.activeId() ?? undefined,
      environmentId: this.environments.activeId() || undefined,
      ignoreSsl: this.settings.ignoreSsl(),
      // El backend sustituye las {{variables}} de URL, headers y body, pero en Basic las recibe ya en base64.
      resolve: (text) => interpolate(text, this.environments.variables()),
    });

    this.patch(id, (current) => ({ ...current, running: true }));
    this.runs.set(
      id,
      this.executionApi.run(dto).subscribe({
        next: (result) => {
          this.runs.delete(id);
          this.patch(id, (current) => ({ ...current, running: false, result }));
          this.history.refresh();
          // Un fallo de red del destino llega como respuesta normal; aquí se avisa.
          if (isExecutionError(result.response)) this.notifications.error(result.response.message);
        },
        error: () => {
          // El interceptor ya avisó.
          this.runs.delete(id);
          this.patch(id, (current) => ({ ...current, running: false }));
        },
      }),
    );
  }

  /**
   * Abre la petición de una ejecución del historial y muestra en ella lo que se obtuvo entonces.
   * El borrador no cambia: el historial no guarda el cuerpo enviado. Devuelve false si la petición ya no existe.
   */
  showHistory(detail: HistoryDetail): boolean {
    const id = detail.requestId;
    if (!id) return false;
    this.open(id);
    if (!this.byId(id)) return false;
    this.patch(id, (tab) => ({ ...tab, result: resultFromHistory(detail) }));
    return true;
  }

  cancel(id: string): void {
    this.runs.get(id)?.unsubscribe();
    this.runs.delete(id);
    this.patch(id, (tab) => ({ ...tab, running: false }));
  }

  // --- Internos ---
  private byId(id: string): EditorTab | undefined {
    return this.list().find((tab) => tab.id === id);
  }

  private patch(id: string, change: (tab: EditorTab) => EditorTab): void {
    this.list.update((tabs) => tabs.map((tab) => (tab.id === id ? change(tab) : tab)));
  }

  private syncWithTrees(trees: readonly CollectionTree[]): void {
    const gone: string[] = [];
    for (const tab of this.list()) {
      const request = findRequest(trees, tab.id);
      if (!request) gone.push(tab.id);
      else if (request.name !== tab.title)
        this.patch(tab.id, (t) => ({ ...t, title: request.name }));
    }
    if (gone.length) this.removeTabs(gone);
  }

  private removeTabs(ids: string[]): void {
    const before = this.list();
    const activeIndex = before.findIndex((tab) => tab.id === this.current());

    for (const id of ids) this.cancel(id);
    const after = before.filter((tab) => !ids.includes(tab.id));
    this.list.set(after);

    if (ids.includes(this.current() ?? '')) {
      // Pasa a la pestaña vecina, la que quedó en el mismo lugar o la última.
      const next = after[Math.min(activeIndex, after.length - 1)] ?? null;
      this.current.set(next?.id ?? null);
      this.collections.selectRequest(next?.id ?? null);
    }
  }
}
