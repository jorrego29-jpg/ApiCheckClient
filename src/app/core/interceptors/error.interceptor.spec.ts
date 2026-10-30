import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { SKIP_ERROR_NOTIFICATION, errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let shown: string[];

  beforeEach(() => {
    shown = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        {
          provide: MessageService,
          useValue: { add: (message: { detail?: string }) => shown.push(message.detail ?? '') },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  const messages = () => shown;

  it('shows the message sent by Nest', () => {
    http.get('/x').subscribe({ error: () => undefined });
    controller
      .expectOne('/x')
      .flush(
        { statusCode: 404, message: 'Colección c1 no encontrada.' },
        { status: 404, statusText: 'Not Found' },
      );
    expect(messages()).toEqual(['Colección c1 no encontrada.']);
  });

  it('joins validation messages sent as an array', () => {
    http.post('/x', {}).subscribe({ error: () => undefined });
    controller
      .expectOne('/x')
      .flush(
        { statusCode: 400, message: ['name must be a string', 'url must be a string'] },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(messages()).toEqual(['name must be a string; url must be a string']);
  });

  it('explains a network failure', () => {
    http.get('/x').subscribe({ error: () => undefined });
    controller.expectOne('/x').error(new ProgressEvent('error'));
    expect(messages()[0]).toContain('No se pudo conectar con el servidor');
  });

  it('falls back to the status line when the body has no message', () => {
    http.get('/x').subscribe({ error: () => undefined });
    controller.expectOne('/x').flush(null, { status: 500, statusText: 'Internal Server Error' });
    expect(messages()).toEqual(['Error 500: Internal Server Error']);
  });

  it('stays silent when the request opts out', () => {
    const context = new HttpContext().set(SKIP_ERROR_NOTIFICATION, true);
    http.get('/x', { context }).subscribe({ error: () => undefined });
    controller.expectOne('/x').flush({ message: 'x' }, { status: 500, statusText: 'Error' });
    expect(messages()).toEqual([]);
  });

  it('rethrows the original error to the caller', () => {
    let received: unknown;
    http.get('/x').subscribe({ error: (error: unknown) => (received = error) });
    controller.expectOne('/x').flush({ message: 'boom' }, { status: 500, statusText: 'Error' });
    expect(received).toBeInstanceOf(HttpErrorResponse);
  });
});
