import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';
import { SavedRequest, WsdlInspection } from '../../core/models';
import { CollectionsStore } from '../../core/state/collections.store';
import { TabsStore } from '../../core/state/tabs.store';
import { CodeEditor } from '../../shared/components/code-editor/code-editor';
import { savedRequest, seedWorkspace } from '../../testing/editor.testing';
import { SoapEditor } from './soap-editor';

/** CodeMirror necesita un navegador de verdad; en jsdom basta con saber qué se le pasa. */
@Component({
  selector: 'app-code-editor',
  template: '<pre class="stub">{{ value() }}</pre>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CodeEditorStub {
  readonly value = model('');
  readonly language = input('text');
  readonly placeholderText = input('');
  readonly ariaLabel = input('');
  readonly variables = input<Record<string, string>>({});
}

const inspection: WsdlInspection = {
  wsdlUrl: 'http://svc.test/calc?WSDL',
  services: ['Calculator'],
  methods: [],
  operations: [
    {
      name: 'Add',
      service: 'Calculator',
      port: 'CalculatorSoap',
      endpoint: 'http://svc.test/calc',
      soapAction: 'http://tempuri.org/Add',
      soapVersion: '1.1',
      targetNamespace: 'http://tempuri.org/',
      sampleEnvelope: '<ADD/>',
    },
    {
      name: 'Subtract',
      service: 'Calculator',
      port: 'CalculatorSoap',
      endpoint: 'http://svc.test/calc',
      soapAction: 'http://tempuri.org/Subtract',
      soapVersion: '1.1',
      targetNamespace: 'http://tempuri.org/',
      sampleEnvelope: '<SUBTRACT/>',
    },
  ],
};
const ADD = 'Calculator/CalculatorSoap/Add';
const SUBTRACT = 'Calculator/CalculatorSoap/Subtract';

describe('SoapEditor', () => {
  let http: HttpTestingController;
  let tabs: TabsStore;
  let fixture: ComponentFixture<SoapEditor>;

  const element = () => fixture.nativeElement as HTMLElement;
  const draft = () => tabs.active()!.draft;
  const field = (label: string) =>
    element().querySelector<HTMLInputElement>(`app-variable-input input[aria-label="${label}"]`)!;
  const button = (text: string) =>
    Array.from(element().querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes(text),
    );
  const stub = () => fixture.debugElement.query(By.directive(CodeEditorStub));

  /** Abre el editor con una petición SOAP ya seleccionada. */
  async function openWith(overrides: Partial<SavedRequest> = {}): Promise<void> {
    const request = savedRequest('r1', {
      protocol: 'SOAP',
      method: null,
      url: '',
      ...overrides,
    });
    fixture = TestBed.createComponent(SoapEditor);
    seedWorkspace(http, [request]);
    TestBed.inject(CollectionsStore).selectRequest('r1');
    TestBed.tick();
    await fixture.whenStable();
  }

  async function pick(key: string): Promise<void> {
    fixture.debugElement
      .query(By.css('p-select.operation'))
      .triggerEventHandler('ngModelChange', key);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SoapEditor],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    })
      .overrideComponent(SoapEditor, {
        remove: { imports: [CodeEditor] },
        add: { imports: [CodeEditorStub] },
      })
      .compileComponents();
    http = TestBed.inject(HttpTestingController);
    tabs = TestBed.inject(TabsStore);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('shows the WSDL, the SOAPAction and the envelope of the request', async () => {
    await openWith({
      wsdlUrl: 'http://svc.test/calc?WSDL',
      soapAction: 'urn:Add',
      body: { type: 'xml', content: '<soap:Envelope/>' },
    });

    expect(field('URL del WSDL').value).toBe('http://svc.test/calc?WSDL');
    expect(field('SOAPAction').value).toBe('urn:Add');
    expect(element().querySelector('.stub')?.textContent).toBe('<soap:Envelope/>');
  });

  it('keeps what is typed in the draft, with an empty field meaning none', async () => {
    await openWith({ wsdlUrl: 'http://svc.test/calc?WSDL', soapAction: 'urn:Add' });

    const type = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type(field('SOAPAction'), 'urn:Sub');
    type(field('URL del WSDL'), '');
    await fixture.whenStable();

    expect(draft().soapAction).toBe('urn:Sub');
    expect(draft().wsdlUrl).toBeNull();
  });

  it('stores the envelope as XML, and as no body when it is emptied', async () => {
    await openWith();

    stub().componentInstance.value.set('<a/>');
    expect(draft().body).toEqual({ type: 'xml', content: '<a/>' });

    stub().componentInstance.value.set('  ');
    expect(draft().body.type).toBe('none');
  });

  describe('reading the WSDL', () => {
    it('cannot load without a WSDL URL', async () => {
      await openWith();

      expect(button('Cargar')!.disabled).toBe(true);
    });

    it('asks the backend and then offers the operations', async () => {
      await openWith({ wsdlUrl: 'svc.test/calc?WSDL' });
      expect(element().querySelector('p-select.operation')).toBeNull();

      button('Cargar')!.click();
      const request = http.expectOne((req) => req.url === '/api/execution/soap/inspect-wsdl');
      // Sin esquema se asume http://, como en la URL de la petición.
      expect(request.request.params.get('url')).toBe('http://svc.test/calc?WSDL');
      request.flush(inspection);
      await fixture.whenStable();

      expect(tabs.active()?.wsdl).toEqual(inspection);
      expect(element().querySelector('p-select.operation')).not.toBeNull();
    });
  });

  describe('picking an operation', () => {
    beforeEach(async () => {
      await openWith();
      tabs.setWsdl('r1', inspection);
      await fixture.whenStable();
    });

    it('fills in the endpoint, the SOAPAction and the sample envelope of an empty request', async () => {
      await pick(ADD);

      expect(draft()).toMatchObject({
        url: 'http://svc.test/calc',
        soapAction: 'http://tempuri.org/Add',
        body: { type: 'xml', content: '<ADD/>' },
      });
    });

    it('swaps the envelope when the one in place is still a sample', async () => {
      await pick(ADD);
      await pick(SUBTRACT);

      expect(draft().soapAction).toBe('http://tempuri.org/Subtract');
      expect(draft().body.content).toBe('<SUBTRACT/>');
    });

    it('leaves an envelope that was edited by hand alone', async () => {
      await pick(ADD);
      stub().componentInstance.value.set('<ADD>mi trabajo</ADD>');

      await pick(SUBTRACT);

      expect(draft().soapAction).toBe('http://tempuri.org/Subtract');
      expect(draft().body.content).toBe('<ADD>mi trabajo</ADD>');
    });

    it('asks before replacing an edited envelope with the sample', async () => {
      await pick(ADD);
      stub().componentInstance.value.set('<ADD>mi trabajo</ADD>');
      await fixture.whenStable();

      button('Generar envelope')!.click();
      await fixture.whenStable();
      expect(draft().body.content).toBe('<ADD>mi trabajo</ADD>');

      const accept = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.includes('Reemplazar'),
      )!;
      accept.click();
      await fixture.whenStable();

      expect(draft().body.content).toBe('<ADD/>');
    });
  });
});
