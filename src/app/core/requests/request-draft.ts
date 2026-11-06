import {
  AuthType,
  BodyType,
  EXECUTABLE_METHODS,
  ExecutableMethod,
  ExecuteRequestDto,
  HttpMethod,
  KeyValue,
  ProtocolType,
  RequestAuth,
  RequestBody,
  SavedRequest,
  UpdateRequestDto,
} from '../models';

/** Lo que el usuario edita de una petición. Se compara con la versión guardada para saber si hay cambios. */
export interface RequestDraft {
  protocol: ProtocolType;
  method: HttpMethod;
  /** La URL tal como se ve en la barra: incluye la query string de los params habilitados. */
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: RequestAuth;
  // SOAP (fase 5): se conservan tal cual para no perderlos al guardar.
  soapAction: string | null;
  wsdlUrl: string | null;
}

export const EMPTY_BODY: RequestBody = { type: 'none', content: '' };
export const NO_AUTH: RequestAuth = { type: 'none' };

const BODY_TYPES: readonly BodyType[] = ['none', 'json', 'xml', 'form-data'];
const AUTH_TYPES: readonly AuthType[] = ['none', 'bearer', 'basic'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isExecutableMethod(
  method: HttpMethod | null | undefined,
): method is ExecutableMethod {
  return (EXECUTABLE_METHODS as readonly string[]).includes(method ?? '');
}

/** Se puede enviar: con URL y, en REST, un método que el backend ejecuta; en SOAP, un envelope. */
export function canSend(draft: RequestDraft): boolean {
  if (draft.url.trim().length === 0) return false;
  if (draft.protocol === 'SOAP') return draft.body.content.trim().length > 0;
  return isExecutableMethod(draft.method);
}

// ─── Petición guardada ⇄ borrador ───────────────────────────────────────────────

export function draftFromSaved(saved: SavedRequest): RequestDraft {
  const url = saved.url ?? '';
  return {
    protocol: saved.protocol,
    method: saved.method ?? 'GET',
    url,
    // Una petición guardada sin queryParams (creada por otro cliente) se lee desde su URL.
    params: saved.queryParams ? toKeyValues(saved.queryParams) : mergeParamsFromUrl(url, []),
    headers: toKeyValues(saved.headers),
    body: toBody(saved.body),
    auth: toAuth(saved.auth),
    soapAction: saved.soapAction ?? null,
    wsdlUrl: saved.wsdlUrl ?? null,
  };
}

/** El backend acepta headers y queryParams como arreglo de filas o como objeto plano. */
export function toKeyValues(value: unknown): KeyValue[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord).map((row) => ({
      key: String(row['key'] ?? ''),
      value: String(row['value'] ?? ''),
      enabled: row['enabled'] !== false,
    }));
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([key, entry]) => ({
      key,
      value:
        entry === null || entry === undefined
          ? ''
          : typeof entry === 'object'
            ? JSON.stringify(entry)
            : String(entry),
      enabled: true,
    }));
  }
  return [];
}

function toBody(value: unknown): RequestBody {
  if (isRecord(value) && typeof value['content'] === 'string') {
    const type = value['type'];
    if (BODY_TYPES.includes(type as BodyType))
      return { type: type as BodyType, content: value['content'] };
  }
  if (typeof value === 'string' && value.trim()) {
    return { type: value.trimStart().startsWith('<') ? 'xml' : 'json', content: value };
  }
  if (isRecord(value)) return { type: 'json', content: JSON.stringify(value, null, 2) };
  return EMPTY_BODY;
}

function toAuth(value: unknown): RequestAuth {
  if (isRecord(value) && AUTH_TYPES.includes(value['type'] as AuthType)) {
    const config = isRecord(value['config']) ? value['config'] : {};
    return normalizeAuth({
      type: value['type'] as AuthType,
      config: {
        token: typeof config['token'] === 'string' ? config['token'] : undefined,
        username: typeof config['username'] === 'string' ? config['username'] : undefined,
        password: typeof config['password'] === 'string' ? config['password'] : undefined,
      },
    });
  }
  return NO_AUTH;
}

function normalizeAuth(auth: RequestAuth): RequestAuth {
  switch (auth.type) {
    case 'bearer':
      return { type: 'bearer', config: { token: auth.config?.token ?? '' } };
    case 'basic':
      return {
        type: 'basic',
        config: { username: auth.config?.username ?? '', password: auth.config?.password ?? '' },
      };
    default:
      return NO_AUTH;
  }
}

