import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { AuthType, RequestAuth } from '../../core/models';

/** Pestaña Auth: elige el tipo y pide sus datos. La cabecera Authorization se arma al enviar. */
@Component({
  selector: 'app-auth-panel',
  imports: [Select, InputText, FormsModule],
  templateUrl: './auth-panel.html',
  styleUrl: './auth-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPanel {
  readonly auth = input.required<RequestAuth>();
  readonly authChange = output<RequestAuth>();

  protected readonly types: { label: string; value: AuthType }[] = [
    { label: 'Sin autenticación', value: 'none' },
    { label: 'Bearer Token', value: 'bearer' },
    { label: 'Basic Auth', value: 'basic' },
  ];

  protected readonly reveal = signal(false);
  protected readonly tokenHint = 'Token o {{variable}}';

  protected setType(type: AuthType): void {
    this.authChange.emit({ type, config: this.auth().config });
  }

  protected setConfig(patch: NonNullable<RequestAuth['config']>): void {
    this.authChange.emit({ ...this.auth(), config: { ...this.auth().config, ...patch } });
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
