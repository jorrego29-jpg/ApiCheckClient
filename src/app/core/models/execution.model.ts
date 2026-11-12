import type { ExecutableMethod, ProtocolType } from './request.model';

/** Cuerpo de POST /execution/run. Headers y params van como objeto, no como arreglo de KeyValue. */
export interface ExecuteRequestDto {
  requestId?: string; // si la petición ya está guardada, el historial se liga a ella
  protocol: ProtocolType;
  url: string;
  method?: ExecutableMethod; // obligatorio en REST
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: unknown;
  formData?: FormDataField[]; // solo REST: la petición sale como multipart/form-data
  soapAction?: string; // en modo WSDL es el nombre de la operación
  wsdlUrl?: string;
  ignoreSsl?: boolean; // el backend no verifica el certificado TLS del destino
  variables?: Record<string, string>; // pisan a las del entorno
  environmentId?: string;
  workspaceId?: string; // carga también las variables globales del workspace
}

/** Con `fileName` es un archivo y `value` su contenido en base64; sin él, un campo de texto. */
export interface FormDataField {
  key: string;
  value: string;
  fileName?: string;
  contentType?: string;
}

export interface ExecutionMetrics {
  timeMs: number;
  sizeBytes?: number;
}

export interface RestResponse {
  status: number;
  statusText: string;
  headers: Record<string, unknown>;
  data: unknown;
  metrics: ExecutionMetrics;
}

/** SOAP con envelope crudo: `data` es el XML devuelto. */
export interface SoapEnvelopeResponse {
  status: number;
  statusText?: string;
  headers: Record<string, unknown>;
  data: string;
  metrics: ExecutionMetrics;
}

/** SOAP vía WSDL: `data` es el resultado ya parseado y trae el XML enviado y recibido. */
export interface SoapWsdlResponse {
  status: number;
  statusText: string;
  data: unknown;
  rawRequest: string;
  rawResponse: string;
  metrics: ExecutionMetrics;
}

/** Falla de red, WSDL inválido u operación inexistente. El backend responde HTTP 200 con esta forma. */
export interface ExecutionError {
  error: true;
  message: string;
  metrics: ExecutionMetrics;
}

export type ExecutionResponse =
  RestResponse | SoapEnvelopeResponse | SoapWsdlResponse | ExecutionError;

export function isExecutionError(response: ExecutionResponse): response is ExecutionError {
  return 'error' in response && response.error === true;
}

/** La petición tal como se envió, con las {{variables}} ya sustituidas. */
export interface ResolvedRequest {
  url: string;
  method?: ExecutableMethod;
  headers: Record<string, string>;
  params: Record<string, string>;
  body: unknown;
}

export interface ExecutionResult {
  request: ResolvedRequest;
  response: ExecutionResponse;
}

export type SoapVersion = '1.1' | '1.2';

/** Una operación del WSDL lista para usarse: dónde se envía, con qué SOAPAction y un envelope de ejemplo. */
export interface WsdlOperation {
  name: string;
  service: string;
  port: string;
  endpoint: string;
  soapAction: string;
  soapVersion: SoapVersion;
  targetNamespace: string;
  sampleEnvelope: string;
}

export interface WsdlMethod {
  name: string;
  inputParams: Record<string, unknown>;
}

/** Lo que devuelve GET /execution/soap/inspect-wsdl. */
export interface WsdlInspection {
  wsdlUrl: string;
  services: string[];
  methods: WsdlMethod[];
  operations: WsdlOperation[];
}
