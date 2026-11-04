import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { EXECUTABLE_METHODS, ExecutableMethod, ProtocolType } from '../../../core/models';

export interface NewRequestChoice {
  name: string;
  protocol: ProtocolType;
  /** Solo en REST. */
  method?: ExecutableMethod;
}

/** Diálogo para crear una petición: nombre, protocolo y, en REST, método. */
@Component({
  selector: 'app-request-dialog',
  imports: [Dialog, Button, InputText, Select, FormsModule],
  templateUrl: './request-dialog.html',
  styleUrl: './request-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestDialog {
  readonly visible = model(false);
  readonly busy = input(false);
  readonly confirmed = output<NewRequestChoice>();

  protected readonly protocols: { label: string; value: ProtocolType }[] = [
    { label: 'REST', value: 'REST' },
    { label: 'SOAP', value: 'SOAP' },
  ];
  protected readonly methods = [...EXECUTABLE_METHODS];

  protected readonly name = signal('');
  protected readonly protocol = signal<ProtocolType>('REST');
  protected readonly method = signal<ExecutableMethod>('GET');

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        this.name.set('');
        this.protocol.set('REST');
        this.method.set('GET');
      });
    });
  }

  protected submit(): void {
    const name = this.name().trim();
    if (!name || this.busy()) return;
    const protocol = this.protocol();
    this.confirmed.emit(
      protocol === 'REST' ? { name, protocol, method: this.method() } : { name, protocol },
    );
  }
}
