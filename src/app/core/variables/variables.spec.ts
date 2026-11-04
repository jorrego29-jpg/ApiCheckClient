import { Environment, Variable } from '../models';
import {
  cleanRows,
  describeVariables,
  diffVariables,
  duplicateKeys,
  interpolate,
  invalidKeys,
  mergeVariables,
  rowsFromVariables,
  sameRows,
  splitVariables,
  unnamedRows,
  variableNames,
} from './variables';

const variable = (id: string, key: string, value: string, enabled = true): Variable => ({
  id,
  key,
  value,
  enabled,
  environmentId: 'e1',
});

const environment = (variables: Variable[], isGlobal = false): Environment => ({
  id: isGlobal ? 'g1' : 'e1',
  name: isGlobal ? 'Globales' : 'Dev',
  isGlobal,
  workspaceId: 'w1',
  variables,
});

describe('interpolate', () => {
  it('replaces {{variables}}, with or without spaces inside the braces', () => {
    expect(interpolate('{{host}}/users/{{ id }}', { host: 'https://api.test', id: '7' })).toBe(
      'https://api.test/users/7',
    );
  });

  it('leaves a variable without a value as it was written', () => {
    expect(interpolate('{{host}}/{{missing}}', { host: 'h' })).toBe('h/{{missing}}');
  });

  it('accepts an empty value', () => {
    expect(interpolate('a{{x}}b', { x: '' })).toBe('ab');
  });

  it('does not resolve names that every object inherits', () => {
    expect(interpolate('{{constructor}}', {})).toBe('{{constructor}}');
  });

  it('supports dots and dashes in names', () => {
    expect(interpolate('{{api.base-url}}', { 'api.base-url': 'x' })).toBe('x');
  });
});

describe('splitVariables', () => {
  it('splits the text around its variables, marking which have a value', () => {
    expect(splitVariables('GET {{host}}/{{path}}', { host: 'h' })).toEqual([
      { text: 'GET ' },
      { text: '{{host}}', variable: { name: 'host', defined: true } },
      { text: '/' },
      { text: '{{path}}', variable: { name: 'path', defined: false } },
    ]);
  });

  it('always gives the original text back when joined', () => {
    const text = '  {{ a }} - {{b}}{{c}} fin ';
    expect(
      splitVariables(text, {})
        .map((segment) => segment.text)
        .join(''),
    ).toBe(text);
  });

  it('returns a single plain segment when there are no variables', () => {
    expect(splitVariables('https://api.test', {})).toEqual([{ text: 'https://api.test' }]);
  });

  it('returns nothing for an empty text', () => {
    expect(splitVariables('', {})).toEqual([]);
  });
});

describe('variableNames', () => {
  it('lists each name once, in order of appearance', () => {
    expect(variableNames('{{b}} {{a}} {{b}} {{ c }}')).toEqual(['b', 'a', 'c']);
  });
});

describe('describeVariables', () => {
  it('says what each variable equals or that it has no value', () => {
    expect(describeVariables('{{host}} {{token}} {{empty}}', { host: 'api.dev', empty: '' })).toBe(
      '{{host}} → api.dev\n{{token}} sin definir\n{{empty}} → (vacío)',
    );
  });

  it('cuts long values short', () => {
    const shown = describeVariables('{{big}}', { big: 'x'.repeat(100) });

    expect(shown).toBe(`{{big}} → ${'x'.repeat(60)}…`);
  });
});

describe('mergeVariables', () => {
  it('puts the active environment over the global ones', () => {
    const merged = mergeVariables(
      [environment([variable('v1', 'host', 'global'), variable('v2', 'only-global', 'g')], true)],
      environment([variable('v3', 'host', 'dev'), variable('v4', 'only-dev', 'd')]),
    );

    expect(merged).toEqual({ host: 'dev', 'only-global': 'g', 'only-dev': 'd' });
  });

  it('ignores the variables that are switched off', () => {
    const merged = mergeVariables(
      [environment([variable('v1', 'a', '1', false)], true)],
      environment([variable('v2', 'b', '2', false), variable('v3', 'c', '3')]),
    );

    expect(merged).toEqual({ c: '3' });
  });

  it('works without an active environment', () => {
    expect(mergeVariables([environment([variable('v1', 'a', '1')], true)], null)).toEqual({
      a: '1',
    });
  });
});

