import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import { InputText } from 'primeng/inputtext';
import { KeyValue } from '../../../core/models';
import { VariableInput } from '../variable-input/variable-input';

type Field = 'key' | 'value';

/**
 * Tabla editable de pares clave-valor (params, headers). Siempre queda una fila vacía al final:
 * escribir en ella crea una fila nueva.
 */
@Component({
  selector: 'app-key-value-table',
  imports: [InputText, VariableInput],
  templateUrl: './key-value-table.html',
  styleUrl: './key-value-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyValueTable<T extends KeyValue = KeyValue> {
  readonly rows = input.required<readonly T[]>();
  readonly keyPlaceholder = input('Clave');
  readonly valuePlaceholder = input('Valor');
  /** Pinta las {{variables}} de los valores. Se apaga donde no se sustituyen. */
  readonly highlight = input(true);
  readonly rowsChange = output<T[]>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected change(index: number, patch: Partial<KeyValue>): void {
    this.rowsChange.emit(this.rows().map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  protected remove(index: number): void {
    this.rowsChange.emit(this.rows().filter((_, i) => i !== index));
  }

  /** Se escribió en la fila vacía del final: pasa a ser una fila real y el cursor la sigue. */
  protected add(event: Event, field: Field): void {
    const input = event.target as HTMLInputElement;
    const index = this.rows().length;
    const row: KeyValue = { key: '', value: '', enabled: true, [field]: input.value };
    input.value = '';
    // La fila nueva solo tiene lo de KeyValue; lo que añada quien usa la tabla (un id, por ejemplo) llega después.
    this.rowsChange.emit([...this.rows(), row as T]);

    afterNextRender(
      () => {
        const target = this.host.nativeElement.querySelector<HTMLInputElement>(
          `[data-index="${index}"] [data-field="${field}"]`,
        );
        target?.focus();
        target?.setSelectionRange(target.value.length, target.value.length);
      },
      { injector: this.injector },
    );
  }
}
