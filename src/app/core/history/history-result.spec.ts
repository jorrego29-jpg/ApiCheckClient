import { HistoryDetail } from '../models';
import { resultFromHistory } from './history-result';

const detail = (overrides: Partial<HistoryDetail> = {}): HistoryDetail => ({
  id: 'h1',
  requestId: 'r1',
  executedUrl: 'https://api.test/users',
  method: 'GET',
  status: 200,
  statusText: 'OK',
  durationMs: 42,
  sizeBytes: 17,
  createdAt: '2026-10-30T12:00:00.000Z',
  requestHeaders: { Accept: 'application/json', 'X-Retries': 3 },
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"ok":true}',
  ...overrides,
});

describe('resultFromHistory', () => {
  it('rebuilds the request that was sent', () => {
    const { request } = resultFromHistory(detail());

    expect(request.url).toBe('https://api.test/users');
    expect(request.method).toBe('GET');
    expect(request.headers).toEqual({ Accept: 'application/json', 'X-Retries': '3' });
    expect(request.params).toEqual({});
  });

  it('rebuilds a JSON response', () => {
    const { response } = resultFromHistory(detail());

    expect(response).toEqual({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: { ok: true },
      metrics: { timeMs: 42, sizeBytes: 17 },
    });
  });

  it('unwraps a text body that was stored as a JSON string', () => {
    const xml = '<a>\n  <b/>\n</a>';
    const { response } = resultFromHistory(detail({ responseBody: JSON.stringify(xml) }));

    expect('data' in response && response.data).toBe(xml);
  });

  it('keeps a body that is not JSON as it is', () => {
    const { response } = resultFromHistory(detail({ responseBody: 'plain text' }));

    expect('data' in response && response.data).toBe('plain text');
  });

  it('treats a missing body as empty', () => {
    expect('data' in resultFromHistory(detail({ responseBody: null })).response).toBe(true);
    const { response } = resultFromHistory(detail({ responseBody: '' }));
    expect('data' in response && response.data).toBe('');
  });

  it('turns a run that failed before any response into an error', () => {
    const { response } = resultFromHistory(
      detail({ status: 0, statusText: 'ERROR', responseBody: '"getaddrinfo ENOTFOUND nope.test"' }),
    );

    expect(response).toEqual({
      error: true,
      message: 'getaddrinfo ENOTFOUND nope.test',
      metrics: { timeMs: 42, sizeBytes: 17 },
    });
  });

  it('falls back to the status text when a failed run has no message', () => {
    const { response } = resultFromHistory(
      detail({ status: 0, statusText: 'ERROR', responseBody: '""' }),
    );

    expect('message' in response && response.message).toBe('ERROR');
  });
});
