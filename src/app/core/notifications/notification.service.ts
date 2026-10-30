import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

export type ToastKind = 'error' | 'success' | 'info';

const SEVERITY: Record<ToastKind, 'error' | 'success' | 'info'> = {
  error: 'error',
  success: 'success',
  info: 'info',
};

const SUMMARY: Record<ToastKind, string> = {
  error: 'Error',
  success: 'Listo',
  info: 'Aviso',
};

/** Avisos breves en pantalla. Se muestran con <p-toast> (ver App). */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly messages = inject(MessageService);

  /** Avisos visibles ahora mismo: evita apilar el mismo mensaje si varias peticiones fallan a la vez. */
  private readonly visible = new Set<string>();

  error(message: string, durationMs = 6000): void {
    this.push('error', message, durationMs);
  }

  success(message: string, durationMs = 3000): void {
    this.push('success', message, durationMs);
  }

  info(message: string, durationMs = 4000): void {
    this.push('info', message, durationMs);
  }

  private push(kind: ToastKind, message: string, durationMs: number): void {
    const signature = `${kind}:${message}`;
    if (this.visible.has(signature)) return;

    this.visible.add(signature);
    setTimeout(() => this.visible.delete(signature), durationMs);

    this.messages.add({
      severity: SEVERITY[kind],
      summary: SUMMARY[kind],
      detail: message,
      life: durationMs,
    });
  }
}
