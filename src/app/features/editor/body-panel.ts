import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { BodyType, RequestBody } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { EnvironmentStore } from '../../core/state/environment.store';
import { CodeEditor } from '../../shared/components/code-editor/code-editor';

/** Pestaña Body: tipo (ninguno, JSON, XML) y el contenido en un editor con colores. */
@Component({
  selector: 'app-body-panel',
  imports: [SelectButton, Button, FormsModule, CodeEditor],
  templateUrl: './body-panel.html',
  styleUrl: './body-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyPanel {
  readonly body = input.required<RequestBody>();
  readonly bodyChange = output<RequestBody>();

  private readonly notifications = inject(NotificationService);
  protected readonly environments = inject(EnvironmentStore);

  protected readonly types: { label: string; value: BodyType; disabled?: boolean }[] = [
    { label: 'Ninguno', value: 'none' },
    { label: 'JSON', value: 'json' },
    { label: 'XML', value: 'xml' },
    // El backend aún no sabe enviar multipart: se deja a la vista pero apagado.
    { label: 'form-data', value: 'form-data', disabled: true },
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
}
