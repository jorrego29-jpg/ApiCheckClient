import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { ExecutionResponse, ExecutionResult } from '../../core/models';
import { CollectionsStore } from '../../core/state/collections.store';
import { TabsStore } from '../../core/state/tabs.store';
import { CodeEditor } from '../../shared/components/code-editor/code-editor';
import { savedRequest, seedWorkspace } from '../../testing/editor.testing';
import { ResponseViewer } from './response-viewer';

/** CodeMirror necesita un navegador de verdad; en jsdom basta con saber qué se le pasa. */
@Component({
  selector: 'app-code-editor',
  template: '<pre class="stub">{{ value() }}</pre>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CodeEditorStub {
  readonly value = model('');
  readonly language = input('text');
  readonly readOnly = input(false);
  readonly lineWrap = input(false);
  readonly placeholderText = input('');
  readonly ariaLabel = input('');
}

const result = (response: ExecutionResponse): ExecutionResult => ({
  request: {
    url: 'https://api.test/items',
    method: 'GET',
    headers: { Accept: 'application/json' },
    params: { a: '1' },
    body: null,
  },
  response,
});

describe('ResponseViewer', () => {
  let http: HttpTestingController;
  let tabs: TabsStore;
  let fixture: ComponentFixture<ResponseViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResponseViewer],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    })
      .overrideComponent(ResponseViewer, {
        remove: { imports: [CodeEditor] },
        add: { imports: [CodeEditorStub] },
      })
      .compileComponents();
    http = TestBed.inject(HttpTestingController);
    tabs = TestBed.inject(TabsStore);
    fixture = TestBed.createComponent(ResponseViewer);
    seedWorkspace(http, [savedRequest('r1')]);
    TestBed.inject(CollectionsStore).selectRequest('r1');
    TestBed.tick();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  const element = () => fixture.nativeElement as HTMLElement;

  async function respondWith(response: ExecutionResponse): Promise<void> {
    tabs.send('r1');
    http.expectOne('/api/execution/run').flush(result(response));
    await fixture.whenStable();
  }

  it('invites to send a request when there is no response yet', async () => {
    await fixture.whenStable();

    expect(element().textContent).toContain('Envía una petición');
  });

  it('shows that the request is being sent', async () => {
    tabs.send('r1');
    await fixture.whenStable();

    expect(element().textContent).toContain('Enviando petición');

    http
      .expectOne('/api/execution/run')
      .flush(result({ error: true, message: 'x', metrics: { timeMs: 1 } }));
  });

  it('shows status, time, size and the formatted body of a successful response', async () => {
    await respondWith({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: { id: 1 },
      metrics: { timeMs: 12, sizeBytes: 9 },
    });

    const status = element().querySelector('.status')!;
    expect(status.textContent?.trim()).toBe('200 OK');
    expect(status.getAttribute('data-kind')).toBe('ok');
    expect(element().querySelector('.summary')?.textContent).toContain('12 ms');
    expect(element().querySelector('.summary')?.textContent).toContain('9 B');
    expect(element().querySelector('.stub')?.textContent).toBe('{\n  "id": 1\n}');
  });

  it.each([
    [404, 'Not Found', 'client'],
    [500, 'Server Error', 'server'],
    [302, 'Found', 'redirect'],
  ])(
    'shows a %i response as a normal result, not as an app error',
    async (status, statusText, kind) => {
      await respondWith({
        status,
        statusText,
        headers: {},
        data: '',
        metrics: { timeMs: 5, sizeBytes: 0 },
      });

      expect(element().querySelector('.status')?.getAttribute('data-kind')).toBe(kind);
      expect(element().querySelector('[role="alert"]')).toBeNull();
    },
  );

  it('says so when the response has no body', async () => {
    await respondWith({
      status: 204,
      statusText: 'No Content',
      headers: {},
      data: '',
      metrics: { timeMs: 5 },
    });

    expect(element().textContent).toContain('no tiene cuerpo');
  });

  it('shows a network failure with its message and the request that was sent', async () => {
    await respondWith({
      error: true,
      message: 'getaddrinfo ENOTFOUND nope.test',
      metrics: { timeMs: 8 },
    });

    const alert = element().querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('getaddrinfo ENOTFOUND nope.test');
    expect(alert.textContent).toContain('https://api.test/items');
    expect(element().querySelector('.status')).toBeNull();
  });

  it('lists the response headers in their own section', async () => {
    await respondWith({
      status: 200,
      statusText: 'OK',
      headers: { 'x-request-id': 'abc' },
      data: 'hola',
      metrics: { timeMs: 5 },
    });

    element().querySelector<HTMLElement>('p-tab[value="headers"]')!.click();
    await fixture.whenStable();

    expect(element().querySelector('app-header-list')?.textContent).toContain('x-request-id');
    expect(element().querySelector('app-header-list')?.textContent).toContain('abc');
  });

  it('shows the request as it was sent', async () => {
    await respondWith({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: 'hola',
      metrics: { timeMs: 5 },
    });

    element().querySelector<HTMLElement>('p-tab[value="sent"]')!.click();
    await fixture.whenStable();

    const sent = element().querySelector('app-sent-request')!;
    expect(sent.textContent).toContain('https://api.test/items');
    expect(sent.textContent).toContain('Accept');
  });
});
