import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { PrimeTemplate } from 'primeng/api';
import { Select } from 'primeng/select';
import { Splitter } from 'primeng/splitter';
import { ApiConnection, ApiStatus } from '../../core/state/api-status';

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
  imports: [Splitter, PrimeTemplate, Select],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly apiStatus = inject(ApiStatus);

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

  constructor() {
    this.apiStatus.check();
  }
}
