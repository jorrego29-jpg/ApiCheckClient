import { ExecutableMethod, ExecutionResult, HistoryDetail } from '../models';

/**
 * Reconstruye lo que se vio al ejecutar, a partir del registro guardado. El historial no guarda el
 * cuerpo ni los params enviados, así que la petición se muestra sin ellos.
 */
export function resultFromHistory(detail: HistoryDetail): ExecutionResult {
  const metrics = { timeMs: detail.durationMs, sizeBytes: detail.sizeBytes };
  const body = parseBody(detail.responseBody);

  const request = {
    url: detail.executedUrl,
    method: detail.method as ExecutableMethod,
    headers: stringValues(detail.requestHeaders),
    params: {},
    body: null,
  };

  // Estado 0: la ejecución falló antes de obtener respuesta y el cuerpo guardado es el mensaje.
  if (detail.status === 0) {
    const message = typeof body === 'string' && body ? body : detail.statusText;
    return { request, response: { error: true, message, metrics } };
  }

  return {
    request,
    response: {
      status: detail.status,
      statusText: detail.statusText,
      headers: detail.responseHeaders ?? {},
      data: body,
      metrics,
    },
  };
}

/** El backend guarda `JSON.stringify(data)`: un texto (XML, HTML…) queda entrecomillado. */
function parseBody(raw: string | null): unknown {
  if (raw === null || raw === '') return '';
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function stringValues(headers: Record<string, unknown> | null): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key, String(value)]),
  );
}
