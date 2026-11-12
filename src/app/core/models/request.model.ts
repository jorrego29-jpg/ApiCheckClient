export type ProtocolType = 'REST' | 'SOAP';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/** Métodos que el backend ejecuta hoy (HEAD y OPTIONS existen en el schema, pero no en el ejecutor REST). */
export const EXECUTABLE_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
export type ExecutableMethod = (typeof EXECUTABLE_METHODS)[number];

/** Fila de las tablas de Params, Headers y variables. */
export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export type BodyType = 'none' | 'json' | 'xml' | 'form-data';

/** Formato en que se guarda el body de una petición. */
export interface RequestBody {
  type: BodyType;
  content: string;
  /** Solo form-data: campos de texto y archivos. */
  fields?: KeyValue[];
  files?: FormDataFile[];
}

/** Archivo de un body form-data. `data` (base64) vive solo en la pestaña abierta: no se guarda con la petición. */
export interface FormDataFile {
  key: string;
  name: string;
  type: string;
  data: string;
}

export type AuthType = 'none' | 'bearer' | 'basic';

export interface RequestAuth {
  type: AuthType;
  config?: { token?: string; username?: string; password?: string };
}

/** Petición guardada en una colección (modelo Request de Prisma). */
export interface SavedRequest {
  id: string;
  name: string;
  protocol: ProtocolType;
  method: HttpMethod | null; // null en SOAP
  url: string;
  headers: KeyValue[] | null;
  queryParams: KeyValue[] | null;
  body: RequestBody | null;
  auth: RequestAuth | null;
  soapAction: string | null;
  wsdlUrl: string | null;
  collectionId: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRequestDto {
  name: string;
  protocol: ProtocolType;
  method?: HttpMethod;
  url: string;
  headers?: KeyValue[];
  queryParams?: KeyValue[];
  body?: RequestBody;
  auth?: RequestAuth;
  soapAction?: string;
  wsdlUrl?: string;
  collectionId: string;
  folderId?: string;
}

/** En PUT, `null` vacía el campo o mueve la petición a la raíz (folderId); omitir = sin cambios. */
export interface UpdateRequestDto {
  name?: string;
  protocol?: ProtocolType;
  method?: HttpMethod | null;
  url?: string;
  headers?: KeyValue[] | null;
  queryParams?: KeyValue[] | null;
  body?: RequestBody | null;
  auth?: RequestAuth | null;
  soapAction?: string | null;
  wsdlUrl?: string | null;
  collectionId?: string;
  folderId?: string | null;
}
