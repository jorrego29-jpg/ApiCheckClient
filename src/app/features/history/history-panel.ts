import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Button } from 'primeng/button';
import { HistoryEntry } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { HistoryStore } from '../../core/state/history.store';
import { CollectionsStore } from '../../core/state/collections.store';
import { findRequest } from '../../core/state/request-lookup';
import { TabsStore } from '../../core/state/tabs.store';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { formatDuration, statusKind } from '../response/response-view';
import { formatWhen, shortUrl } from './history-view';

interface HistoryRow {
  entry: HistoryEntry;
  /** SOAP o el método HTTP. */
  badge: string;
  url: string;
  status: string;
  statusKind: string;
  /** Nombre de la petición, si todavía existe. */
  name: string | null;
  when: string;
  duration: string;
}

/** Últimas ejecuciones del workspace, con filtro por la petición abierta. Pulsar una la muestra en su pestaña. */
@Component({
  selector: 'app-history-panel',
  imports: [Button],
  templateUrl: './history-panel.html',
  styleUrl: './history-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPanel {
  protected readonly store = inject(HistoryStore);
  protected readonly tabs = inject(TabsStore);
  protected readonly workspaces = inject(WorkspaceStore);
  private readonly collections = inject(CollectionsStore);
  private readonly notifications = inject(NotificationService);

  private readonly onlyThisRequest = signal(false);
  /** Ejecución que se está abriendo, para no pedirla dos veces. */
  protected readonly opening = signal<string | null>(null);

  /** El filtro solo cuenta mientras haya una petición abierta. */
  protected readonly filtering = computed(() => this.onlyThisRequest() && !!this.tabs.activeId());

  protected readonly rows = computed<HistoryRow[]>(() => {
    const trees = this.collections.trees();
    return this.store.entries().map((entry) => {
      const request = entry.requestId ? findRequest(trees, entry.requestId) : null;
      return {
        entry,
        badge: request?.protocol === 'SOAP' ? 'SOAP' : entry.method,
        url: shortUrl(entry.executedUrl),
        status: entry.status === 0 ? 'Error' : String(entry.status),
        statusKind: statusKind(entry.status),
        name: request?.name ?? null,
        when: formatWhen(entry.createdAt),
        duration: formatDuration(entry.durationMs),
      };
    });
  });

  constructor() {
    effect(() => {
      const workspaceId = this.workspaces.activeId();
      const requestId = this.filtering() ? this.tabs.activeId() : null;
      untracked(() => this.store.watch(workspaceId, requestId));
    });
  }

  protected setFilter(onlyThis: boolean): void {
    this.onlyThisRequest.set(onlyThis);
  }

  protected open(entry: HistoryEntry): void {
    if (this.opening()) return;
    this.opening.set(entry.id);
    this.store.detail(entry.id).subscribe({
      next: (detail) => {
        this.opening.set(null);
        if (!this.tabs.showHistory(detail)) {
          this.notifications.info('La petición de esta ejecución ya no existe.');
        }
      },
      // El interceptor ya avisó.
      error: () => this.opening.set(null),
    });
  }
}
