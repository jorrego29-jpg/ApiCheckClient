import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { ACTIVE_WORKSPACE_KEY, WorkspaceStore } from './workspace.store';

const workspace = (id: string, createdAt: string) => ({
  id,
  name: `Workspace ${id}`,
  createdAt,
  updatedAt: createdAt,
  _count: { collections: 0, environments: 0 },
});

describe('WorkspaceStore', () => {
  let store: WorkspaceStore;
  let http: HttpTestingController;

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    });
    store = TestBed.inject(WorkspaceStore);
    http = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => http.verify());

  it('loads the workspaces oldest first and activates the first one', () => {
    setup();
    store.load();
    expect(store.status()).toBe('loading');
    http
      .expectOne('/api/workspaces')
      .flush([workspace('b', '2026-02-01'), workspace('a', '2026-01-01')]);

    expect(store.workspaces().map((w) => w.id)).toEqual(['a', 'b']);
    expect(store.activeId()).toBe('a');
    expect(store.status()).toBe('ready');
  });

  it('remembers the chosen workspace', () => {
    setup();
    store.load();
    http
      .expectOne('/api/workspaces')
      .flush([workspace('a', '2026-01-01'), workspace('b', '2026-02-01')]);

    store.select('b');

    expect(store.activeId()).toBe('b');
    expect(localStorage.getItem(ACTIVE_WORKSPACE_KEY)).toBe('b');
  });

  it('restores the stored workspace when it still exists', () => {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, 'b');
    setup();
    store.load();
    http
      .expectOne('/api/workspaces')
      .flush([workspace('a', '2026-01-01'), workspace('b', '2026-02-01')]);

    expect(store.activeId()).toBe('b');
  });

  it('falls back to the first workspace when the stored one is gone', () => {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, 'deleted');
    setup();
    store.load();
    http.expectOne('/api/workspaces').flush([workspace('a', '2026-01-01')]);

    expect(store.activeId()).toBe('a');
  });

  it('has no active workspace when there are none', () => {
    setup();
    store.load();
    http.expectOne('/api/workspaces').flush([]);

    expect(store.activeId()).toBeNull();
    expect(store.active()).toBeNull();
  });

  it('reports a failed load', () => {
    setup();
    store.load();
    http.expectOne('/api/workspaces').error(new ProgressEvent('error'));

    expect(store.status()).toBe('error');
  });

  it('creates a workspace and makes it the active one', () => {
    setup();
    store.load();
    http.expectOne('/api/workspaces').flush([workspace('a', '2026-01-01')]);

    let done = false;
    store.create('Nuevo').subscribe(() => (done = true));
    const post = http.expectOne({ method: 'POST', url: '/api/workspaces' });
    expect(post.request.body).toEqual({ name: 'Nuevo' });
    post.flush({ id: 'n', name: 'Nuevo', createdAt: '2026-03-01', updatedAt: '2026-03-01' });
    http
      .expectOne({ method: 'GET', url: '/api/workspaces' })
      .flush([workspace('a', '2026-01-01'), { ...workspace('n', '2026-03-01'), name: 'Nuevo' }]);

    expect(done).toBe(true);
    expect(store.activeId()).toBe('n');
    expect(store.active()?.name).toBe('Nuevo');
  });
});
