import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { finalize } from 'rxjs';
import { ExecutionApi } from '../../core/api/execution.api';
import { KeyValue, RequestAuth, WsdlOperation } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { RequestDraft, withScheme } from '../../core/requests/request-draft';
import { EnvironmentStore } from '../../core/state/environment.store';
import { SettingsStore } from '../../core/state/settings.store';
import { TabsStore } from '../../core/state/tabs.store';
import { interpolate } from '../../core/variables/variables';
import { CodeEditor } from '../../shared/components/code-editor/code-editor';
import { KeyValueTable } from '../../shared/components/key-value-table/key-value-table';
import { VariableInput } from '../../shared/components/variable-input/variable-input';
import { AuthPanel } from './auth-panel';

type Section = 'envelope' | 'headers' | 'auth';

const operationKey = (operation: WsdlOperation) =>
  `${operation.service}/${operation.port}/${operation.name}`;

const activeRows = (rows: readonly KeyValue[]) =>
  rows.filter((row) => row.enabled && row.key.trim() !== '').length;

/**
 * Parte SOAP del editor: el WSDL (opcional) para rellenar endpoint, SOAPAction y un envelope de
 * ejemplo, y el envelope que se envía tal cual. La URL y los botones viven en la barra del editor.
 */
@Component({
  selector: 'app-soap-editor',
  imports: [
    FormsModule,
    Button,
    ConfirmDialog,
    Select,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    CodeEditor,
    KeyValueTable,
    VariableInput,
    AuthPanel,
  ],
  providers: [ConfirmationService],
  templateUrl: './soap-editor.html',
  styleUrl: './soap-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoapEditor {
  private readonly store = inject(TabsStore);
  private readonly api = inject(ExecutionApi);
  private readonly confirmation = inject(ConfirmationService);
  private readonly notifications = inject(NotificationService);
  protected readonly environments = inject(EnvironmentStore);
  private readonly settings = inject(SettingsStore);

  protected readonly tab = this.store.active;
  protected readonly section = signal<Section>('envelope');
  protected readonly loading = signal(false);
  private readonly chosen = signal<string | null>(null);

  protected readonly operations = computed(() => this.tab()?.wsdl?.operations ?? []);
  protected readonly options = computed(() => {
    const operations = this.operations();
    const severalPorts = new Set(operations.map((operation) => operation.port)).size > 1;
    return operations.map((operation) => ({
      key: operationKey(operation),
      label: severalPorts ? `${operation.name} · ${operation.port}` : operation.name,
    }));
  });

  /** La operación elegida; al abrir una petición ya preparada, la que coincide con su endpoint y SOAPAction. */
  protected readonly picked = computed(() => {
    const chosen = this.chosen();
    if (chosen) return chosen;
    const draft = this.tab()?.draft;
    const match = draft
      ? this.operations().find(
          (operation) =>
            operation.endpoint === draft.url && operation.soapAction === (draft.soapAction ?? ''),
        )
      : undefined;
    return match ? operationKey(match) : null;
  });
  protected readonly operation = computed(
    () => this.operations().find((operation) => operationKey(operation) === this.picked()) ?? null,
  );

  protected readonly canLoad = computed(
    () => (this.tab()?.draft.wsdlUrl ?? '').trim() !== '' && !this.loading(),
  );
  protected readonly headersCount = computed(() => activeRows(this.tab()?.draft.headers ?? []));
  protected readonly authOn = computed(() => (this.tab()?.draft.auth.type ?? 'none') !== 'none');

  protected setSection(value: string | number | undefined): void {
    if (typeof value === 'string') this.section.set(value as Section);
  }

  // --- Edición ---
  private edit(change: (draft: RequestDraft) => RequestDraft): void {
    const tab = this.tab();
    if (tab) this.store.edit(tab.id, change);
  }

  protected setWsdlUrl(wsdlUrl: string): void {
    this.edit((draft) => ({ ...draft, wsdlUrl: wsdlUrl === '' ? null : wsdlUrl }));
  }

  protected setAction(soapAction: string): void {
    this.edit((draft) => ({ ...draft, soapAction: soapAction === '' ? null : soapAction }));
  }

  protected setEnvelope(content: string): void {
    this.edit((draft) => ({
      ...draft,
      body: { type: content.trim() === '' ? 'none' : 'xml', content },
    }));
  }

  protected setHeaders(headers: KeyValue[]): void {
    this.edit((draft) => ({ ...draft, headers }));
  }

  protected setAuth(auth: RequestAuth): void {
    this.edit((draft) => ({ ...draft, auth }));
  }

  // --- WSDL ---
  protected load(): void {
    const tab = this.tab();
    const typed = (tab?.draft.wsdlUrl ?? '').trim();
    if (!tab || !typed || this.loading()) return;

    // El backend no sustituye {{variables}} al leer el WSDL: se hace aquí.
    const url = withScheme(interpolate(typed, this.environments.variables()));
    this.loading.set(true);
    this.api
      .inspectWsdl(url, this.settings.ignoreSsl())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (wsdl) => {
          this.store.setWsdl(tab.id, wsdl);
          this.chosen.set(null);
          if (wsdl.operations.length === 0) {
            this.notifications.error('El WSDL se leyó, pero no declara ninguna operación.');
          }
        },
        error: () => undefined, // el interceptor ya avisó
      });
  }

  /** Elegir una operación rellena endpoint y SOAPAction; el envelope solo si no hay uno escrito a mano. */
  protected pick(key: string | null): void {
    const operation = this.operations().find((candidate) => operationKey(candidate) === key);
    if (!operation) return;
    this.chosen.set(key);
    this.edit((draft) => ({
      ...draft,
      url: operation.endpoint || draft.url,
      soapAction: operation.soapAction || null,
      body: this.isUntouched(draft.body.content)
        ? { type: 'xml', content: operation.sampleEnvelope }
        : draft.body,
    }));
  }

  /** Pone el envelope de ejemplo de la operación elegida; pide confirmar si habría que pisar uno editado. */
  protected generate(): void {
    const operation = this.operation();
    const tab = this.tab();
    if (!operation || !tab) return;
    const apply = () =>
      this.edit((draft) => ({
        ...draft,
        body: { type: 'xml', content: operation.sampleEnvelope },
      }));

    if (this.isUntouched(tab.draft.body.content)) {
      apply();
      return;
    }
    this.confirmation.confirm({
      header: 'Reemplazar el envelope',
      message: 'El envelope actual tiene cambios. ¿Reemplazarlo por el de ejemplo de la operación?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Reemplazar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-text',
      accept: apply,
    });
  }

  /** Vacío, o idéntico al ejemplo de alguna operación: se puede cambiar sin perder trabajo. */
  private isUntouched(content: string): boolean {
    return (
      content.trim() === '' ||
      this.operations().some((operation) => operation.sampleEnvelope === content)
    );
  }
}
