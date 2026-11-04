import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { InputText } from 'primeng/inputtext';
import { EnvironmentStore } from '../../../core/state/environment.store';
import { describeVariables, splitVariables } from '../../../core/variables/variables';

/**
 * Campo de texto de una línea que pinta las `{{variables}}`: con color de acento si tienen valor
 * en el entorno activo y en ámbar si no. Detrás del `<input>` va una copia del texto, con las mismas
 * medidas y transparente, donde solo se ve el fondo de las variables. Pasar el cursor por encima
 * muestra a qué equivale cada una.
 */
@Component({
  selector: 'app-variable-input',
  imports: [InputText],
  templateUrl: './variable-input.html',
  styleUrl: './variable-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VariableInput {
  readonly value = input('');
  readonly placeholder = input('');
  /** Nombre accesible del campo. */
  readonly label = input<string | null>(null);
  /** `password` oculta el texto y, con él, el resaltado: no habría cómo alinearlo con los puntos. */
  readonly type = input<'text' | 'password'>('text');
  /** Marca `data-field` del `<input>`, para que quien lo contiene lo encuentre. */
  readonly dataField = input<string | null>(null);
  readonly autocomplete = input('off');
  /** Falso en los sitios donde las variables no se sustituyen (la tabla de variables misma). */
  readonly highlight = input(true);

  readonly valueChange = output<string>();
  readonly enter = output<void>();

  private readonly environments = inject(EnvironmentStore);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly mirror = viewChild<ElementRef<HTMLElement>>('mirror');

  protected readonly shown = computed(() => this.highlight() && this.type() === 'text');
  protected readonly segments = computed(() =>
    this.shown() ? splitVariables(this.value(), this.environments.variables()) : [],
  );
  protected readonly hint = computed(() =>
    this.segments().some((segment) => segment.variable)
      ? describeVariables(this.value(), this.environments.variables())
      : null,
  );

  constructor() {
    // Con el texto nuevo ya pintado, la copia se pone en el mismo punto de desplazamiento que el campo.
    afterRenderEffect(() => {
      this.segments();
      this.sync();
    });
  }

  /** Lleva el foco al campo. */
  focus(): void {
    this.field().nativeElement.focus();
  }

  protected onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value);
    this.sync();
  }

  /** Un texto largo se desplaza dentro del campo: la copia tiene que seguirlo. */
  protected sync(): void {
    const mirror = this.mirror()?.nativeElement;
    if (mirror) mirror.scrollLeft = this.field().nativeElement.scrollLeft;
  }
}
