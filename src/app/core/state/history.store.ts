import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { HistoryApi } from '../api/history.api';
import { HistoryEntry } from '../models';
import { LoadStatus } from './load-status';

/** Qué ejecuciones se listan: las de un workspace y, si se indica, las de una sola petición. */
interface HistoryScope {
  workspaceId: string | null;
  requestId: string | null;
}

/**
 * Últimas ejecuciones del workspace. No pide nada hasta que alguien lo observa con `watch`
 * (el panel de historial); desde entonces `refresh` lo mantiene al día tras cada envío.
 */
@Injectable({ providedIn: 'root' })
export class HistoryStore {
  private readonly api = inject(HistoryApi);

  private readonly state = signal<HistoryEntry[]>([]);
  private readonly loadStatus = signal<LoadStatus>('idle');
  private scope: HistoryScope | null = null;
  private inflight?: Subscription;

  readonly entries = this.state.asReadonly();
  readonly status = this.loadStatus.asReadonly();

  /** Cambia lo que se lista y lo vuelve a pedir. Repetir el mismo alcance no hace nada. */
  watch(workspaceId: string | null, requestId: string | null = null): void {
    if (this.scope?.workspaceId === workspaceId && this.scope.requestId === requestId) return;
    this.scope = { workspaceId, requestId };
    this.state.set([]);
    this.load(true);
  }

  /** Vuelve a pedir la lista actual sin vaciarla. Si nadie la observa, no hace nada. */
  refresh(): void {
    if (this.scope) this.load(false);
  }

  /** Detalle completo de una ejecución (cuerpo y headers incluidos). */
  detail(id: string) {
    return this.api.get(id);
  }

  private load(reset: boolean): void {
    this.inflight?.unsubscribe();
    const scope = this.scope;
    if (!scope?.workspaceId) {
      this.state.set([]);
      this.loadStatus.set('idle');
      return;
    }

    if (reset) this.loadStatus.set('loading');
    this.inflight = this.api
      .list({
        workspaceId: scope.workspaceId,
        requestId: scope.requestId ?? undefined,
        limit: HISTORY_LIMIT,
      })
      .subscribe({
        next: (entries) => {
          this.state.set(entries);
          this.loadStatus.set('ready');
        },
        // El interceptor ya avisó; con una lista a la vista se conserva.
        error: () => {
          if (reset) this.loadStatus.set('error');
        },
      });
  }
}

export const HISTORY_LIMIT = 50;
