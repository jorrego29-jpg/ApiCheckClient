// Ayudas para los specs que necesitan peticiones guardadas y abiertas: no forman parte de la app.
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CollectionTree, SavedRequest } from '../core/models';
import { ACTIVE_WORKSPACE_KEY, WorkspaceStore } from '../core/state/workspace.store';

export function savedRequest(id: string, overrides: Partial<SavedRequest> = {}): SavedRequest {
  return {
    id,
    name: `Petición ${id}`,
    protocol: 'REST',
    method: 'GET',
    url: `https://api.test/${id}`,
    headers: null,
    queryParams: null,
    body: null,
    auth: null,
    soapAction: null,
    wsdlUrl: null,
    collectionId: 'c1',
    folderId: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

export function collectionTree(requests: SavedRequest[]): CollectionTree {
  return {
    id: 'c1',
    name: 'Colección',
    workspaceId: 'w1',
    createdAt: '2026-01-01',
    folders: [],
    requests,
  };
}

/**
 * Deja cargado el workspace "w1" con la colección "c1" y las peticiones dadas, respondiendo
 * lo que pide el arranque. Hay que haber instanciado ya CollectionsStore y TabsStore.
 */
export function seedWorkspace(http: HttpTestingController, requests: SavedRequest[]): void {
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, 'w1');
  TestBed.inject(WorkspaceStore).load();
  http.expectOne('/api/workspaces').flush([
    {
      id: 'w1',
      name: 'W1',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      _count: { collections: 1, environments: 0 },
    },
  ]);
  TestBed.tick();
  // Al activarse el workspace el store de entornos también pide los suyos (aquí, ninguno).
  http.match((req) => req.url === '/api/environments').forEach((req) => req.flush([]));
  http
    .expectOne((req) => req.url === '/api/collections')
    .flush([
      {
        id: 'c1',
        name: 'Colección',
        workspaceId: 'w1',
        createdAt: '2026-01-01',
        _count: { requests: requests.length, folders: 0 },
      },
    ]);
  http.expectOne('/api/collections/c1/tree').flush(collectionTree(requests));
  TestBed.tick();
}
