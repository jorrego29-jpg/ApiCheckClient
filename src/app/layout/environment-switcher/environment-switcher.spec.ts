import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { Environment } from '../../core/models';
import { ACTIVE_ENVIRONMENT_KEY } from '../../core/state/environment.store';
import { ACTIVE_WORKSPACE_KEY, WorkspaceStore } from '../../core/state/workspace.store';
import { EnvironmentSwitcher } from './environment-switcher';

const environment = (id: string, name: string): Environment => ({
  id,
  name,
  isGlobal: false,
  workspaceId: 'w1',
  variables: [],
});

describe('EnvironmentSwitcher', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<EnvironmentSwitcher>;

  const element = () => fixture.nativeElement as HTMLElement;
  const label = () => element().querySelector('.p-select-label')?.textContent?.trim();
  const manage = () =>
    element().querySelector<HTMLButtonElement>('button[aria-label="Gestionar entornos"]')!;

  async function boot(options: { environments?: Environment[]; active?: string } = {}) {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, 'w1');
    if (options.active) localStorage.setItem(`${ACTIVE_ENVIRONMENT_KEY}.w1`, options.active);

    fixture = TestBed.createComponent(EnvironmentSwitcher);
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
    await fixture.whenStable();
    return () =>
      http.expectOne((req) => req.url === '/api/environments').flush(options.environments ?? []);
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [EnvironmentSwitcher],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('cannot manage environments until they have loaded', async () => {
    const respond = await boot();

    expect(manage().disabled).toBe(true);

    respond();
    await fixture.whenStable();

    expect(manage().disabled).toBe(false);
  });

  it('shows "Sin entorno" when none is chosen', async () => {
    const respond = await boot({ environments: [environment('e1', 'Dev')] });
    respond();
    await fixture.whenStable();

    expect(label()).toBe('Sin entorno');
  });

  it('shows the name of the chosen environment', async () => {
    const respond = await boot({
      environments: [environment('e1', 'Dev'), environment('e2', 'Prod')],
      active: 'e2',
    });
    respond();
    await fixture.whenStable();

    expect(label()).toBe('Prod');
  });

  it('is disabled when the environments could not be read', async () => {
    await boot();

    http.expectOne((req) => req.url === '/api/environments').error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(manage().disabled).toBe(true);
    expect(label()).toBe('Sin conexión');
  });
});
