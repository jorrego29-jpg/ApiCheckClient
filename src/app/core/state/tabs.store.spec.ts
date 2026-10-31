import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { CollectionTree, Environment, ExecutionResult, SavedRequest } from '../models';
import { withUrl } from '../requests/request-draft';
import { CollectionsStore } from './collections.store';
import { EnvironmentStore } from './environment.store';
import { TabsStore } from './tabs.store';
import { ACTIVE_WORKSPACE_KEY, WorkspaceStore } from './workspace.store';

const request = (id: string, overrides: Partial<SavedRequest> = {}): SavedRequest => ({
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
});

const tree = (requests: SavedRequest[]): CollectionTree => ({
  id: 'c1',
  name: 'Colección',
  workspaceId: 'w1',
  createdAt: '2026-01-01',
  folders: [],
  requests,
});

const okResult: ExecutionResult = {
  request: { url: 'https://api.test/r1', method: 'GET', headers: {}, params: {}, body: null },
  response: {
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { ok: true },
    metrics: { timeMs: 12, sizeBytes: 11 },
  },
};

describe('TabsStore', () => {
  let tabs: TabsStore;
  let collections: CollectionsStore;
  let http: HttpTestingController;
  let toasts: { severity?: string; detail?: string }[];

  beforeEach(() => {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, 'w1');
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MessageService,
          useValue: { add: (m: { severity?: string; detail?: string }) => toasts.push(m) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    collections = TestBed.inject(CollectionsStore);
    tabs = TestBed.inject(TabsStore);

    TestBed.inject(WorkspaceStore).load();
    http.expectOne('/api/workspaces').flush([
      {
        id: 'w1',
        name: 'W1',
        createdAt: '',
        updatedAt: '',
        _count: { collections: 1, environments: 0 },
      },
    ]);
    TestBed.tick();
    http.match((req) => req.url === '/api/environments').forEach((req) => req.flush([]));
    http
      .expectOne((req) => req.url === '/api/collections')
      .flush([
        {
          id: 'c1',
          name: 'Colección',
          workspaceId: 'w1',
          createdAt: '2026-01-01',
          _count: { requests: 2, folders: 0 },
        },
      ]);
    http.expectOne('/api/collections/c1/tree').flush(tree([request('r1'), request('r2')]));
    TestBed.tick();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function select(id: string): void {
    collections.selectRequest(id);
    TestBed.tick();
  }

  it('opens a tab when a request is selected in the tree', () => {
    select('r1');

    expect(tabs.tabs().map((tab) => tab.id)).toEqual(['r1']);
    expect(tabs.activeId()).toBe('r1');
    expect(tabs.active()?.title).toBe('Petición r1');
    expect(tabs.active()?.draft.url).toBe('https://api.test/r1');
  });

  it('does not duplicate a tab when the same request is opened twice', () => {
    select('r1');
    select('r2');
    select('r1');

    expect(tabs.tabs().map((tab) => tab.id)).toEqual(['r1', 'r2']);
    expect(tabs.activeId()).toBe('r1');
  });

  it('keeps the tree selection on the active tab', () => {
    select('r1');
    select('r2');

    tabs.activate('r1');
    TestBed.tick();

    expect(collections.selectedRequestId()).toBe('r1');
  });

  it('marks a tab as changed only while it differs from what was saved', () => {
    select('r1');
    expect(tabs.dirtyIds().size).toBe(0);

    tabs.edit('r1', (draft) => withUrl(draft, 'https://api.test/otra'));
    expect([...tabs.dirtyIds()]).toEqual(['r1']);

    tabs.edit('r1', (draft) => withUrl(draft, 'https://api.test/r1'));
    expect(tabs.dirtyIds().size).toBe(0);
  });

  it('saves the draft and clears the changed mark', () => {
    select('r1');
    tabs.edit('r1', (draft) => ({ ...draft, method: 'POST' }));

    tabs.save('r1').subscribe();
    const put = http.expectOne({ method: 'PUT', url: '/api/collections/requests/r1' });
    expect(put.request.body).toMatchObject({ method: 'POST', url: 'https://api.test/r1' });
    put.flush({});
    http
      .expectOne('/api/collections/c1/tree')
      .flush(tree([request('r1', { method: 'POST' }), request('r2')]));

    expect(tabs.dirtyIds().size).toBe(0);
    expect(tabs.active()?.baseline.method).toBe('POST');
  });

  it('keeps the changes when saving fails', () => {
    select('r1');
    tabs.edit('r1', (draft) => ({ ...draft, method: 'POST' }));

    tabs.save('r1').subscribe({ error: () => undefined });
    http
      .expectOne({ method: 'PUT', url: '/api/collections/requests/r1' })
      .flush({ message: 'boom' }, { status: 500, statusText: 'Error' });

    expect([...tabs.dirtyIds()]).toEqual(['r1']);
  });

  it('moves to the neighbour tab when the active one is closed', () => {
    select('r1');
    select('r2');

    tabs.close('r2');
    TestBed.tick();

    expect(tabs.activeId()).toBe('r1');
    expect(collections.selectedRequestId()).toBe('r1');

    tabs.close('r1');
    TestBed.tick();

    expect(tabs.tabs()).toEqual([]);
    expect(tabs.activeId()).toBeNull();
    expect(collections.selectedRequestId()).toBeNull();
  });

  it('closes the tab of a request that gets deleted', () => {
    select('r1');
    select('r2');

    collections.deleteRequest('c1', 'r1').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/collections/requests/r1' }).flush({});
    http.expectOne('/api/collections/c1/tree').flush(tree([request('r2')]));
    TestBed.tick();

    expect(tabs.tabs().map((tab) => tab.id)).toEqual(['r2']);
  });

  it('follows a rename done from the tree', () => {
    select('r1');

    collections.renameRequest('c1', 'r1', 'Nuevo nombre').subscribe();
    http.expectOne({ method: 'PUT', url: '/api/collections/requests/r1' }).flush({});
    http
      .expectOne('/api/collections/c1/tree')
      .flush(tree([request('r1', { name: 'Nuevo nombre' }), request('r2')]));
    TestBed.tick();

    expect(tabs.active()?.title).toBe('Nuevo nombre');
  });

  it('sends the request and keeps its response in the tab', () => {
    select('r1');

    tabs.send('r1');
    expect(tabs.active()?.running).toBe(true);
    const run = http.expectOne({ method: 'POST', url: '/api/execution/run' });
    expect(run.request.body).toEqual({
      requestId: 'r1',
      protocol: 'REST',
      method: 'GET',
      url: 'https://api.test/r1',
      workspaceId: 'w1',
    });
    run.flush(okResult);

    expect(tabs.active()?.running).toBe(false);
    expect(tabs.active()?.result).toEqual(okResult);
  });

  it('does not send twice while a request is running', () => {
    select('r1');

    tabs.send('r1');
    tabs.send('r1');

    http.expectOne('/api/execution/run').flush(okResult);
  });

  it('reports a network failure of the target as a notification, and keeps the result', () => {
    select('r1');
    const failure: ExecutionResult = {
      request: okResult.request,
      response: { error: true, message: 'getaddrinfo ENOTFOUND nope.test', metrics: { timeMs: 5 } },
    };

    tabs.send('r1');
    http.expectOne('/api/execution/run').flush(failure);

    expect(tabs.active()?.result).toEqual(failure);
    expect(toasts.map((toast) => toast.detail)).toEqual(['getaddrinfo ENOTFOUND nope.test']);
  });

  it('cancels a running request', () => {
    select('r1');

    tabs.send('r1');
    tabs.cancel('r1');

    expect(tabs.active()?.running).toBe(false);
    expect(tabs.active()?.result).toBeNull();
    expect(http.expectOne('/api/execution/run').cancelled).toBe(true);
  });

  it('does not send a request without URL', () => {
    select('r1');
    tabs.edit('r1', (draft) => withUrl(draft, ''));

    tabs.send('r1');

    expect(tabs.active()?.running).toBe(false);
  });

  describe('SOAP requests', () => {
    const wsdl = {
      wsdlUrl: 'https://svc.test/calc?WSDL',
      services: ['Calculator'],
      methods: [],
      operations: [],
    };

    /** Convierte en SOAP el borrador de r1, sin tocar lo guardado. */
    function asSoap(content = '<soap:Envelope/>'): void {
      select('r1');
      tabs.edit('r1', (draft) => ({
        ...draft,
        protocol: 'SOAP',
        url: 'https://svc.test/calc',
        soapAction: 'urn:Add',
        wsdlUrl: 'https://svc.test/calc?WSDL',
        body: { type: 'xml', content },
      }));
    }

    it('sends the envelope as SOAP, without going through the WSDL', () => {
      asSoap();

      tabs.send('r1');

      const run = http.expectOne({ method: 'POST', url: '/api/execution/run' });
      expect(run.request.body).toEqual({
        requestId: 'r1',
        protocol: 'SOAP',
        url: 'https://svc.test/calc',
        body: '<soap:Envelope/>',
        soapAction: 'urn:Add',
        workspaceId: 'w1',
      });
      run.flush(okResult);
    });

    it('does not send without an envelope', () => {
      asSoap('');

      tabs.send('r1');

      http.expectNone('/api/execution/run');
      expect(tabs.active()?.running).toBe(false);
    });

    it('saves SOAPAction and WSDL along with the envelope', () => {
      asSoap();

      tabs.save('r1').subscribe();

      const put = http.expectOne({ method: 'PUT', url: '/api/collections/requests/r1' });
      expect(put.request.body).toMatchObject({
        protocol: 'SOAP',
        method: null,
        soapAction: 'urn:Add',
        wsdlUrl: 'https://svc.test/calc?WSDL',
        body: { type: 'xml', content: '<soap:Envelope/>' },
      });
      put.flush({});
      http.expectOne('/api/collections/c1/tree').flush(tree([request('r1'), request('r2')]));
    });

    it('remembers what was read from the WSDL without counting it as a change', () => {
      select('r1');

      tabs.setWsdl('r1', wsdl);

      expect(tabs.active()?.wsdl).toEqual(wsdl);
      expect(tabs.dirtyIds().size).toBe(0);
    });
  });

  describe('with an environment', () => {
    const dev: Environment = {
      id: 'e1',
      name: 'Dev',
      isGlobal: false,
      workspaceId: 'w1',
      variables: [
        { id: 'v1', key: 'user', value: 'ana', enabled: true, environmentId: 'e1' },
        { id: 'v2', key: 'pass', value: 'p"w', enabled: true, environmentId: 'e1' },
      ],
    };

    /** Crea el entorno "Dev" y lo deja elegido. */
    function useDev(): void {
      const environments = TestBed.inject(EnvironmentStore);
      environments.create('Dev').subscribe();
      http.expectOne({ method: 'POST', url: '/api/environments' }).flush(dev);
      environments.select('e1');
    }

    it('sends the chosen environment along with the request', () => {
      useDev();
      select('r1');

      tabs.send('r1');

      const run = http.expectOne('/api/execution/run');
      expect(run.request.body).toMatchObject({
        requestId: 'r1',
        environmentId: 'e1',
        workspaceId: 'w1',
      });
      run.flush(okResult);
    });

    it('fills in the variables of Basic auth before encoding it, since the backend cannot', () => {
      useDev();
      select('r1');
      tabs.edit('r1', (draft) => ({
        ...draft,
        auth: { type: 'basic', config: { username: '{{user}}', password: '{{pass}}' } },
      }));

      tabs.send('r1');

      const run = http.expectOne('/api/execution/run');
      expect(run.request.body).toMatchObject({
        headers: { Authorization: `Basic ${btoa('ana:p"w')}` },
      });
      run.flush(okResult);
    });
  });
});
