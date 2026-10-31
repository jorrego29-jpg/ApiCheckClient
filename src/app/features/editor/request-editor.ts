import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { finalize } from 'rxjs';
import {
  EXECUTABLE_METHODS,
  HttpMethod,
  KeyValue,
  RequestAuth,
  RequestBody,
} from '../../core/models';
import {
  RequestDraft,
  canSend,
  isExecutableMethod,
  withParams,
  withUrl,
} from '../../core/requests/request-draft';
import { TabsStore } from '../../core/state/tabs.store';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { KeyValueTable } from '../../shared/components/key-value-table/key-value-table';
import { VariableInput } from '../../shared/components/variable-input/variable-input';
import { AuthPanel } from './auth-panel';
import { BodyPanel } from './body-panel';
import { TabsBar } from './tabs-bar';

type Section = 'params' | 'headers' | 'body' | 'auth';

const activeRows = (rows: readonly KeyValue[]) =>
  rows.filter((row) => row.enabled && row.key.trim() !== '').length;

/** Editor de la petición abierta: método y URL, params, headers, body y auth, con Enviar y Guardar. */
@Component({
  selector: 'app-request-editor',
  imports: [
    FormsModule,
    Button,
    VariableInput,
    Select,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    TabsBar,
    EmptyState,
    KeyValueTable,
    BodyPanel,
    AuthPanel,
  ],
  templateUrl: './request-editor.html',
  styleUrl: './request-editor.scss',
  // Los estilos retocan elementos internos de PrimeNG (p-tabs).
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestEditor {
  protected readonly store = inject(TabsStore);
  protected readonly tab = this.store.active;

  protected readonly section = signal<Section>('params');
  protected readonly saving = signal(false);

  protected readonly dirty = computed(() => {
    const tab = this.tab();
    return !!tab && this.store.dirtyIds().has(tab.id);
  });
  protected readonly sendable = computed(() => {
    const tab = this.tab();
    return !!tab && canSend(tab.draft);
  });
  protected readonly paramsCount = computed(() => activeRows(this.tab()?.draft.params ?? []));
  protected readonly headersCount = computed(() => activeRows(this.tab()?.draft.headers ?? []));
  protected readonly bodyOn = computed(() => (this.tab()?.draft.body.type ?? 'none') !== 'none');
  protected readonly authOn = computed(() => (this.tab()?.draft.auth.type ?? 'none') !== 'none');

  /** Los métodos que se pueden ejecutar y, si la petición trae otro (HEAD, OPTIONS), ese también para mostrarlo. */
  protected readonly methods = computed<HttpMethod[]>(() => {
    const current = this.tab()?.draft.method;
    const base: HttpMethod[] = [...EXECUTABLE_METHODS];
    return current && !isExecutableMethod(current) ? [...base, current] : base;
  });

  protected readonly sendHint = computed(() => {
    const draft = this.tab()?.draft;
    if (!draft) return '';
    if (!isExecutableMethod(draft.method)) return `${draft.method} aún no se puede ejecutar`;
    return draft.url.trim() ? 'Enviar (Ctrl+Enter)' : 'Escribe una URL para enviar';
  });

  protected setSection(value: string | number | undefined): void {
    if (typeof value === 'string') this.section.set(value as Section);
  }

  // --- Edición ---
  protected edit(change: (draft: RequestDraft) => RequestDraft): void {
    const tab = this.tab();
    if (tab) this.store.edit(tab.id, change);
  }

  protected setMethod(method: HttpMethod): void {
    this.edit((draft) => ({ ...draft, method }));
  }

  protected setUrl(url: string): void {
    this.edit((draft) => withUrl(draft, url));
  }

  protected setParams(params: KeyValue[]): void {
    this.edit((draft) => withParams(draft, params));
  }

  protected setHeaders(headers: KeyValue[]): void {
    this.edit((draft) => ({ ...draft, headers }));
  }

  protected setBody(body: RequestBody): void {
    this.edit((draft) => ({ ...draft, body }));
  }

  protected setAuth(auth: RequestAuth): void {
    this.edit((draft) => ({ ...draft, auth }));
  }

  // --- Acciones ---
  protected send(): void {
    const tab = this.tab();
    if (tab) this.store.send(tab.id);
  }

  protected cancel(): void {
    const tab = this.tab();
    if (tab) this.store.cancel(tab.id);
  }

  protected save(): void {
    const tab = this.tab();
    if (!tab || !this.dirty() || this.saving()) return;
    this.saving.set(true);
    this.store
      .save(tab.id)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({ error: () => undefined }); // el interceptor ya avisó
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.send();
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.save();
    }
  }
}
