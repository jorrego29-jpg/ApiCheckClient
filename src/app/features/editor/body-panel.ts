import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { BodyType, FormDataFile, KeyValue, RequestBody } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { EnvironmentStore } from '../../core/state/environment.store';
import { CodeEditor } from '../../shared/components/code-editor/code-editor';
import { KeyValueTable } from '../../shared/components/key-value-table/key-value-table';

/** Pestaña Body: tipo (ninguno, JSON, XML, form-data) y su contenido: un editor con colores o los campos y archivos. */
@Component({
  selector: 'app-body-panel',
  imports: [SelectButton, Button, InputText, FormsModule, CodeEditor, KeyValueTable],
  templateUrl: './body-panel.html',
  styleUrl: './body-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyPanel {
  readonly body = input.required<RequestBody>();
  readonly bodyChange = output<RequestBody>();

  private readonly notifications = inject(NotificationService);
  protected readonly environments = inject(EnvironmentStore);

  protected readonly types: { label: string; value: BodyType }[] = [
    { label: 'Ninguno', value: 'none' },
    { label: 'JSON', value: 'json' },
    { label: 'XML', value: 'xml' },
    { label: 'form-data', value: 'form-data' },
  ];

  protected readonly language = computed(() => (this.body().type === 'xml' ? 'xml' : 'json'));
  protected readonly hint = computed(() =>
    this.body().type === 'xml' ? '<root>…</root>' : '{ "clave": "valor" }',
  );

  protected setType(type: BodyType): void {
    this.bodyChange.emit({ ...this.body(), type });
  }

  protected setContent(content: string): void {
    this.bodyChange.emit({ ...this.body(), content });
  }

  protected format(): void {
    try {
      const formatted = JSON.stringify(JSON.parse(this.body().content), null, 2);
      this.setContent(formatted);
    } catch {
      this.notifications.error(
        'No se pudo dar formato: el JSON no es válido. Si usas {{variables}} sin comillas, es normal.',
      );
    }
  }

  // --- form-data ---
  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setFields(fields: KeyValue[]): void {
    this.bodyChange.emit({ ...this.body(), fields });
  }

  private setFiles(files: FormDataFile[]): void {
    this.bodyChange.emit({ ...this.body(), files });
  }

  protected addFile(): void {
    this.setFiles([...(this.body().files ?? []), { key: '', name: '', type: '', data: '' }]);
  }

  protected patchFile(index: number, patch: Partial<FormDataFile>): void {
    this.setFiles(
      (this.body().files ?? []).map((file, i) => (i === index ? { ...file, ...patch } : file)),
    );
  }

  protected removeFile(index: number): void {
    this.setFiles((this.body().files ?? []).filter((_, i) => i !== index));
  }

  /** Lee el archivo elegido en base64: así viaja dentro del JSON que recibe el backend. */
  protected pick(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // para poder volver a elegir el mismo archivo
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () =>
      this.patchFile(index, {
        name: file.name,
        type: file.type,
        data: String(reader.result).split(',')[1] ?? '', // sin el prefijo "data:…;base64,"
      });
    reader.onerror = () => this.notifications.error(`No se pudo leer el archivo ${file.name}.`);
    reader.readAsDataURL(file);
  }
}
