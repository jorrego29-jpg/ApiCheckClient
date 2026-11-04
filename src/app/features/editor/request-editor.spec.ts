import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { ExecutionResult, SavedRequest } from '../../core/models';
import { CollectionsStore } from '../../core/state/collections.store';
import { savedRequest, seedWorkspace } from '../../testing/editor.testing';
import { RequestEditor } from './request-editor';

const okResult: ExecutionResult = {
  request: { url: 'https://api.test/items', method: 'GET', headers: {}, params: {}, body: null },
  response: {
    status: 200,
    statusText: 'OK',
    headers: {},
    data: [],
    metrics: { timeMs: 3, sizeBytes: 2 },
  },
};

describe('RequestEditor', () => {
  let http: HttpTestingController;
  let collections: CollectionsStore;
  let fixture: ComponentFixture<RequestEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RequestEditor],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    collections = TestBed.inject(CollectionsStore);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  const element = () => fixture.nativeElement as HTMLElement;
  const urlInput = () => element().querySelector<HTMLInputElement>('app-variable-input.url input')!;
  const button = (text: string) =>
    Array.from(element().querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes(text),
    );

  /** Abre el editor con una petición ya seleccionada. */
  async function openWith(request: SavedRequest = savedRequest('r1')) {
    // El store de pestañas se crea al montar el componente; antes hay que dejar el workspace cargado.
    fixture = TestBed.createComponent(RequestEditor);
    seedWorkspace(http, [request]);
    collections.selectRequest(request.id);
    TestBed.tick();
    await fixture.whenStable();
    // ngModel escribe el valor de los select en una microtarea; hace falta otra vuelta para verlo pintado.
    TestBed.tick();
    await fixture.whenStable();
  }

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('asks to pick a request while none is open', async () => {
    fixture = TestBed.createComponent(RequestEditor);
    await fixture.whenStable();

    expect(element().textContent).toContain('Selecciona una petición');
    expect(urlInput()).toBeNull();
  });

  it('shows the method and URL of the open request', async () => {
    await openWith(savedRequest('r1', { method: 'POST', url: 'https://api.test/items' }));

    expect(urlInput().value).toBe('https://api.test/items');
    expect(element().querySelector('.method .p-select-label')?.textContent).toContain('POST');
  });

  it('keeps the Params table in step with the URL', async () => {
    await openWith(savedRequest('r1', { url: 'https://api.test/items?a=1' }));
    const keys = () =>
      Array.from(
        element().querySelectorAll<HTMLInputElement>('app-key-value-table [data-field="key"]'),
      ).map((input) => input.value);
    expect(keys()).toEqual(['a']);

    type(urlInput(), 'https://api.test/items?a=1&b=2');
    await fixture.whenStable();

    expect(keys()).toEqual(['a', 'b']);
  });

  it('keeps the URL in step with the Params table', async () => {
    await openWith(savedRequest('r1', { url: 'https://api.test/items' }));

    const ghostKey = element().querySelector<HTMLInputElement>('.row--new input.cell')!;
    type(ghostKey, 'page');
    await fixture.whenStable();

    expect(urlInput().value).toBe('https://api.test/items?page=');
  });

  it('enables Save only while there are changes', async () => {
    await openWith();
    const save = () => element().querySelector<HTMLButtonElement>('button[aria-label="Guardar"]')!;
    expect(save().disabled).toBe(true);

    type(urlInput(), 'https://api.test/otra');
    await fixture.whenStable();

    expect(save().disabled).toBe(false);
  });

  it('sends the request with the button and shows it as running', async () => {
    await openWith(savedRequest('r1', { url: 'https://api.test/items?a=1' }));

    button('Enviar')!.click();
    const run = http.expectOne({ method: 'POST', url: '/api/execution/run' });
    expect(run.request.body).toMatchObject({
      protocol: 'REST',
      method: 'GET',
      url: 'https://api.test/items',
      queryParams: { a: '1' },
    });
    await fixture.whenStable();
    expect(button('Cancelar')).toBeDefined();

    run.flush(okResult);
    await fixture.whenStable();
    expect(button('Enviar')).toBeDefined();
  });

  it('sends with Ctrl+Enter', async () => {
    await openWith();

    urlInput().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );

    http.expectOne({ method: 'POST', url: '/api/execution/run' }).flush(okResult);
  });

  it('saves with Ctrl+S', async () => {
    await openWith();
    type(urlInput(), 'https://api.test/otra');
    await fixture.whenStable();

    urlInput().dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }),
    );

    http.expectOne({ method: 'PUT', url: '/api/collections/requests/r1' }).flush({});
    http.expectOne('/api/collections/c1/tree').flush({
      id: 'c1',
      name: 'Colección',
      workspaceId: 'w1',
      createdAt: '2026-01-01',
      folders: [],
      requests: [savedRequest('r1', { url: 'https://api.test/otra' })],
    });
  });

  it('cannot send without a URL', async () => {
    await openWith(savedRequest('r1', { url: '' }));

    expect(button('Enviar')!.disabled).toBe(true);
  });

  describe('a SOAP request', () => {
    const soap = (overrides: Partial<SavedRequest> = {}) =>
      savedRequest('r1', {
        protocol: 'SOAP',
        method: null,
        url: 'https://svc.test/calc',
        soapAction: 'urn:Add',
        body: { type: 'xml', content: '<soap:Envelope/>' },
        ...overrides,
      });

    it('shows the protocol instead of the HTTP method, and the SOAP editor below', async () => {
      await openWith(soap());

      expect(element().querySelector('.urlbar .protocol')?.textContent?.trim()).toBe('SOAP');
      expect(element().querySelector('.urlbar .method')).toBeNull();
      expect(urlInput().value).toBe('https://svc.test/calc');
      expect(element().querySelector('app-soap-editor')).not.toBeNull();
      expect(element().querySelector('app-key-value-table')).toBeNull();
    });

    it('can be sent once it has an endpoint and an envelope', async () => {
      await openWith(soap());

      expect(button('Enviar')!.disabled).toBe(false);
    });

    it('cannot be sent without an envelope', async () => {
      await openWith(soap({ body: null }));

      expect(button('Enviar')!.disabled).toBe(true);
    });
  });
});
