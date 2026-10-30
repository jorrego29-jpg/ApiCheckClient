import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Shell } from './shell';

describe('Shell', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders the three work zones', async () => {
    const fixture = TestBed.createComponent(Shell);
    http.expectOne('/api/').flush('Hello World!');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.sidebar')).not.toBeNull();
    expect(element.querySelector('.request')).not.toBeNull();
    expect(element.querySelector('.response')).not.toBeNull();
  });

  it('shows the API as connected when the backend answers', async () => {
    const fixture = TestBed.createComponent(Shell);
    http.expectOne('/api/').flush('Hello World!');
    await fixture.whenStable();

    const status = (fixture.nativeElement as HTMLElement).querySelector('.api-status');
    expect(status?.textContent).toContain('API conectada');
    expect(status?.getAttribute('data-state')).toBe('online');
  });

  it('shows the API as offline when the backend is unreachable', async () => {
    const fixture = TestBed.createComponent(Shell);
    http.expectOne('/api/').error(new ProgressEvent('error'));
    await fixture.whenStable();

    const status = (fixture.nativeElement as HTMLElement).querySelector('.api-status');
    expect(status?.textContent).toContain('API sin conexión');
    expect(status?.getAttribute('data-state')).toBe('offline');
  });

  it('checks the connection again when the status button is clicked', async () => {
    const fixture = TestBed.createComponent(Shell);
    http.expectOne('/api/').error(new ProgressEvent('error'));
    await fixture.whenStable();

    (
      (fixture.nativeElement as HTMLElement).querySelector('.api-status') as HTMLButtonElement
    ).click();
    http.expectOne('/api/').flush('Hello World!');
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.api-status')
        ?.getAttribute('data-state'),
    ).toBe('online');
  });
});
