import { Injectable, signal } from '@angular/core';

export const IGNORE_SSL_KEY = 'apicheck.ignoreSsl';

/**
 * Ajustes del usuario que valen para todas las peticiones y se recuerdan en este navegador.
 * `ignoreSsl`: el backend no verifica el certificado TLS del destino (certificados autofirmados de desarrollo).
 */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly ssl = signal(readFlag(IGNORE_SSL_KEY));

  readonly ignoreSsl = this.ssl.asReadonly();

  setIgnoreSsl(value: boolean): void {
    this.ssl.set(value);
    writeFlag(IGNORE_SSL_KEY, value);
  }
}

function readFlag(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) globalThis.localStorage?.setItem(key, 'true');
    else globalThis.localStorage?.removeItem(key);
  } catch {
    // Sin almacenamiento: el ajuste simplemente no se recuerda.
  }
}
