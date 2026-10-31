import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { Shell } from './shell';

const workspace = {
  id: 'w1',
  name: 'Mi workspace',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  _count: { collections: 0, environments: 0 },
};

describe('Shell', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Crea el shell y responde lo que pide al arrancar: salud de la API y lista de workspaces. */
  async function boot(options: { apiUp: boolean; workspaces?: unknown[] } = { apiUp: true }) {
    const fixture = TestBed.createComponent(Shell);
    const health = http.expectOne('/api/');
    if (options.apiUp) health.flush('Hello World!');
    else health.error(new ProgressEvent('error'));
    http.expectOne('/api/workspaces').flush(options.workspaces ?? []);
    await fixture.whenStable();
    return fixture;
  }

  const root = (fixture: ComponentFixture<Shell>) => fixture.nativeElement as HTMLElement;

  it('renders the three work zones', async () => {
    const element = root(await boot());

    expect(element.querySelector('.sidebar')).not.toBeNull();
    expect(element.querySelector('.request')).not.toBeNull();
    expect(element.querySelector('.response')).not.toBeNull();
  });

  it('offers the workspace and environment selectors in the top bar', async () => {
    const element = root(await boot());

    expect(element.querySelector('.topbar app-workspace-switcher')).not.toBeNull();
    expect(element.querySelector('.topbar app-environment-switcher')).not.toBeNull();
  });

  it('shows the API as connected when the backend answers', async () => {
    const status = root(await boot()).querySelector('.api-status');

    expect(status?.textContent).toContain('API conectada');
    expect(status?.getAttribute('data-state')).toBe('online');
  });

  it('shows the API as offline when the backend is unreachable', async () => {
    const status = root(await boot({ apiUp: false })).querySelector('.api-status');

    expect(status?.textContent).toContain('API sin conexión');
    expect(status?.getAttribute('data-state')).toBe('offline');
  });

  it('checks the connection again when the status button is clicked', async () => {
    const fixture = await boot({ apiUp: false });

    (root(fixture).querySelector('.api-status') as HTMLButtonElement).click();
    http.expectOne('/api/').flush('Hello World!');
    await fixture.whenStable();

    expect(root(fixture).querySelector('.api-status')?.getAttribute('data-state')).toBe('online');
  });

  it('asks for the workspaces again on retry when they failed to load', async () => {
    const fixture = TestBed.createComponent(Shell);
    http.expectOne('/api/').error(new ProgressEvent('error'));
    http.expectOne('/api/workspaces').error(new ProgressEvent('error'));
    await fixture.whenStable();

    (root(fixture).querySelector('.api-status') as HTMLButtonElement).click();
    http.expectOne('/api/').flush('Hello World!');
    http.expectOne('/api/workspaces').flush([workspace]);
    await fixture.whenStable();

    // Con un workspace activo, el árbol pide sus colecciones y el selector sus entornos.
    http.expectOne((req) => req.url === '/api/collections').flush([]);
    http.expectOne((req) => req.url === '/api/environments').flush([]);
    http.expectOne((req) => req.url === '/api/history').flush([]);
    await fixture.whenStable();
    expect(root(fixture).textContent).toContain('aún no tiene colecciones');
  });

  it('invites to create a workspace when there are none', async () => {
    const element = root(await boot());

    expect(element.textContent).toContain('Crea o elige un workspace');
  });
});
