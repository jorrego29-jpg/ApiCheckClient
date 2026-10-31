import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { HistoryEntry } from '../models';
import { HistoryStore } from './history.store';

const entry = (id: string): HistoryEntry => ({
  id,
  requestId: 'r1',
  executedUrl: `https://api.test/${id}`,
  method: 'GET',
  status: 200,
  statusText: 'OK',
  durationMs: 10,
  sizeBytes: 5,
  createdAt: '2026-10-30T12:00:00.000Z',
});

describe('HistoryStore', () => {
  let store: HistoryStore;
  let http: HttpTestingController;

  const list = (req: { url: string }) => req.url === '/api/history';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    });
    store = TestBed.inject(HistoryStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks for nothing until someone watches it', () => {
    store.refresh();

    expect(store.status()).toBe('idle');
    http.expectNone(list);
  });

  it('lists the runs of the workspace', () => {
    store.watch('w1');
    expect(store.status()).toBe('loading');

    const req = http.expectOne(list);
    expect(req.request.params.get('workspaceId')).toBe('w1');
    expect(req.request.params.has('requestId')).toBe(false);
    expect(req.request.params.get('limit')).toBe('50');
    req.flush([entry('a'), entry('b')]);

    expect(store.status()).toBe('ready');
    expect(store.entries().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('can be limited to one request', () => {
    store.watch('w1', 'r1');

    expect(http.expectOne(list).request.params.get('requestId')).toBe('r1');
  });

  it('empties the list and asks again when the scope changes', () => {
    store.watch('w1');
    http.expectOne(list).flush([entry('a')]);

    store.watch('w1', 'r1');

    expect(store.entries()).toEqual([]);
    http.expectOne(list).flush([entry('b')]);
    expect(store.entries().map((e) => e.id)).toEqual(['b']);
  });

  it('does not ask again for the scope it already has', () => {
    store.watch('w1');
    http.expectOne(list).flush([]);

    store.watch('w1');

    http.expectNone(list);
  });

  it('keeps the list in view while refreshing', () => {
    store.watch('w1');
    http.expectOne(list).flush([entry('a')]);

    store.refresh();

    expect(store.status()).toBe('ready');
    expect(store.entries()).toHaveLength(1);
    http.expectOne(list).flush([entry('b'), entry('a')]);
    expect(store.entries().map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('ignores the answer of a request that was superseded', () => {
    store.watch('w1');
    const stale = http.expectOne(list);

    store.watch('w2');
    expect(stale.cancelled).toBe(true);
    http.expectOne(list).flush([entry('fresh')]);

    expect(store.entries().map((e) => e.id)).toEqual(['fresh']);
  });

  it('is idle without a workspace', () => {
    store.watch(null);

    expect(store.status()).toBe('idle');
    http.expectNone(list);
  });

  it('reports a failed load, and keeps the list when only a refresh fails', () => {
    store.watch('w1');
    http.expectOne(list).error(new ProgressEvent('error'));
    expect(store.status()).toBe('error');

    store.refresh();
    http.expectOne(list).flush([entry('a')]);
    expect(store.status()).toBe('ready');

    store.refresh();
    http.expectOne(list).error(new ProgressEvent('error'));
    expect(store.status()).toBe('ready');
    expect(store.entries()).toHaveLength(1);
  });

  it('reads the full detail of a run', () => {
    let body: string | null | undefined;
    store.detail('h1').subscribe((detail) => (body = detail.responseBody));

    http.expectOne('/api/history/h1').flush({ ...entry('h1'), responseBody: '"x"' });

    expect(body).toBe('"x"');
  });
});