describe('editing the variables of an environment', () => {
  const saved = [variable('v1', 'host', 'api'), variable('v2', 'token', 'abc')];

  it('turns saved variables into rows that keep their id', () => {
    expect(rowsFromVariables(saved)).toEqual([
      { id: 'v1', key: 'host', value: 'api', enabled: true },
      { id: 'v2', key: 'token', value: 'abc', enabled: true },
    ]);
  });

  it('drops the rows without a name and trims the names', () => {
    expect(
      cleanRows([
        { key: '  host ', value: 'x', enabled: true },
        { key: '   ', value: 'ignored', enabled: true },
      ]),
    ).toEqual([{ key: 'host', value: 'x', enabled: true }]);
  });

  it('sees no difference between the saved rows and themselves', () => {
    expect(sameRows(rowsFromVariables(saved), rowsFromVariables(saved))).toBe(true);
    expect(diffVariables(saved, rowsFromVariables(saved))).toEqual({
      create: [],
      update: [],
      remove: [],
    });
  });

  it('does not count an empty row at the end as a change', () => {
    const rows = [...rowsFromVariables(saved), { key: '', value: '', enabled: true }];

    expect(sameRows(rows, rowsFromVariables(saved))).toBe(true);
  });

  it('notices a changed value', () => {
    const rows = rowsFromVariables(saved).map((row) =>
      row.id === 'v1' ? { ...row, value: 'other' } : row,
    );

    expect(sameRows(rows, rowsFromVariables(saved))).toBe(false);
  });

  it('asks only for what changed: create, update and remove', () => {
    const rows = [
      { id: 'v1', key: 'host', value: 'changed', enabled: false }, // cambia valor y estado
      // v2 desaparece
      { key: ' new ', value: '1', enabled: true }, // nueva
      { key: '', value: 'sin nombre', enabled: true }, // se ignora
    ];

    expect(diffVariables(saved, rows)).toEqual({
      create: [{ key: 'new', value: '1', enabled: true }],
      update: [{ id: 'v1', changes: { value: 'changed', enabled: false } }],
      remove: ['v2'],
    });
  });

  it('renames a variable through an update', () => {
    const rows = rowsFromVariables(saved).map((row) =>
      row.id === 'v2' ? { ...row, key: 'secret' } : row,
    );

    expect(diffVariables(saved, rows).update).toEqual([{ id: 'v2', changes: { key: 'secret' } }]);
  });

  it('counts the rows that have a value but no name', () => {
    expect(
      unnamedRows([
        { key: 'ok', value: '1', enabled: true },
        { key: '  ', value: 'sin nombre', enabled: true },
        { key: '', value: '', enabled: true }, // vacía del todo: no cuenta
      ]),
    ).toBe(1);
  });

  it('flags the names that {{…}} could never find', () => {
    expect(
      invalidKeys([
        { key: 'ok.name-1_', value: '', enabled: true },
        { key: 'con espacio', value: '', enabled: true },
        { key: 'a/b', value: '', enabled: true },
      ]),
    ).toEqual(['con espacio', 'a/b']);
  });

  it('flags a name used twice by enabled rows', () => {
    expect(
      duplicateKeys([
        { key: 'a', value: '1', enabled: true },
        { key: 'a', value: '2', enabled: true },
        { key: 'b', value: '3', enabled: true },
        { key: 'b', value: '4', enabled: false },
      ]),
    ).toEqual(['a']);
  });
});
