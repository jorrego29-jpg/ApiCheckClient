import { SavedRequest } from '../models';
import {
  EMPTY_BODY,
  NO_AUTH,
  RequestDraft,
  baseUrl,
  buildAuthHeaders,
  canSend,
  draftFromSaved,
  draftsEqual,
  kvToRecord,
  mergeParamsFromUrl,
  toExecutionDto,
  toKeyValues,
  toSaveDto,
  withParams,
  withQuery,
  withScheme,
  withUrl,
} from './request-draft';

const row = (key: string, value: string, enabled = true) => ({ key, value, enabled });

const draft = (overrides: Partial<RequestDraft> = {}): RequestDraft => ({
  protocol: 'REST',
  method: 'GET',
  url: 'https://api.test/items',
  params: [],
  headers: [],
  body: EMPTY_BODY,
  auth: NO_AUTH,
  soapAction: null,
  wsdlUrl: null,
  ...overrides,
});

const saved = (overrides: Partial<SavedRequest> = {}): SavedRequest => ({
  id: 'r1',
  name: 'Petición',
  protocol: 'REST',
  method: 'GET',
  url: 'https://api.test/items',
  headers: null,
  queryParams: null,
  body: null,
  auth: null,
  soapAction: null,
  wsdlUrl: null,
  collectionId: 'c1',
  folderId: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('kvToRecord', () => {
  it('keeps only enabled rows with a key', () => {
    expect(
      kvToRecord([row('a', '1'), row('b', '2', false), row('', 'huérfano'), row('  ', 'x')]),
    ).toEqual({ a: '1' });
  });

  it('trims keys but not values', () => {
    expect(kvToRecord([row(' a ', ' 1 ')])).toEqual({ a: ' 1 ' });
  });

  it('lets the last of a repeated key win', () => {
    expect(kvToRecord([row('a', '1'), row('a', '2')])).toEqual({ a: '2' });
  });

  it('returns an empty record for no rows', () => {
    expect(kvToRecord([])).toEqual({});
  });
});

describe('buildAuthHeaders', () => {
  it('builds a Bearer header', () => {
    expect(buildAuthHeaders({ type: 'bearer', config: { token: ' abc ' } })).toEqual({
      Authorization: 'Bearer abc',
    });
  });

  it('builds nothing for an empty token', () => {
    expect(buildAuthHeaders({ type: 'bearer', config: { token: '  ' } })).toEqual({});
  });

  it('builds a Basic header', () => {
    expect(buildAuthHeaders({ type: 'basic', config: { username: 'u', password: 'p' } })).toEqual({
      Authorization: `Basic ${btoa('u:p')}`,
    });
  });

  it('encodes special characters in Basic as UTF-8', () => {
    const header = buildAuthHeaders({
      type: 'basic',
      config: { username: 'ñandú', password: 'p:ss wörd€' },
    })['Authorization'];
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(header.replace('Basic ', '')), (char) => char.charCodeAt(0)),
    );
    expect(decoded).toBe('ñandú:p:ss wörd€');
  });

  it('resolves variables before encoding Basic credentials', () => {
    const header = buildAuthHeaders(
      { type: 'basic', config: { username: '{{user}}', password: '{{pass}}' } },
      (text) => text.replace('{{user}}', 'u').replace('{{pass}}', 'p'),
    )['Authorization'];
    expect(header).toBe(`Basic ${btoa('u:p')}`);
  });

  it('builds nothing without auth', () => {
    expect(buildAuthHeaders(NO_AUTH)).toEqual({});
  });
});

