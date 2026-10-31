import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { NotificationService } from '../../core/notifications/notification.service';
import { TabsStore } from '../../core/state/tabs.store';
import { CodeEditor } from '../../shared/components/code-editor/code-editor';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { HeaderList } from './header-list';
import { SentRequest } from './sent-request';
import {
  BodyView,
  LARGE_BODY_PREVIEW,
  ResultView,
  downloadInfo,
  formatBytes,
  formatDuration,
  toResultView,
} from './response-view';

type Section = 'body' | 'headers' | 'sent';

/** Respuesta de la petición abierta: estado, tiempo, tamaño, cuerpo, cabeceras y la petición tal como se envió. */
@Component({
  selector: 'app-response-viewer',
  imports: [
    Button,
    ProgressSpinner,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    CodeEditor,
    EmptyState,
    HeaderList,
    SentRequest,
  ],
  templateUrl: './response-viewer.html',
  styleUrl: './response-viewer.scss',
  // Los estilos retocan elementos internos de PrimeNG (p-tabs).
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponseViewer {
  private readonly store = inject(TabsStore);
  private readonly notifications = inject(NotificationService);

  protected readonly tab = this.store.active;
  protected readonly section = signal<Section>('body');
  protected readonly wrap = signal(true);

  protected readonly view = computed<ResultView | null>(() => {
    const result = this.tab()?.result;
    return result ? toResultView(result) : null;
  });

  protected readonly formatBytes = formatBytes;
  protected readonly formatDuration = formatDuration;

  protected setSection(value: string | number | undefined): void {
    if (typeof value === 'string') this.section.set(value as Section);
  }

  /** Un cuerpo grande se muestra recortado y como texto plano. */
  protected preview(body: BodyView): string {
    return body.text.slice(0, LARGE_BODY_PREVIEW);
  }

  protected async copy(body: BodyView): Promise<void> {
    try {
      await navigator.clipboard.writeText(body.text);
      this.notifications.info('Copiado al portapapeles');
    } catch {
      this.notifications.error('No se pudo copiar: el navegador no dio acceso al portapapeles.');
    }
  }

  protected download(body: BodyView): void {
    const { extension, mime } = downloadInfo(body.language);
    const url = URL.createObjectURL(new Blob([body.text], { type: `${mime};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `respuesta.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
