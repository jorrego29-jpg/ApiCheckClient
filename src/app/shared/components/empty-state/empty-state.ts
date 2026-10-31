import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Estado vacío de un panel: un recuadro con brillo y un texto debajo. */
@Component({
  selector: 'app-empty-state',
  template: '<ng-content />',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 120px;
      gap: 12px;
      padding: 16px;
      color: var(--text-muted);
      font-size: var(--text-sm);
      text-align: center;
      opacity: 0.7;
    }

    :host::before {
      content: '';
      display: block;
      width: 32px;
      height: 32px;
      border: 1.5px solid var(--border-active);
      border-radius: var(--radius-md);
      background: var(--cyan-wash);
      box-shadow: 0 0 12px var(--cyan-glow);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {}
