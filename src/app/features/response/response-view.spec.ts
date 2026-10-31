import { ExecutionResult } from '../../core/models';
import {
  LARGE_BODY,
  describeBody,
  formatBytes,
  formatDuration,
  headerRows,
  prettyXml,
  statusKind,
  toResultView,
} from './response-view';

const sentRequest = {
  url: 'https://api.test/x',
  method: 'GET' as const,
  headers: {},
  params: {},
  body: null,
};

describe('statusKind', () => {
  it.each([
    [101, 'info'],
    [200, 'ok'],
    [204, 'ok'],
    [301, 'redirect'],
    [404, 'client'],
    [500, 'server'],
    [0, 'unknown'],
    [700, 'unknown'],
  ])('%i -> %s', (status, kind) => {
    expect(statusKind(status)).toBe(kind);
  });
});

describe('formatters', () => {
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
    expect(formatBytes(null)).toBe('—');
  });

  it('formats durations', () => {
    expect(formatDuration(12.4)).toBe('12 ms');
    expect(formatDuration(1234)).toBe('1.23 s');
  });
});

describe('headerRows', () => {
  it('turns any value into text, joining lists', () => {
    expect(headerRows({ a: 1, b: ['x', 'y'], c: null })).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: 'x, y' },
      { name: 'c', value: '' },
    ]);
  });

  it('accepts no headers', () => {
    expect(headerRows(undefined)).toEqual([]);
  });
});

describe('describeBody', () => {
  it('formats an object as JSON', () => {
    expect(describeBody({ a: 1 })).toMatchObject({
      text: '{\n  "a": 1\n}',
      language: 'json',
      empty: false,
    });
  });

  it('formats JSON that arrived as text', () => {
    expect(describeBody('{"a":1}', { 'Content-Type': 'application/json' })).toMatchObject({
      text: '{\n  "a": 1\n}',
      language: 'json',
    });
  });

  it('formats JSON even if the Content-Type is wrong', () => {
    expect(describeBody('[1,2]', { 'content-type': 'text/plain' }).language).toBe('json');
  });

  it('keeps invalid JSON as it came', () => {
    const view = describeBody('{no es json', { 'content-type': 'application/json' });
    expect(view.text).toBe('{no es json');
    expect(view.language).toBe('text');
  });

  it('recognises XML by header or by content', () => {
    expect(describeBody('<a/>', { 'content-type': 'text/xml' }).language).toBe('xml');
    expect(describeBody('<?xml version="1.0"?><a/>').language).toBe('xml');
    expect(describeBody('<soap:Envelope/>').language).toBe('xml');
  });

  it('treats other text as plain text', () => {
    expect(describeBody('hola', { 'content-type': 'text/plain' })).toMatchObject({
      text: 'hola',
      language: 'text',
    });
  });

  it('flags an empty body', () => {
    expect(describeBody(null).empty).toBe(true);
    expect(describeBody('').empty).toBe(true);
    expect(describeBody(undefined).empty).toBe(true);
  });

  it('shows numbers and booleans', () => {
    expect(describeBody(42).text).toBe('42');
    expect(describeBody(false).text).toBe('false');
  });

  it('flags a body too big for the editor', () => {
    expect(describeBody('x'.repeat(LARGE_BODY + 1)).large).toBe(true);
    expect(describeBody('x'.repeat(10)).large).toBe(false);
  });
});

describe('prettyXml', () => {
  it('indents nested elements and keeps a simple value on its line', () => {
    expect(prettyXml('<a><b>1</b><c><d/></c></a>')).toBe(
      ['<a>', '  <b>1</b>', '  <c>', '    <d/>', '  </c>', '</a>'].join('\n'),
    );
  });

  it('keeps the declaration, comments and CDATA as lines of their own', () => {
    expect(prettyXml('<?xml version="1.0"?><a><!-- nota --><![CDATA[x > y]]></a>')).toBe(
      ['<?xml version="1.0"?>', '<a>', '  <!-- nota -->', '  <![CDATA[x > y]]>', '</a>'].join('\n'),
    );
  });

  it('does not stop at a > inside an attribute value', () => {
    expect(prettyXml('<a x="1>2"><b/></a>')).toBe(['<a x="1>2">', '  <b/>', '</a>'].join('\n'));
  });

  it('formats a SOAP response', () => {
    const xml =
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><AddResponse xmlns="http://tempuri.org/"><AddResult>5</AddResult></AddResponse></soap:Body></soap:Envelope>';

    expect(prettyXml(xml).split('\n')).toEqual([
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
      '  <soap:Body>',
      '    <AddResponse xmlns="http://tempuri.org/">',
      '      <AddResult>5</AddResult>',
      '    </AddResponse>',
      '  </soap:Body>',
      '</soap:Envelope>',
    ]);
  });

  it('is applied to a one-line XML body, and leaves an already formatted one alone', () => {
    expect(describeBody('<a><b/></a>', { 'content-type': 'text/xml' }).text).toBe(
      '<a>\n  <b/>\n</a>',
    );
    const formatted = '<a>\n<b/>\n</a>';
    expect(describeBody(formatted).text).toBe(formatted);
  });
});

describe('toResultView', () => {
  it('summarises a response', () => {
    const view = toResultView({
      request: { ...sentRequest, headers: { 'X-A': '1' }, params: { q: '2' }, body: '{"a":1}' },
      response: {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json' },
        data: { error: 'nada' },
        metrics: { timeMs: 250, sizeBytes: 17 },
      },
    });

    expect(view).toMatchObject({
      kind: 'response',
      status: 404,
      statusText: 'Not Found',
      statusKind: 'client',
      timeMs: 250,
      sizeBytes: 17,
      headers: [{ name: 'content-type', value: 'application/json' }],
      sent: {
        method: 'GET',
        url: 'https://api.test/x',
        headers: [{ name: 'X-A', value: '1' }],
        params: [{ name: 'q', value: '2' }],
      },
    });
    expect(view.kind === 'response' && view.body.language).toBe('json');
  });

  it('summarises a network error of the target', () => {
    const result: ExecutionResult = {
      request: sentRequest,
      response: { error: true, message: 'getaddrinfo ENOTFOUND nope.test', metrics: { timeMs: 8 } },
    };

    expect(toResultView(result)).toMatchObject({
      kind: 'error',
      message: 'getaddrinfo ENOTFOUND nope.test',
      timeMs: 8,
    });
  });

  it('copes with a response that carries no headers (SOAP through WSDL)', () => {
    const view = toResultView({
      request: sentRequest,
      response: {
        status: 200,
        statusText: 'OK',
        data: { AddResult: 5 },
        rawRequest: '<a/>',
        rawResponse: '<b/>',
        metrics: { timeMs: 30 },
      },
    });

    expect(view).toMatchObject({ kind: 'response', headers: [], sizeBytes: null });
  });
});
