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

/** Diálogo de un solo campo de texto: crear o renombrar algo que solo tiene nombre. */
@Component({
  selector: 'app-name-dialog',
  imports: [Dialog, Button, InputText, FormsModule],
  templateUrl: './name-dialog.html',
  styleUrl: './name-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NameDialog {
  readonly visible = model(false);
  readonly title = input.required<string>();
  readonly label = input('Nombre');
  readonly confirmLabel = input('Guardar');
  /** Texto con el que se abre el campo (el nombre actual al renombrar). */
  readonly value = input('');
  /** Mientras la operación está en curso, el botón no admite otro envío. */
  readonly busy = input(false);

  readonly confirmed = output<string>();

  protected readonly draft = signal('');

  constructor() {
    effect(() => {
      if (this.visible()) this.draft.set(untracked(this.value));
    });
  }

  protected submit(): void {
    const name = this.draft().trim();
    if (name && !this.busy()) this.confirmed.emit(name);
  }
}