describe('URL and params', () => {
  it('reads params from the URL, decoding them', () => {
    expect(mergeParamsFromUrl('https://x.test/a?q=hola%20mundo&flag&empty=', [])).toEqual([
      row('q', 'hola mundo'),
      row('flag', ''),
      row('empty', ''),
    ]);
  });

  it('keeps disabled params when the URL changes', () => {
    const merged = mergeParamsFromUrl('https://x.test?a=1', [
      row('a', '0'),
      row('off', '9', false),
    ]);
    expect(merged).toEqual([row('a', '1'), row('off', '9', false)]);
  });

  it('tolerates a lone % while typing', () => {
    expect(mergeParamsFromUrl('https://x.test?a=100%', [])).toEqual([row('a', '100%')]);
  });

  it('writes enabled params to the URL, encoded, and keeps the fragment', () => {
    expect(
      withQuery('https://x.test/p?old=1#top', [row('q', 'a b&c'), row('off', 'x', false)]),
    ).toBe('https://x.test/p?q=a%20b%26c#top');
  });

  it('does not encode {{variables}}', () => {
    expect(withQuery('https://x.test', [row('token', '{{token}}')])).toBe(
      'https://x.test?token={{token}}',
    );
  });

  it('removes the query string when no param is enabled', () => {
    expect(withQuery('https://x.test/p?a=1', [row('a', '1', false)])).toBe('https://x.test/p');
  });

  it('gets the base URL without query or fragment', () => {
    expect(baseUrl('https://x.test/p?a=1#h')).toBe('https://x.test/p');
  });

  it('keeps URL and table in step when either is edited', () => {
    const afterUrl = withUrl(draft(), 'https://api.test/items?userId=1');
    expect(afterUrl.params).toEqual([row('userId', '1')]);

    const afterTable = withParams(afterUrl, [row('userId', '1'), row('page', '2')]);
    expect(afterTable.url).toBe('https://api.test/items?userId=1&page=2');

    const afterDisable = withParams(afterTable, [row('userId', '1', false), row('page', '2')]);
    expect(afterDisable.url).toBe('https://api.test/items?page=2');
  });
});

describe('withScheme', () => {
  it.each([
    ['https://a.test', 'https://a.test'],
    ['HTTP://a.test', 'HTTP://a.test'],
    ['localhost:3000/x', 'http://localhost:3000/x'],
    ['  api.test/x ', 'http://api.test/x'],
    ['{{baseUrl}}/posts', '{{baseUrl}}/posts'],
  ])('%s -> %s', (input, expected) => {
    expect(withScheme(input)).toBe(expected);
  });
});

