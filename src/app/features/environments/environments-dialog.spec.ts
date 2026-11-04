import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { Environment, Variable } from '../../core/models';
import { ACTIVE_ENVIRONMENT_KEY, EnvironmentStore } from '../../core/state/environment.store';
import { ACTIVE_WORKSPACE_KEY, WorkspaceStore } from '../../core/state/workspace.store';
import { EnvironmentsDialog } from './environments-dialog';

const variable = (id: string, key: string, value: string, environmentId: string): Variable => ({
  id,
  key,
  value,
  enabled: true,
  environmentId,
});

const environment = (
  id: string,
  name: string,
  variables: Variable[],
  isGlobal = false,
): Environment => ({ id, name, isGlobal, workspaceId: 'w1', variables });

const globals = () => environment('g1', 'Globales', [variable('v4', 'region', 'eu', 'g1')], true);
const dev = () => environment('e1', 'Dev', [variable('v1', 'host', 'dev.api', 'e1')]);
const prod = () =>
  environment('e2', 'Prod', [
    variable('v2', 'host', 'prod.api', 'e2'),
    variable('v3', 'token', 'abc', 'e2'),
  ]);

describe('EnvironmentsDialog', () => {
  let http: HttpTestingController;
  let store: EnvironmentStore;
  let fixture: ComponentFixture<EnvironmentsDialog>;

  // El diálogo se pinta en el body, fuera del fixture.
  const page = () => document.body;
  const all = <T extends HTMLElement>(selector: string) =>
    Array.from(page().querySelectorAll<T>(selector));
  const text = (element: Element | null | undefined) => element?.textContent?.trim() ?? '';
  const names = () => all('.list .item .name').map(text);
  const keys = () =>
    all<HTMLInputElement>('.table [data-field="key"]')
      .filter((input) => !input.closest('.row--new'))
      .map((input) => input.value);
  const button = (label: string) =>
    all<HTMLButtonElement>('button').find((candidate) => text(candidate).includes(label));
  const item = (name: string) =>
    all<HTMLButtonElement>('.list .item').find((candidate) => text(candidate).includes(name))!;

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  /** Carga los entornos del workspace "w1" y abre el diálogo. */
  async function open(environments: Environment[], active = ''): Promise<void> {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, 'w1');
    if (active) localStorage.setItem(`${ACTIVE_ENVIRONMENT_KEY}.w1`, active);

    TestBed.inject(WorkspaceStore).load();
    http.expectOne('/api/workspaces').flush([
      {
        id: 'w1',
        name: 'W1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        _count: { collections: 0, environments: environments.length },
      },
    ]);
    TestBed.tick();
    http.expectOne((req) => req.url === '/api/environments').flush(environments);

    fixture = TestBed.createComponent(EnvironmentsDialog);
    fixture.componentRef.setInput('visible', true);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [EnvironmentsDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(EnvironmentStore);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('lists the global variables first, then each environment, with how many variables it has', async () => {
    await open([prod(), dev(), globals()]);

    expect(names()).toEqual(['Globales', 'Dev', 'Prod']);
    expect(all('.list .item .count').map(text)).toEqual(['1', '1', '2']);
  });

  it('opens on the global variables when no environment is active', async () => {
    await open([dev(), globals()]);

    expect(text(page().querySelector('.title'))).toBe('Globales');
    expect(keys()).toEqual(['region']);
  });

  it('opens on the active environment and marks it in the list', async () => {
    await open([dev(), prod()], 'e2');

    expect(text(page().querySelector('.title'))).toBe('Prod');
    expect(keys()).toEqual(['host', 'token']);
    expect(item('Prod').querySelector('.is-active')).not.toBeNull();
    expect(item('Dev').querySelector('.is-active')).toBeNull();
  });

  it('shows the variables of the environment that is picked', async () => {
    await open([dev(), prod()]);

    item('Prod').click();
    await fixture.whenStable();

    expect(text(page().querySelector('.title'))).toBe('Prod');
    expect(keys()).toEqual(['host', 'token']);
  });

  it('makes an environment the active one', async () => {
    await open([dev(), prod()]);

    item('Dev').click();
    await fixture.whenStable();
    button('Usar este entorno')!.click();
    await fixture.whenStable();

    expect(store.activeId()).toBe('e1');
    expect(button('Dejar de usar')).toBeDefined();
  });

  it('saves only after Save, sending what changed', async () => {
    await open([dev()], 'e1');
    expect(button('Guardar')!.disabled).toBe(true);

    type(
      page().querySelector<HTMLInputElement>('.table [data-index="0"] [data-field="value"]')!,
      'otro.api',
    );
    await fixture.whenStable();
    expect(button('Guardar')!.disabled).toBe(false);

    button('Guardar')!.click();
    const update = http.expectOne({ method: 'PUT', url: '/api/environments/variables/v1' });
    expect(update.request.body).toEqual({ value: 'otro.api' });
    update.flush({});
    http
      .expectOne({ method: 'GET', url: '/api/environments/e1' })
      .flush(environment('e1', 'Dev', [variable('v1', 'host', 'otro.api', 'e1')]));
    await fixture.whenStable();

    expect(store.variables()).toEqual({ host: 'otro.api' });
    expect(button('Guardar')!.disabled).toBe(true);
  });

  it('discards the edits', async () => {
    await open([dev()], 'e1');
    const value = () =>
      page().querySelector<HTMLInputElement>('.table [data-index="0"] [data-field="value"]')!;

    type(value(), 'otro.api');
    await fixture.whenStable();
    button('Descartar')!.click();
    await fixture.whenStable();

    expect(value().value).toBe('dev.api');
    expect(button('Guardar')!.disabled).toBe(true);
  });

  it('does not leave an environment with unsaved edits without asking', async () => {
    await open([dev(), prod()], 'e2');

    type(
      page().querySelector<HTMLInputElement>('.table [data-index="0"] [data-field="value"]')!,
      'x',
    );
    await fixture.whenStable();
    item('Dev').click();
    await fixture.whenStable();

    expect(text(page().querySelector('.title'))).toBe('Prod');
  });

  it('asks before leaving when a value was typed in the new row without a name', async () => {
    await open([dev(), prod()], 'e2');

    // La fila vacía del final tiene dos campos: el nombre y el valor.
    type(all<HTMLInputElement>('.row--new input.cell')[1], 'huérfano');
    await fixture.whenStable();

    expect(button('Descartar')!.disabled).toBe(false);
    expect(button('Guardar')!.disabled).toBe(true);
    expect(text(page().querySelector('.warning'))).toContain('sin nombre');

    item('Dev').click();
    await fixture.whenStable();

    expect(text(page().querySelector('.title'))).toBe('Prod');
  });

  it('creates the global environment when the first global variable is saved', async () => {
    await open([dev()]);

    type(page().querySelector<HTMLInputElement>('.row--new input.cell')!, 'region');
    await fixture.whenStable();
    button('Guardar')!.click();

    const request = http.expectOne({ method: 'POST', url: '/api/environments' });
    expect(request.request.body).toEqual({
      name: 'Globales',
      workspaceId: 'w1',
      isGlobal: true,
      variables: [{ key: 'region', value: '', enabled: true }],
    });
    request.flush(environment('g1', 'Globales', [variable('v9', 'region', '', 'g1')], true));
    await fixture.whenStable();

    expect(store.globals().map((candidate) => candidate.id)).toEqual(['g1']);
  });

  it('blocks Save and says so when a name could never be found by {{…}}', async () => {
    await open([dev()], 'e1');

    type(
      page().querySelector<HTMLInputElement>('.table [data-index="0"] [data-field="key"]')!,
      'con espacio',
    );
    await fixture.whenStable();

    expect(text(page().querySelector('.warning'))).toContain('con espacio');
    expect(button('Guardar')!.disabled).toBe(true);
  });

  it('creates an environment from the name dialog and selects it', async () => {
    await open([dev()]);

    button('Nuevo entorno')!.click();
    await fixture.whenStable();
    type(page().querySelector<HTMLInputElement>('input[name="name"]')!, 'Staging');
    await fixture.whenStable();
    button('Crear')!.click();

    const request = http.expectOne({ method: 'POST', url: '/api/environments' });
    expect(request.request.body).toEqual({ name: 'Staging', workspaceId: 'w1' });
    request.flush(environment('e5', 'Staging', []));
    await fixture.whenStable();

    expect(names()).toEqual(['Globales', 'Dev', 'Staging']);
    expect(text(page().querySelector('.title'))).toBe('Staging');
  });

  it('closes with the Close button', async () => {
    await open([dev()]);

    button('Cerrar')!.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.visible()).toBe(false);
  });
});
