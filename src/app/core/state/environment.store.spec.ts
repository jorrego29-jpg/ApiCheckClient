import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { Environment, Variable } from '../models';
import { ACTIVE_ENVIRONMENT_KEY, EnvironmentStore } from './environment.store';
import { ACTIVE_WORKSPACE_KEY, WorkspaceStore } from './workspace.store';

const workspace = (id: string, createdAt: string) => ({
  id,
  name: `Workspace ${id}`,
  createdAt,
  updatedAt: createdAt,
  _count: { collections: 0, environments: 0 },
});

const variable = (
  id: string,
  key: string,
  value: string,
  environmentId = 'e1',
  enabled = true,
): Variable => ({ id, key, value, enabled, environmentId });

const environment = (id: string, overrides: Partial<Environment> = {}): Environment => ({
  id,
  name: `Entorno ${id}`,
  isGlobal: false,
  workspaceId: 'w1',
  variables: [],
  ...overrides,
});

describe('EnvironmentStore', () => {
  let store: EnvironmentStore;
  let workspaces: WorkspaceStore;
  let http: HttpTestingController;

  const listOf =
    (workspaceId: string) => (req: { url: string; params: { get(n: string): string | null } }) =>
      req.url === '/api/environments' && req.params.get('workspaceId') === workspaceId;

  /** Arranca con "w1" activo (y "w2" disponible) y responde lo que el store pide al cargarse. */
  function boot(environments: Environment[] = [], respond = true): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(EnvironmentStore);
    workspaces = TestBed.inject(WorkspaceStore);

    localStorage.setItem(ACTIVE_WORKSPACE_KEY, 'w1');
    workspaces.load();
    http
      .expectOne('/api/workspaces')
      .flush([workspace('w1', '2026-01-01'), workspace('w2', '2026-02-01')]);
    TestBed.tick();
    if (respond) http.expectOne(listOf('w1')).flush(environments);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('loads the environments of the active workspace, by name, apart from the global ones', () => {
    boot([
      environment('e2', { name: 'Producción' }),
      environment('e1', { name: 'desarrollo' }),
      environment('g1', { name: 'Globales', isGlobal: true }),
    ]);

    expect(store.status()).toBe('ready');
    expect(store.environments().map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(store.globals().map((e) => e.id)).toEqual(['g1']);
  });

  it('starts with no environment chosen', () => {
    boot([environment('e1')]);

    expect(store.activeId()).toBe('');
    expect(store.active()).toBeNull();
  });

  it('remembers the chosen environment for this workspace', () => {
    boot([environment('e1'), environment('e2')]);

    store.select('e2');

    expect(store.activeId()).toBe('e2');
    expect(store.active()?.id).toBe('e2');
    expect(localStorage.getItem(`${ACTIVE_ENVIRONMENT_KEY}.w1`)).toBe('e2');
  });

  it('forgets the choice when "no environment" is picked', () => {
    boot([environment('e1')]);
    store.select('e1');

    store.select('');

    expect(store.activeId()).toBe('');
    expect(localStorage.getItem(`${ACTIVE_ENVIRONMENT_KEY}.w1`)).toBeNull();
  });

  it('trusts the remembered environment while the list is still loading', () => {
    localStorage.setItem(`${ACTIVE_ENVIRONMENT_KEY}.w1`, 'e2');
    boot([], false);

    // Un envío temprano ya sale con el entorno que se había elegido.
    expect(store.status()).toBe('loading');
    expect(store.activeId()).toBe('e2');

    http.expectOne(listOf('w1')).flush([environment('e2')]);
    expect(store.activeId()).toBe('e2');
  });

  it('drops a remembered environment that no longer exists', () => {
    localStorage.setItem(`${ACTIVE_ENVIRONMENT_KEY}.w1`, 'gone');
    boot([environment('e1')]);

    expect(store.activeId()).toBe('');
  });

  it('keeps one choice per workspace and reloads when the workspace changes', () => {
    boot([environment('e1')]);
    store.select('e1');

    workspaces.select('w2');
    TestBed.tick();
    expect(store.environments()).toEqual([]);
    expect(store.status()).toBe('loading');
    http.expectOne(listOf('w2')).flush([environment('e9', { workspaceId: 'w2' })]);
    expect(store.activeId()).toBe('');

    workspaces.select('w1');
    TestBed.tick();
    http.expectOne(listOf('w1')).flush([environment('e1')]);
    expect(store.activeId()).toBe('e1');
  });

  it('reports a failure to load', () => {
    boot([], false);

    http.expectOne(listOf('w1')).error(new ProgressEvent('error'));

    expect(store.status()).toBe('error');
  });

  describe('variables', () => {
    it('are the global ones with the active environment on top, only those switched on', () => {
      boot([
        environment('g1', {
          isGlobal: true,
          variables: [
            variable('v1', 'host', 'global', 'g1'),
            variable('v2', 'solo-global', 'g', 'g1'),
            variable('v3', 'apagada', 'x', 'g1', false),
          ],
        }),
        environment('e1', {
          variables: [variable('v4', 'host', 'dev'), variable('v5', 'solo-dev', 'd')],
        }),
      ]);
      store.select('e1');

      expect(store.variables()).toEqual({ host: 'dev', 'solo-global': 'g', 'solo-dev': 'd' });
    });

    it('are only the global ones when no environment is chosen', () => {
      boot([
        environment('g1', { isGlobal: true, variables: [variable('v1', 'host', 'g', 'g1')] }),
        environment('e1', { variables: [variable('v2', 'host', 'dev')] }),
      ]);

      expect(store.variables()).toEqual({ host: 'g' });
    });
  });

  describe('creating, renaming and deleting', () => {
    it('creates an environment in the active workspace', () => {
      boot();
      let created: Environment | undefined;

      store.create('Staging').subscribe((environment) => (created = environment));
      const request = http.expectOne({ method: 'POST', url: '/api/environments' });
      expect(request.request.body).toEqual({ name: 'Staging', workspaceId: 'w1' });
      request.flush(environment('e7', { name: 'Staging' }));

      expect(created?.id).toBe('e7');
      expect(store.environments().map((e) => e.name)).toEqual(['Staging']);
    });

    it('renames an environment', () => {
      boot([environment('e1', { name: 'Viejo' })]);
      let done = false;

      store.rename('e1', 'Nuevo').subscribe(() => (done = true));
      const request = http.expectOne({ method: 'PUT', url: '/api/environments/e1' });
      expect(request.request.body).toEqual({ name: 'Nuevo' });
      request.flush(environment('e1', { name: 'Nuevo' }));

      expect(done).toBe(true);
      expect(store.environments().map((e) => e.name)).toEqual(['Nuevo']);
    });

    it('deleting the active environment leaves none chosen', () => {
      boot([environment('e1'), environment('e2')]);
      store.select('e1');

      store.remove('e1').subscribe();
      http.expectOne({ method: 'DELETE', url: '/api/environments/e1' }).flush(environment('e1'));

      expect(store.environments().map((e) => e.id)).toEqual(['e2']);
      expect(store.activeId()).toBe('');
      expect(localStorage.getItem(`${ACTIVE_ENVIRONMENT_KEY}.w1`)).toBeNull();
    });

    it('creates the global environment with its variables', () => {
      boot();

      store
        .createGlobals([
          { key: 'host', value: 'api', enabled: true },
          { key: '  ', value: 'sin nombre', enabled: true },
        ])
        .subscribe();
      const request = http.expectOne({ method: 'POST', url: '/api/environments' });
      expect(request.request.body).toEqual({
        name: 'Globales',
        workspaceId: 'w1',
        isGlobal: true,
        variables: [{ key: 'host', value: 'api', enabled: true }],
      });
      request.flush(
        environment('g1', {
          name: 'Globales',
          isGlobal: true,
          variables: [variable('v1', 'host', 'api', 'g1')],
        }),
      );

      expect(store.globals().map((e) => e.id)).toEqual(['g1']);
      expect(store.variables()).toEqual({ host: 'api' });
    });
  });

  describe('saving variables', () => {
    const saved = environment('e1', {
      variables: [variable('v1', 'a', '1'), variable('v2', 'b', '2'), variable('v3', 'c', '3')],
    });

    it('sends only what changed and then reads the environment again', () => {
      boot([saved]);
      let done = false;

      store
        .saveVariables('e1', [
          { id: 'v1', key: 'a', value: 'nuevo', enabled: true }, // cambia
          { id: 'v3', key: 'c', value: '3', enabled: true }, // igual
          { key: 'd', value: '4', enabled: true }, // nueva
          // v2 desaparece
        ])
        .subscribe(() => (done = true));

      const update = http.expectOne({ method: 'PUT', url: '/api/environments/variables/v1' });
      expect(update.request.body).toEqual({ value: 'nuevo' });
      const remove = http.expectOne({ method: 'DELETE', url: '/api/environments/variables/v2' });
      const create = http.expectOne({ method: 'POST', url: '/api/environments/e1/variables' });
      expect(create.request.body).toEqual({ key: 'd', value: '4', enabled: true });

      update.flush({});
      remove.flush({});
      create.flush({});
      http.expectOne({ method: 'GET', url: '/api/environments/e1' }).flush(
        environment('e1', {
          variables: [
            variable('v1', 'a', 'nuevo'),
            variable('v3', 'c', '3'),
            variable('v4', 'd', '4'),
          ],
        }),
      );

      expect(done).toBe(true);
      expect(store.environments()[0].variables.map((v) => v.key)).toEqual(['a', 'c', 'd']);
    });

    it('does not call anything but the refresh when nothing changed', () => {
      boot([saved]);

      store
        .saveVariables('e1', [
          { id: 'v1', key: 'a', value: '1', enabled: true },
          { id: 'v2', key: 'b', value: '2', enabled: true },
          { id: 'v3', key: 'c', value: '3', enabled: true },
        ])
        .subscribe();

      http.expectOne({ method: 'GET', url: '/api/environments/e1' }).flush(saved);
    });

    it('reads the environment again when a call fails, so a retry does not duplicate', () => {
      boot([saved]);
      let failed: unknown;

      store
        .saveVariables('e1', [
          { id: 'v1', key: 'a', value: 'nuevo', enabled: true },
          { id: 'v2', key: 'b', value: '2', enabled: true },
          { id: 'v3', key: 'c', value: '3', enabled: true },
        ])
        .subscribe({ error: (error: unknown) => (failed = error) });

      http
        .expectOne({ method: 'PUT', url: '/api/environments/variables/v1' })
        .flush('boom', { status: 500, statusText: 'Server Error' });
      http.expectOne({ method: 'GET', url: '/api/environments/e1' }).flush(saved);

      expect(failed).toBeDefined();
      expect(store.environments()[0].variables.map((v) => v.value)).toEqual(['1', '2', '3']);
    });
  });
});