describe('toExecutionDto', () => {
  const context = { requestId: 'r1', workspaceId: 'w1' };

  it('builds a plain GET', () => {
    expect(toExecutionDto(draft(), context)).toEqual({
      requestId: 'r1',
      protocol: 'REST',
      method: 'GET',
      url: 'https://api.test/items',
      workspaceId: 'w1',
    });
  });

  it('sends the enabled params apart from the URL', () => {
    const dto = toExecutionDto(
      draft({
        url: 'https://api.test/items?userId=1',
        params: [row('userId', '1'), row('off', 'x', false)],
      }),
    );
    expect(dto.url).toBe('https://api.test/items');
    expect(dto.queryParams).toEqual({ userId: '1' });
  });

  it('keeps repeated params in the URL so none is lost', () => {
    const dto = toExecutionDto(draft({ params: [row('tag', 'a'), row('tag', 'b')] }));
    expect(dto.url).toBe('https://api.test/items?tag=a&tag=b');
    expect(dto.queryParams).toBeUndefined();
  });

  it('sends only enabled headers', () => {
    const dto = toExecutionDto(draft({ headers: [row('X-Test', '1'), row('X-Off', '2', false)] }));
    expect(dto.headers).toEqual({ 'X-Test': '1' });
  });

  it('sends a JSON body as text with its Content-Type', () => {
    const dto = toExecutionDto(
      draft({ method: 'POST', body: { type: 'json', content: '{"id": {{id}}}' } }),
    );
    expect(dto.body).toBe('{"id": {{id}}}');
    expect(dto.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('does not override a Content-Type written by hand', () => {
    const dto = toExecutionDto(
      draft({
        method: 'POST',
        headers: [row('content-type', 'application/vnd.api+json')],
        body: { type: 'json', content: '{}' },
      }),
    );
    expect(dto.headers).toEqual({ 'content-type': 'application/vnd.api+json' });
  });

  it('sends no body for type none or empty content', () => {
    expect(toExecutionDto(draft({ method: 'POST' })).body).toBeUndefined();
    expect(
      toExecutionDto(draft({ method: 'POST', body: { type: 'json', content: '  ' } })).body,
    ).toBeUndefined();
  });

  it('adds the Authorization header from the Auth tab', () => {
    const dto = toExecutionDto(draft({ auth: { type: 'bearer', config: { token: 't' } } }));
    expect(dto.headers).toEqual({ Authorization: 'Bearer t' });
  });

  it('lets a manual Authorization header win over the Auth tab', () => {
    const dto = toExecutionDto(
      draft({
        headers: [row('authorization', 'Custom x')],
        auth: { type: 'bearer', config: { token: 't' } },
      }),
    );
    expect(dto.headers).toEqual({ authorization: 'Custom x' });
  });

  it('adds http:// to a URL without scheme', () => {
    expect(toExecutionDto(draft({ url: 'localhost:3000/ping' })).url).toBe(
      'http://localhost:3000/ping',
    );
  });

  it('passes the environment along', () => {
    expect(toExecutionDto(draft(), { environmentId: 'e1' }).environmentId).toBe('e1');
  });

  it('refuses methods the backend cannot run', () => {
    expect(() => toExecutionDto(draft({ method: 'HEAD' }))).toThrow();
  });
});

describe('canSend', () => {
  it('needs REST, an executable method and a URL', () => {
    expect(canSend(draft())).toBe(true);
    expect(canSend(draft({ url: '  ' }))).toBe(false);
    expect(canSend(draft({ method: 'OPTIONS' }))).toBe(false);
    expect(canSend(draft({ protocol: 'SOAP' }))).toBe(false);
  });
});

describe('saved requests', () => {
  it('reads a request without extras', () => {
    expect(draftFromSaved(saved())).toEqual(draft());
  });

  it('reads headers and params saved as plain objects', () => {
    const result = draftFromSaved(
      saved({ headers: { 'X-A': '1' } as never, queryParams: { q: 2 } as never }),
    );
    expect(result.headers).toEqual([row('X-A', '1')]);
    expect(result.params).toEqual([row('q', '2')]);
  });

  it('reads the params from the URL when none were saved', () => {
    expect(draftFromSaved(saved({ url: 'https://a.test?x=1' })).params).toEqual([row('x', '1')]);
  });

  it('reads a body saved as a plain object', () => {
    expect(draftFromSaved(saved({ body: { name: 'x' } as never })).body).toEqual({
      type: 'json',
      content: '{\n  "name": "x"\n}',
    });
  });

  it('falls back to GET for a request without method', () => {
    expect(draftFromSaved(saved({ method: null })).method).toBe('GET');
  });

  it('round-trips through the save DTO without looking changed', () => {
    const original = draft({
      method: 'POST',
      url: 'https://api.test/items?a=1',
      params: [row('a', '1'), row('off', '2', false)],
      headers: [row('X-A', '1')],
      body: { type: 'json', content: '{"a":1}' },
      auth: { type: 'basic', config: { username: 'u', password: 'p' } },
    });
    const dto = toSaveDto(original);
    const reopened = draftFromSaved(
      saved({
        method: dto.method as never,
        url: dto.url,
        headers: dto.headers as never,
        queryParams: dto.queryParams as never,
        body: dto.body as never,
        auth: dto.auth as never,
      }),
    );
    expect(draftsEqual(reopened, original)).toBe(true);
  });
});

describe('draftsEqual', () => {
  it('ignores blank rows and leftovers from another body or auth type', () => {
    const base = draft();
    const edited = draft({
      headers: [row('', '')],
      body: { type: 'none', content: 'resto' },
      auth: { type: 'none', config: { token: 'resto' } },
    });
    expect(draftsEqual(base, edited)).toBe(true);
  });

  it('notices real changes', () => {
    expect(draftsEqual(draft(), draft({ url: 'https://otra.test' }))).toBe(false);
    expect(draftsEqual(draft(), draft({ headers: [row('A', '1')] }))).toBe(false);
    expect(draftsEqual(draft(), draft({ auth: { type: 'bearer', config: { token: '' } } }))).toBe(
      false,
    );
  });
});

describe('toKeyValues', () => {
  it('returns nothing for null or garbage', () => {
    expect(toKeyValues(null)).toEqual([]);
    expect(toKeyValues('texto')).toEqual([]);
  });

  it('treats a missing enabled flag as enabled', () => {
    expect(toKeyValues([{ key: 'a', value: 'b' }])).toEqual([row('a', 'b')]);
    expect(toKeyValues([{ key: 'a', value: 'b', enabled: false }])).toEqual([row('a', 'b', false)]);
  });
});
