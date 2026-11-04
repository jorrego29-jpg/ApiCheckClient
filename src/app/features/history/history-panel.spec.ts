import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { CollectionTree, HistoryEntry, SavedRequest } from '../../core/models';
import { CollectionsStore } from '../../core/state/collections.store';
import { TabsStore } from '../../core/state/tabs.store';
import { ACTIVE_WORKSPACE_KEY, WorkspaceStore } from '../../core/state/workspace.store';
import { HistoryPanel } from './history-panel';

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

const tree: CollectionTree = {
  id: 'c1',
  name: 'Colección',
  workspaceId: 'w1',
  createdAt: '2026-01-01',
  folders: [],
  requests: [request('r1'), request('r2', { protocol: 'SOAP', method: null })],
};

const entry = (id: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id,
  requestId: 'r1',
  executedUrl: 'https://api.test/r1',
  method: 'GET',
  status: 200,
  statusText: 'OK',
  durationMs: 42,
  sizeBytes: 10,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('HistoryPanel', () => {
  let http: HttpTestingController;
  let toasts: { detail?: string }[];

  const list = (req: { url: string }) => req.url === '/api/history';

  /** Arranca con "w1" activo y su árbol cargado; el panel pide entonces el historial. */
  async function boot(): Promise<ComponentFixture<HistoryPanel>> {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, 'w1');
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
    const fixture = TestBed.createComponent(HistoryPanel);
    TestBed.tick();
    http.match((req) => req.url === '/api/environments').forEach((req) => req.flush([]));
    http
      .expectOne((req) => req.url === '/api/collections')
      .flush([
        {
          id: 'c1',
          name: 'Colección',
          workspaceId: 'w1',
          createdAt: '',
          _count: { requests: 2, folders: 0 },
        },
      ]);
    http.expectOne('/api/collections/c1/tree').flush(tree);
    await fixture.whenStable();
    return fixture;
  }

  const root = (fixture: ComponentFixture<HistoryPanel>) => fixture.nativeElement as HTMLElement;
  const rowsOf = (fixture: ComponentFixture<HistoryPanel>) =>
    Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('.run'));
  const scopeButtons = (fixture: ComponentFixture<HistoryPanel>) =>
    Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('.scope-option'));

  beforeEach(() => {
    toasts = [];
    TestBed.configureTestingModule({
      imports: [HistoryPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: (m: { detail?: string }) => toasts.push(m) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('lists the latest runs with method, status, url and name of the request', async () => {
    const fixture = await boot();
    http
      .expectOne(list)
      .flush([
        entry('h1'),
        entry('h2', { requestId: 'r2', method: 'POST', executedUrl: 'http://soap.test/calc.asmx' }),
        entry('h3', { status: 500, statusText: 'Server Error' }),
      ]);
    await fixture.whenStable();

    const rows = rowsOf(fixture);
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector('.method')?.textContent?.trim()).toBe('GET');
    expect(rows[0].querySelector('.status')?.textContent?.trim()).toBe('200');
    expect(rows[0].querySelector('.status')?.getAttribute('data-kind')).toBe('ok');
    expect(rows[0].querySelector('.url')?.textContent?.trim()).toBe('api.test/r1');
    expect(rows[0].querySelector('.name')?.textContent?.trim()).toBe('Petición r1');
    expect(rows[0].textContent).toContain('42 ms');
    // Una petición SOAP se identifica como SOAP aunque se envíe con POST.
    expect(rows[1].querySelector('.method')?.textContent?.trim()).toBe('SOAP');
    expect(rows[2].querySelector('.status')?.getAttribute('data-kind')).toBe('server');
  });

  it('shows a run that failed before any response as an error', async () => {
    const fixture = await boot();
    http.expectOne(list).flush([entry('h1', { status: 0, statusText: 'ERROR' })]);
    await fixture.whenStable();

    expect(rowsOf(fixture)[0].querySelector('.status')?.textContent?.trim()).toBe('Error');
  });

  it('says there is nothing yet when the history is empty', async () => {
    const fixture = await boot();
    http.expectOne(list).flush([]);
    await fixture.whenStable();

    expect(root(fixture).textContent).toContain('Aún no hay ejecuciones');
  });

  it('offers the filter by request only while one is open', async () => {
    const fixture = await boot();
    http.expectOne(list).flush([]);
    await fixture.whenStable();
    expect(scopeButtons(fixture)[1].disabled).toBe(true);

    TestBed.inject(TabsStore).open('r1');
    await fixture.whenStable();

    expect(scopeButtons(fixture)[1].disabled).toBe(false);
  });

  it('filters by the open request, and goes back to all', async () => {
    const fixture = await boot();
    http.expectOne(list).flush([entry('h1')]);
    TestBed.inject(TabsStore).open('r1');
    await fixture.whenStable();

    scopeButtons(fixture)[1].click();
    await fixture.whenStable();
    const filtered = http.expectOne(list);
    expect(filtered.request.params.get('requestId')).toBe('r1');
    filtered.flush([]);
    await fixture.whenStable();

    expect(scopeButtons(fixture)[1].getAttribute('aria-pressed')).toBe('true');
    expect(root(fixture).textContent).toContain('Esta petición aún no se ha ejecutado');

    scopeButtons(fixture)[0].click();
    await fixture.whenStable();
    expect(http.expectOne(list).request.params.has('requestId')).toBe(false);
  });

  it('shows a run in the tab of its request', async () => {
    const fixture = await boot();
    http
      .expectOne(list)
      .flush([entry('h1', { requestId: 'r2', status: 404, statusText: 'Not Found' })]);
    await fixture.whenStable();

    rowsOf(fixture)[0].click();
    http.expectOne('/api/history/h1').flush({
      ...entry('h1', { requestId: 'r2', status: 404, statusText: 'Not Found' }),
      requestHeaders: {},
      responseHeaders: {},
      responseBody: '""',
    });
    await fixture.whenStable();

    const tabs = TestBed.inject(TabsStore);
    expect(tabs.activeId()).toBe('r2');
    expect(tabs.active()?.result?.response).toMatchObject({ status: 404 });
  });

  it('tells when the request of a run no longer exists', async () => {
    const fixture = await boot();
    http.expectOne(list).flush([entry('h1', { requestId: 'gone' })]);
    await fixture.whenStable();

    rowsOf(fixture)[0].click();
    http.expectOne('/api/history/h1').flush({
      ...entry('h1', { requestId: 'gone' }),
      requestHeaders: {},
      responseHeaders: {},
      responseBody: null,
    });

    expect(TestBed.inject(TabsStore).tabs()).toEqual([]);
    expect(toasts.some((t) => t.detail?.includes('ya no existe'))).toBe(true);
  });

  it('refreshes after a request is sent', async () => {
    const fixture = await boot();
    http.expectOne(list).flush([]);
    TestBed.inject(CollectionsStore).selectRequest('r1');
    TestBed.tick();
    await fixture.whenStable();

    TestBed.inject(TabsStore).send('r1');
    http.expectOne('/api/execution/run').flush({
      request: { url: 'https://api.test/r1', method: 'GET', headers: {}, params: {}, body: null },
      response: { status: 200, statusText: 'OK', headers: {}, data: {}, metrics: { timeMs: 1 } },
    });
    http.expectOne(list).flush([entry('h9')]);
    await fixture.whenStable();

    expect(rowsOf(fixture)).toHaveLength(1);
  });
});
