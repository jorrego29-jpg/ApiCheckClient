import type { SavedRequest } from './request.model';

export interface Collection {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: string;
}

/** Lo que devuelve GET /collections?workspaceId=. */
export interface CollectionSummary extends Collection {
  _count: { requests: number; folders: number };
}

export interface Folder {
  id: string;
  name: string;
  collectionId: string;
  parentId: string | null;
  createdAt: string;
}

/** Carpeta del árbol: contiene sus peticiones y sus subcarpetas, a cualquier profundidad. */
export interface FolderNode extends Folder {
  requests: SavedRequest[];
  children: FolderNode[];
}

/** Lo que devuelve GET /collections/:id/tree. `folders` son solo las carpetas raíz. */
export interface CollectionTree extends Collection {
  folders: FolderNode[];
  requests: SavedRequest[]; // peticiones en la raíz de la colección
}

/** Lo que devuelve GET /collections/requests/:id. */
export interface SavedRequestDetail extends SavedRequest {
  collection: Collection;
  folder: Folder | null;
}

export interface CreateCollectionDto {
  name: string;
  workspaceId: string;
}

export interface UpdateCollectionDto {
  name?: string;
}

export interface CreateFolderDto {
  name: string;
  collectionId: string;
  parentId?: string;
}

/** `parentId: null` mueve la carpeta a la raíz de la colección. */
export interface UpdateFolderDto {
  name?: string;
  parentId?: string | null;
}
