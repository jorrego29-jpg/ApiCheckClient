import { ExecutionResult, isExecutionError } from '../../core/models';

export type StatusKind = 'info' | 'ok' | 'redirect' | 'client' | 'server' | 'unknown';
export type BodyLanguage = 'json' | 'xml' | 'text';

export interface HeaderRow {
  name: string;
  value: string;
}

export interface BodyView {
  text: string;
  language: BodyLanguage;
  empty: boolean;
  /** Demasiado grande para el editor: se muestra como texto plano y recortado. */
  large: boolean;
}

export interface SentView {
  method: string | null;
  url: string;
  headers: HeaderRow[];
  params: HeaderRow[];
  body: BodyView;
}

export interface ResponseView {
  kind: 'response';
  status: number;
  statusText: string;
  statusKind: StatusKind;
  timeMs: number;
  sizeBytes: number | null;
  headers: HeaderRow[];
  body: BodyView;
  sent: SentView;
}

export interface ErrorView {
  kind: 'error';
  message: string;
  timeMs: number;
  sent: SentView;
}

export type ResultView = ResponseView | ErrorView;

/** A partir de este tamaño (en caracteres) el cuerpo no se carga en el editor. */
export const LARGE_BODY = 1_000_000;
/** Cuántos caracteres se muestran de un cuerpo grande. */
export const LARGE_BODY_PREVIEW = 100_000;

export function statusKind(status: number): StatusKind {
  if (status >= 100 && status < 200) return 'info';
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'client';
  if (status >= 500 && status < 600) return 'server';
  return 'unknown';
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function headerRows(headers: Record<string, unknown> | null | undefined): HeaderRow[] {
  return Object.entries(headers ?? {}).map(([name, value]) => ({
    name,
    value: Array.isArray(value) ? value.join(', ') : String(value ?? ''),
  }));
}

function headerValue(headers: Record<string, unknown> | null | undefined, name: string): string {
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return entry ? String(entry[1]).toLowerCase() : '';
}

/** Texto y lenguaje con que se muestra un cuerpo (de respuesta o enviado). */
export function describeBody(data: unknown, headers?: Record<string, unknown> | null): BodyView {
  let text = '';
  let language: BodyLanguage = 'text';

  if (data === null || data === undefined) {
    text = '';
  } else if (typeof data === 'string') {
    const trimmed = data.trim();
    const contentType = headerValue(headers, 'content-type');
    const parsed = tryParseJson(trimmed);
    if (parsed.ok && (contentType.includes('json') || /^[[{]/.test(trimmed))) {
      text = JSON.stringify(parsed.value, null, 2);
      language = 'json';
    } else {
      text = data;
      if (contentType.includes('xml') || trimmed.startsWith('<?xml') || /^<[\w:-]/.test(trimmed)) {
        language = 'xml';
        // Los servicios SOAP suelen contestar en una sola línea: se sangra para poder leerlo.
        if (!trimmed.includes('\n') && trimmed.length <= LARGE_BODY) text = prettyXml(trimmed);
      }
    }
  } else if (typeof data === 'object') {
    text = JSON.stringify(data, null, 2);
    language = 'json';
  } else {
    text = String(data);
  }

  return { text, language, empty: text.length === 0, large: text.length > LARGE_BODY };
}

const XML_TOKEN =
  /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:"[^"]*"|'[^']*'|[^>"'])*>|[^<]+/g;

/** Sangra un XML escrito en una sola línea. Solo cambia el espacio entre etiquetas. */
export function prettyXml(xml: string): string {
  const tokens = xml.trim().match(XML_TOKEN);
  if (!tokens) return xml;

  const lines: string[] = [];
  let depth = 0;
  const line = (text: string) => lines.push('  '.repeat(depth) + text);
  const isOpening = (token: string) =>
    token.startsWith('<') && !/^<[/?!]/.test(token) && !token.endsWith('/>');

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith('<')) {
      if (token.trim()) line(token.trim());
    } else if (token.startsWith('</')) {
      depth = Math.max(0, depth - 1);
      line(token);
    } else if (isOpening(token)) {
      const text = tokens[i + 1];
      const close = tokens[i + 2];
      if (text !== undefined && !text.startsWith('<') && close?.startsWith('</')) {
        line(token + text.trim() + close); // <a>valor</a> queda en una línea
        i += 2;
      } else {
        line(token);
        depth++;
      }
    } else {
      line(token); // declaración, comentario, CDATA o etiqueta vacía
    }
  }
  return lines.join('\n');
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (!text) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Extensión y tipo MIME para descargar un cuerpo. */
export function downloadInfo(language: BodyLanguage): { extension: string; mime: string } {
  switch (language) {
    case 'json':
      return { extension: 'json', mime: 'application/json' };
    case 'xml':
      return { extension: 'xml', mime: 'application/xml' };
    default:
      return { extension: 'txt', mime: 'text/plain' };
  }
}

export function toResultView(result: ExecutionResult): ResultView {
  const { request, response } = result;
  const sent: SentView = {
    method: request.method ?? null,
    url: request.url,
    headers: headerRows(request.headers),
    params: headerRows(request.params),
    body: describeBody(request.body),
  };

  if (isExecutionError(response)) {
    return { kind: 'error', message: response.message, timeMs: response.metrics.timeMs, sent };
  }

  const headers = 'headers' in response ? response.headers : undefined;
  return {
    kind: 'response',
    status: response.status,
    statusText: response.statusText ?? '',
    statusKind: statusKind(response.status),
    timeMs: response.metrics.timeMs,
    sizeBytes: response.metrics.sizeBytes ?? null,
    headers: headerRows(headers),
    body: describeBody(response.data, headers),
    sent,
  };
}
