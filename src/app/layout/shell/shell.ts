import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { PrimeTemplate } from 'primeng/api';
import { Splitter } from 'primeng/splitter';
import { ApiConnection, ApiStatus } from '../../core/state/api-status';
import { CollectionsStore } from '../../core/state/collections.store';
import { TabsStore } from '../../core/state/tabs.store';
import { RequestEditor } from '../../features/editor/request-editor';
import { ResponseViewer } from '../../features/response/response-viewer';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { EnvironmentSwitcher } from '../environment-switcher/environment-switcher';
import { Sidebar } from '../sidebar/sidebar';
import { WorkspaceSwitcher } from '../workspace-switcher/workspace-switcher';

const STATUS_LABEL: Record<ApiConnection, string> = {
  checking: 'Conectando…',
  online: 'API conectada',
  offline: 'API sin conexión',
};

const STATUS_HINT: Record<ApiConnection, string> = {
  checking: 'Comprobando la conexión con el backend',
  online: 'El backend responde. Clic para comprobar de nuevo',
  offline: 'No hay conexión con el backend. Clic para reintentar',
};

/** Breakpoints de responsividad (debe coincidir con shell.scss) */
const BP_TABLET  = 768;
const BP_DESKTOP = 1024;

/** Estructura de la app: barra superior y tres zonas redimensionables (árbol, petición y respuesta).
 *  Responsividad:
 *  - Desktop ≥1024px : triple-pane horizontal + vertical splitter
 *  - Tablet 768–1023px: sidebar colapsable como panel lateral
 *  - Mobile <768px   : sidebar en drawer overlay + tabs Builder/Output
 */
@Component({
  selector: 'app-shell',
  imports: [
    Splitter,
    PrimeTemplate,
    Sidebar,
    WorkspaceSwitcher,
    EnvironmentSwitcher,
    RequestEditor,
    ResponseViewer,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly apiStatus = inject(ApiStatus);
  private readonly workspaces = inject(WorkspaceStore);
  private readonly collections = inject(CollectionsStore);
  // Se instancia aquí para que escuche la selección del árbol y abra las pestañas.
  private readonly tabs = inject(TabsStore);

  protected readonly statusLabel = computed(() => STATUS_LABEL[this.apiStatus.state()]);
  protected readonly statusHint  = computed(() => STATUS_HINT[this.apiStatus.state()]);

  // ── Sidebar (tablet/mobile) ──────────────────────────────────────
  /** Controla si el sidebar está visible en tablet/mobile. */
  protected readonly sidebarOpen = signal(false);

  /** Tab activo en mobile: 'builder' | 'output' */
  protected readonly mobileTab = signal<'builder' | 'output'>('builder');

  // ── Breakpoint detection ─────────────────────────────────────────
  private _width = signal(window.innerWidth);

  protected readonly isDesktop = computed(() => this._width() >= BP_DESKTOP);
  protected readonly isMobile  = computed(() => this._width() <  BP_TABLET);

  @HostListener('window:resize')
  onResize(): void {
    this._width.set(window.innerWidth);
    // En desktop cerramos el drawer para no dejar estado sucio
    if (this._width() >= BP_DESKTOP) this.sidebarOpen.set(false);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  setMobileTab(tab: 'builder' | 'output'): void {
    this.mobileTab.set(tab);
  }

  /** Vuelve a comprobar la conexión y, si los workspaces no llegaron, a pedirlos. */
  recheck(): void {
    this.apiStatus.check();
    if (this.workspaces.status() === 'error') this.workspaces.load();
  }

  constructor() {
    this.apiStatus.check();
    this.workspaces.load();

    // En tablet y móvil el árbol está en un drawer: al elegir una petición se cierra para dejar ver el editor.
    effect(() => {
      this.collections.selectedRequestId();
      untracked(() => {
        this.closeSidebar();
        this.mobileTab.set('builder');
      });
    });

    // En móvil, al enviar se pasa a ver la respuesta.
    effect(() => {
      const running = this.tabs.active()?.running;
      untracked(() => {
        if (running && this.isMobile()) this.mobileTab.set('output');
      });
    });
  }
}
