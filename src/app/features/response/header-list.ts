import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HeaderRow } from './response-view';

/** Lista de pares nombre → valor (cabeceras, params). */
@Component({
  selector: 'app-header-list',
  template: `
    <dl class="pairs">
      @for (row of rows(); track $index) {
        <dt>{{ row.name }}</dt>
        <dd>{{ row.value }}</dd>
      }
    </dl>
  `,
  styles: `
    :host {
      display: block;
    }

    .pairs {
      display: grid;
      grid-template-columns: minmax(120px, max-content) minmax(0, 1fr);
      gap: 4px 16px;
      margin: 0;
      font-family: var(--font-mono);
      font-size: var(--text-sm);
    }

    dt {
      color: var(--cyan);
    }

    dd {
      margin: 0;
      color: var(--text);
      word-break: break-all;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderList {
  readonly rows = input.required<readonly HeaderRow[]>();
}
