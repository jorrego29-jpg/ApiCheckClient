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

type Field = 'key' | 'value';

/**
 * Tabla editable de pares clave-valor (params, headers). Siempre queda una fila vacía al final:
 * escribir en ella crea una fila nueva.
 */
@Component({
  selector: 'app-key-value-table',
  imports: [InputText],
  templateUrl: './key-value-table.html',
  styleUrl: './key-value-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyValueTable {
  readonly rows = input.required<readonly KeyValue[]>();
  readonly keyPlaceholder = input('Clave');
  readonly valuePlaceholder = input('Valor');
  readonly rowsChange = output<KeyValue[]>();

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
    this.rowsChange.emit([...this.rows(), row]);

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
