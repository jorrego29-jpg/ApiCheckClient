import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { CollectionTree, SavedRequest } from '../models';
import { CollectionsStore } from './collections.store';
import { ACTIVE_WORKSPACE_KEY, WorkspaceStore } from './workspace.store';

const request = (
  id: string,
  collectionId: string,
  folderId: string | null = null,
): SavedRequest => ({
  id,
  name: `Petición ${id}`,
  protocol: 'REST',
  method: 'GET',
  url: '',
  headers: null,
  queryParams: null,
  body: null,
  auth: null,
  soapAction: null,
  wsdlUrl: null,
  collectionId,
  folderId,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});

const tree = (id: string, overrides: Partial<CollectionTree> = {}): CollectionTree => ({
  id,
  name: `Colección ${id}`,
  workspaceId: 'w1',
  createdAt: `2026-01-0${id.length}`,
  folders: [],
  requests: [],
  ...overrides,
});

const summary = (id: string, createdAt: string) => ({
  id,
  name: `Colección ${id}`,
  workspaceId: 'w1',
  createdAt,
  _count: { requests: 0, folders: 0 },
});

describe('CollectionsStore', () => {
  let store: CollectionsStore;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, 'w1');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(CollectionsStore);

    // Con un workspace activo, el store pide sus colecciones por sí mismo.
    TestBed.inject(WorkspaceStore).load();
    http.expectOne('/api/workspaces').flush([
      {
        id: 'w1',
        name: 'W1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        _count: { collections: 0, environments: 0 },
      },
    ]);
    TestBed.tick();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  /** Responde la carga inicial: la lista de colecciones y el árbol de cada una. */
  function loadTrees(trees: CollectionTree[]): void {
    http
      .expectOne((req) => req.url === '/api/collections' && req.params.get('workspaceId') === 'w1')
      .flush(trees.map((t) => summary(t.id, t.createdAt)));
    for (const t of trees) http.expectOne(`/api/collections/${t.id}/tree`).flush(t);
  }

  it('loads every collection tree of the active workspace, oldest first', () => {
    expect(store.status()).toBe('loading');
    http
      .expectOne((req) => req.url === '/api/collections')
      .flush([summary('b', '2026-02-01'), summary('a', '2026-01-01')]);
    http.expectOne('/api/collections/a/tree').flush(tree('a'));
    http.expectOne('/api/collections/b/tree').flush(tree('b'));

    expect(store.trees().map((t) => t.id)).toEqual(['a', 'b']);
    expect(store.status()).toBe('ready');
  });

  it('is ready with no trees when the workspace has no collections', () => {
    loadTrees([]);
    expect(store.trees()).toEqual([]);
    expect(store.status()).toBe('ready');
  });

  it('reports a failed load', () => {
    http.expectOne((req) => req.url === '/api/collections').error(new ProgressEvent('error'));
    expect(store.status()).toBe('error');
    expect(store.trees()).toEqual([]);
  });

  it('adds a created collection with its tree', () => {
    loadTrees([tree('a')]);

    let done = false;
    store.createCollection('Nueva').subscribe(() => (done = true));
    const post = http.expectOne({ method: 'POST', url: '/api/collections' });
    expect(post.request.body).toEqual({ name: 'Nueva', workspaceId: 'w1' });
    post.flush({ id: 'n', name: 'Nueva', workspaceId: 'w1', createdAt: '2026-03-01' });
    http.expectOne('/api/collections/n/tree').flush(tree('n', { name: 'Nueva' }));

    expect(done).toBe(true);
    expect(store.trees().map((t) => t.id)).toEqual(['a', 'n']);
  });

  it('refreshes a collection after renaming it', () => {
    loadTrees([tree('a')]);

    store.renameCollection('a', 'Otro nombre').subscribe();
    const put = http.expectOne({ method: 'PUT', url: '/api/collections/a' });
    expect(put.request.body).toEqual({ name: 'Otro nombre' });
    put.flush({});
    http.expectOne('/api/collections/a/tree').flush(tree('a', { name: 'Otro nombre' }));

    expect(store.trees()[0].name).toBe('Otro nombre');
  });

  it('removes a deleted collection and clears a selection that was inside it', () => {
    loadTrees([tree('a', { requests: [request('r1', 'a')] }), tree('b')]);
    store.selectRequest('r1');

    store.deleteCollection('a').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/collections/a' }).flush({});

    expect(store.trees().map((t) => t.id)).toEqual(['b']);
    expect(store.selectedRequestId()).toBeNull();
  });

  it('creates a folder under its parent and refreshes the tree', () => {
    loadTrees([tree('a')]);

    store.createFolder({ name: 'Auth', collectionId: 'a', parentId: 'f0' }).subscribe();
    const post = http.expectOne({ method: 'POST', url: '/api/collections/folders' });
    expect(post.request.body).toEqual({ name: 'Auth', collectionId: 'a', parentId: 'f0' });
    post.flush({});
    http.expectOne('/api/collections/a/tree').flush(tree('a'));
  });

  it('selects the request it creates', () => {
    loadTrees([tree('a')]);

    store
      .createRequest({
        name: 'Login',
        protocol: 'REST',
        method: 'POST',
        url: '',
        collectionId: 'a',
      })
      .subscribe();
    http.expectOne({ method: 'POST', url: '/api/collections/requests' }).flush(request('r9', 'a'));
    http.expectOne('/api/collections/a/tree').flush(tree('a', { requests: [request('r9', 'a')] }));

    expect(store.selectedRequestId()).toBe('r9');
  });

  it('clears the selection when its request is deleted', () => {
    loadTrees([tree('a', { requests: [request('r1', 'a')] })]);
    store.selectRequest('r1');

    store.deleteRequest('a', 'r1').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/collections/requests/r1' }).flush({});
    http.expectOne('/api/collections/a/tree').flush(tree('a'));

    expect(store.selectedRequestId()).toBeNull();
  });

  it('keeps the selection when the request lives in a nested folder that survives', () => {
    const nested = {
      id: 'f2',
      name: 'Sub',
      collectionId: 'a',
      parentId: 'f1',
      createdAt: '2026-01-01',
      requests: [request('r2', 'a', 'f2')],
      children: [],
    };
    const root = {
      ...nested,
      id: 'f1',
      name: 'Raíz',
      parentId: null,
      requests: [],
      children: [nested],
    };
    loadTrees([tree('a', { folders: [root] })]);
    store.selectRequest('r2');

    store.renameFolder('a', 'f1', 'Otra').subscribe();
    http.expectOne({ method: 'PUT', url: '/api/collections/folders/f1' }).flush({});
    http.expectOne('/api/collections/a/tree').flush(tree('a', { folders: [root] }));

    expect(store.selectedRequestId()).toBe('r2');
  });

  it('clears the selection and loads the new workspace when it changes', () => {
    loadTrees([tree('a', { requests: [request('r1', 'a')] })]);
    store.selectRequest('r1');

    const workspaces = TestBed.inject(WorkspaceStore);
    const at = (id: string, createdAt: string) => ({
      id,
      name: id,
      createdAt,
      updatedAt: createdAt,
      _count: { collections: 0, environments: 0 },
    });
    workspaces.load();
    http.expectOne('/api/workspaces').flush([at('w1', '2026-01-01'), at('w2', '2026-02-01')]);
    workspaces.select('w2');
    TestBed.tick();

    expect(store.selectedRequestId()).toBeNull();
    expect(store.status()).toBe('loading');
    http
      .expectOne((req) => req.url === '/api/collections' && req.params.get('workspaceId') === 'w2')
      .flush([]);
    expect(store.trees()).toEqual([]);
    expect(store.status()).toBe('ready');
  });
});
