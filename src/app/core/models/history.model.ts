/** Fila del listado GET /history (sin cuerpo ni headers de la respuesta). */
export interface HistoryEntry {
  id: string;
  requestId: string | null;
  executedUrl: string;
  method: string;
  status: number; // 0 cuando la ejecución falló antes de obtener respuesta
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  createdAt: string;
}

/** Detalle completo de GET /history/:id. */
export interface HistoryDetail extends HistoryEntry {
  requestHeaders: Record<string, unknown>;
  responseHeaders: Record<string, unknown>;
  responseBody: string | null;
}