const isBlank = (row: KeyValue) => row.key.trim() === '' && row.value === '';

/** La misma petición en una sola forma, para compararla o guardarla: sin filas vacías ni restos de otro tipo de body o auth. */
export function normalizeDraft(draft: RequestDraft): RequestDraft {
  return {
    protocol: draft.protocol,
    method: draft.method,
    url: draft.url,
    params: draft.params.filter((row) => !isBlank(row)),
    headers: draft.headers.filter((row) => !isBlank(row)),
    body:
      draft.body.type === 'none'
        ? EMPTY_BODY
        : { type: draft.body.type, content: draft.body.content },
    auth: normalizeAuth(draft.auth),
    soapAction: draft.soapAction,
    wsdlUrl: draft.wsdlUrl,
  };
}

export function draftsEqual(a: RequestDraft, b: RequestDraft): boolean {
  return JSON.stringify(normalizeDraft(a)) === JSON.stringify(normalizeDraft(b));
}

export function toSaveDto(draft: RequestDraft): UpdateRequestDto {
  const normalized = normalizeDraft(draft);
  const base: UpdateRequestDto = {
    protocol: normalized.protocol,
    method: normalized.method,
    url: normalized.url,
    headers: normalized.headers,
    queryParams: normalized.params,
    body: normalized.body,
    auth: normalized.auth,
  };
  // SOAP no tiene método HTTP ni params (el endpoint se guarda tal cual) y sí SOAPAction y WSDL.
  return normalized.protocol === 'SOAP'
    ? {
        ...base,
        method: null,
        queryParams: [],
        soapAction: normalized.soapAction,
        wsdlUrl: normalized.wsdlUrl,
      }
    : base;
}

// ─── URL ⇄ Params ───────────────────────────────────────────────────────────────

interface UrlParts {
  base: string;
  query: string;
  hash: string;
}

function splitUrl(url: string): UrlParts {
  const hashAt = url.indexOf('#');
  const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const queryAt = withoutHash.indexOf('?');
  return queryAt === -1
    ? { base: withoutHash, query: '', hash }
    : { base: withoutHash.slice(0, queryAt), query: withoutHash.slice(queryAt + 1), hash };
}

/** La URL sin query string ni fragmento. */
export function baseUrl(url: string): string {
  return splitUrl(url).base;
}

const VARIABLE = /(\{\{[^{}]*\}\})/;

/** Codifica para la query string sin tocar las {{variables}}, que el backend resuelve después. */
function encodePart(text: string): string {
  return text
    .split(VARIABLE)
    .map((piece, index) => (index % 2 === 1 ? piece : encodeURIComponent(piece)))
    .join('');
}

function decodePart(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text; // un % suelto mientras se escribe
  }
}

const isActive = (row: KeyValue) => row.enabled && row.key.trim() !== '';

function parseQuery(query: string): KeyValue[] {
  return query
    .split('&')
    .filter((pair) => pair !== '')
    .map((pair) => {
      const at = pair.indexOf('=');
      const key = at === -1 ? pair : pair.slice(0, at);
      const value = at === -1 ? '' : pair.slice(at + 1);
      return { key: decodePart(key), value: decodePart(value), enabled: true };
    });
}

/** Los params de la tabla pasan a la URL: solo los habilitados. */
export function withQuery(url: string, params: readonly KeyValue[]): string {
  const { base, hash } = splitUrl(url);
  const query = params
    .filter(isActive)
    .map((row) => `${encodePart(row.key.trim())}=${encodePart(row.value)}`)
    .join('&');
  return `${base}${query ? `?${query}` : ''}${hash}`;
}

/** La query de la URL pasa a la tabla. Los params deshabilitados no están en la URL, así que se conservan al final. */
export function mergeParamsFromUrl(url: string, current: readonly KeyValue[]): KeyValue[] {
  return [...parseQuery(splitUrl(url).query), ...current.filter((row) => !row.enabled)];
}

/** El usuario edita la URL: se actualizan los params. */
export function withUrl(draft: RequestDraft, url: string): RequestDraft {
  // El endpoint de un servicio SOAP no se parte en params.
  if (draft.protocol === 'SOAP') return { ...draft, url };
  return { ...draft, url, params: mergeParamsFromUrl(url, draft.params) };
}

/** El usuario edita la tabla de params: se actualiza la URL. */
export function withParams(draft: RequestDraft, params: KeyValue[]): RequestDraft {
  return { ...draft, params, url: withQuery(draft.url, params) };
}

// ─── Ejecución ──────────────────────────────────────────────────────────────────

