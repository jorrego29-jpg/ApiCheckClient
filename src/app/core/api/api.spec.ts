import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ExecuteRequestDto } from '../models';
import {
  CollectionsApi,
  EnvironmentsApi,
  ExecutionApi,
  HealthApi,
  HistoryApi,
  WorkspacesApi,
} from './index';

/** Verifica que cada servicio llame a la ruta y el método que expone el backend NestJS. */
describe('API services', () => {
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  const expectCall = (method: string, url: string, params: Record<string, string> = {}) =>
    controller.expectOne(
      (req) =>
        req.method === method &&
        req.url === url &&
        req.params.keys().length === Object.keys(params).length &&
        Object.entries(params).every(([key, value]) => req.params.get(key) === value),
      `${method} ${url} ${JSON.stringify(params)}`,
    );

  describe('WorkspacesApi', () => {
    it('lists, gets and creates workspaces', () => {
      const api = TestBed.inject(WorkspacesApi);

      api.list().subscribe();
      expectCall('GET', '/api/workspaces').flush([]);

      api.get('w1').subscribe();
      expectCall('GET', '/api/workspaces/w1').flush({});

      api.create({ name: 'Demo' }).subscribe();
      expect(expectCall('POST', '/api/workspaces').request.body).toEqual({ name: 'Demo' });
    });
  });

  describe('CollectionsApi', () => {
    it('handles collections', () => {
      const api = TestBed.inject(CollectionsApi);

      api.list('w1').subscribe();
      expectCall('GET', '/api/collections', { workspaceId: 'w1' }).flush([]);

      api.tree('c1').subscribe();
      expectCall('GET', '/api/collections/c1/tree').flush({});

      api.create({ name: 'API', workspaceId: 'w1' }).subscribe();
      expect(expectCall('POST', '/api/collections').request.body).toEqual({
        name: 'API',
        workspaceId: 'w1',
      });

      api.update('c1', { name: 'Nuevo' }).subscribe();
      expect(expectCall('PUT', '/api/collections/c1').request.body).toEqual({ name: 'Nuevo' });

      api.remove('c1').subscribe();
      expectCall('DELETE', '/api/collections/c1').flush({});
    });

    it('handles folders', () => {
      const api = TestBed.inject(CollectionsApi);

      api.createFolder({ name: 'Auth', collectionId: 'c1', parentId: 'f0' }).subscribe();
      expect(expectCall('POST', '/api/collections/folders').request.body).toEqual({
        name: 'Auth',
        collectionId: 'c1',
        parentId: 'f0',
      });

      api.updateFolder('f1', { parentId: null }).subscribe();
      expect(expectCall('PUT', '/api/collections/folders/f1').request.body).toEqual({
        parentId: null,
      });

      api.removeFolder('f1').subscribe();
      expectCall('DELETE', '/api/collections/folders/f1').flush({});
    });

    it('handles requests', () => {
      const api = TestBed.inject(CollectionsApi);

      api
        .createRequest({
          name: 'Login',
          protocol: 'REST',
          method: 'POST',
          url: '{{baseUrl}}/login',
          collectionId: 'c1',
        })
        .subscribe();
      expectCall('POST', '/api/collections/requests').flush({});

      api.getRequest('r1').subscribe();
      expectCall('GET', '/api/collections/requests/r1').flush({});

      api.updateRequest('r1', { folderId: null }).subscribe();
      expect(expectCall('PUT', '/api/collections/requests/r1').request.body).toEqual({
        folderId: null,
      });

      api.removeRequest('r1').subscribe();
      expectCall('DELETE', '/api/collections/requests/r1').flush({});
    });
  });

  describe('EnvironmentsApi', () => {
    it('handles environments', () => {
      const api = TestBed.inject(EnvironmentsApi);

      api.list('w1').subscribe();
      expectCall('GET', '/api/environments', { workspaceId: 'w1' }).flush([]);

      api.get('e1').subscribe();
      expectCall('GET', '/api/environments/e1').flush({});

      api
        .create({
          name: 'Dev',
          workspaceId: 'w1',
          variables: [{ key: 'baseUrl', value: 'http://x' }],
        })
        .subscribe();
      expectCall('POST', '/api/environments').flush({});

      api.update('e1', { isGlobal: true }).subscribe();
      expect(expectCall('PUT', '/api/environments/e1').request.body).toEqual({ isGlobal: true });

      api.remove('e1').subscribe();
      expectCall('DELETE', '/api/environments/e1').flush({});
    });

    it('handles variables with their own routes', () => {
      const api = TestBed.inject(EnvironmentsApi);

      api.addVariable('e1', { key: 'token', value: 'abc' }).subscribe();
      expectCall('POST', '/api/environments/e1/variables').flush({});

      api.updateVariable('v1', { enabled: false }).subscribe();
      expect(expectCall('PUT', '/api/environments/variables/v1').request.body).toEqual({
        enabled: false,
      });

      api.removeVariable('v1').subscribe();
      expectCall('DELETE', '/api/environments/variables/v1').flush({});
    });
  });

  describe('ExecutionApi', () => {
    it('runs a request sending the DTO as is', () => {
      const dto: ExecuteRequestDto = {
        protocol: 'REST',
        method: 'GET',
        url: '{{baseUrl}}/users',
        environmentId: 'e1',
        workspaceId: 'w1',
      };
      TestBed.inject(ExecutionApi).run(dto).subscribe();
      expect(expectCall('POST', '/api/execution/run').request.body).toEqual(dto);
    });

    it('inspects a WSDL passing its URL as a query parameter', () => {
      TestBed.inject(ExecutionApi).inspectWsdl('http://x/calc.asmx?WSDL').subscribe();
      expectCall('GET', '/api/execution/soap/inspect-wsdl', {
        url: 'http://x/calc.asmx?WSDL',
      }).flush({});
    });

    it('asks the backend to skip TLS verification only when told to', () => {
      TestBed.inject(ExecutionApi)
        .inspectWsdl('https://localhost:7235/s.asmx?wsdl', true)
        .subscribe();
      expectCall('GET', '/api/execution/soap/inspect-wsdl', {
        url: 'https://localhost:7235/s.asmx?wsdl',
        ignoreSsl: 'true',
      }).flush({});
    });
  });

  describe('HistoryApi', () => {
    it('lists without filters', () => {
      TestBed.inject(HistoryApi).list().subscribe();
      expectCall('GET', '/api/history').flush([]);
    });

    it('lists filtering by request and limit', () => {
      TestBed.inject(HistoryApi).list({ requestId: 'r1', limit: 5 }).subscribe();
      expectCall('GET', '/api/history', { requestId: 'r1', limit: '5' }).flush([]);
    });

    it('gets one entry', () => {
      TestBed.inject(HistoryApi).get('h1').subscribe();
      expectCall('GET', '/api/history/h1').flush({});
    });
  });

  describe('HealthApi', () => {
    it('asks the backend root as text', () => {
      TestBed.inject(HealthApi).check().subscribe();
      const req = expectCall('GET', '/api/');
      expect(req.request.responseType).toBe('text');
      req.flush('Hello World!');
    });
  });
});