/** Solo las filas habilitadas y con clave. Si una clave se repite, gana la última. */
export function kvToRecord(rows: readonly KeyValue[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows.filter(isActive)) record[row.key.trim()] = row.value;
  return record;
}

function toBase64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Cabecera Authorization de la pestaña Auth. `resolve` sustituye las {{variables}} antes de codificar:
 * en Basic el backend ya no puede hacerlo, porque lo recibe en base64.
 */
export function buildAuthHeaders(
  auth: RequestAuth,
  resolve: (text: string) => string = (text) => text,
): Record<string, string> {
  if (auth.type === 'bearer') {
    const token = (auth.config?.token ?? '').trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  if (auth.type === 'basic') {
    const username = resolve(auth.config?.username ?? '');
    const password = resolve(auth.config?.password ?? '');
    return username || password
      ? { Authorization: `Basic ${toBase64(`${username}:${password}`)}` }
      : {};
  }
  return {};
}

const CONTENT_TYPES: Partial<Record<BodyType, string>> = {
  json: 'application/json',
  xml: 'application/xml',
};

const hasHeader = (headers: Record<string, string>, name: string) =>
  Object.keys(headers).some((key) => key.toLowerCase() === name);

/** Sin esquema se asume http://, como hacen los clientes de API. Las URL que empiezan por {{variable}} no se tocan. */
export function withScheme(url: string): string {
  const trimmed = url.trim();
  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('{{')
    ? trimmed
    : `http://${trimmed}`;
}

export interface ExecutionContext {
  requestId?: string;
  workspaceId?: string;
  environmentId?: string;
  ignoreSsl?: boolean;
  resolve?: (text: string) => string;
}

/**
 * Arma lo que recibe POST /execution/run. Una cabecera escrita a mano manda sobre la de la pestaña Auth
 * y sobre el Content-Type que sale del tipo de body.
 */
export function toExecutionDto(
  draft: RequestDraft,
  context: ExecutionContext = {},
): ExecuteRequestDto {
  const headers = kvToRecord(draft.headers);
  if (!hasHeader(headers, 'authorization')) {
    Object.assign(headers, buildAuthHeaders(draft.auth, context.resolve));
  }

  if (draft.protocol === 'SOAP') return toSoapExecutionDto(draft, headers, context);

  if (!isExecutableMethod(draft.method)) {
    throw new Error(`El método ${draft.method} no se puede ejecutar.`);
  }

  const content = draft.body.content;
  const contentType = CONTENT_TYPES[draft.body.type];
  const hasBody = contentType !== undefined && content.trim() !== '';
  if (hasBody && !hasHeader(headers, 'content-type')) headers['Content-Type'] = contentType;

  // axios no admite una clave repetida en `params`; con repetidas, la query viaja dentro de la URL.
  const active = draft.params.filter(isActive);
  const repeated = new Set(active.map((row) => row.key.trim())).size !== active.length;
  const url = repeated ? withQuery(draft.url, draft.params) : baseUrl(draft.url);
  const queryParams = repeated ? {} : kvToRecord(draft.params);

  return {
    ...(context.requestId ? { requestId: context.requestId } : {}),
    protocol: 'REST',
    method: draft.method,
    url: withScheme(url),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(Object.keys(queryParams).length ? { queryParams } : {}),
    // El texto del body viaja tal cual: así las {{variables}} sin comillas siguen siendo válidas.
    ...(hasBody ? { body: content } : {}),
    ...(context.ignoreSsl ? { ignoreSsl: true } : {}),
    ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
    ...(context.environmentId ? { environmentId: context.environmentId } : {}),
  };
}

/**
 * SOAP con el envelope escrito a mano: se envía como body y el backend pone Content-Type y SOAPAction.
 * No viaja `wsdlUrl`: con él el backend ejecutaría la operación por WSDL en vez de enviar este envelope.
 */
function toSoapExecutionDto(
  draft: RequestDraft,
  headers: Record<string, string>,
  context: ExecutionContext,
): ExecuteRequestDto {
  const soapAction = (draft.soapAction ?? '').trim();
  return {
    ...(context.requestId ? { requestId: context.requestId } : {}),
    protocol: 'SOAP',
    url: withScheme(draft.url),
    ...(Object.keys(headers).length ? { headers } : {}),
    body: draft.body.content,
    ...(soapAction ? { soapAction } : {}),
    ...(context.ignoreSsl ? { ignoreSsl: true } : {}),
    ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
    ...(context.environmentId ? { environmentId: context.environmentId } : {}),
  };
}
