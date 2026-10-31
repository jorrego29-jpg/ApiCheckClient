import { Environment, KeyValue, UpdateVariableDto, Variable } from '../models';

/** Variables ya resueltas (nombre → valor), como las ve el backend al ejecutar. */
export type VariableMap = Readonly<Record<string, string>>;

/** Misma expresión que usa el backend (variable-resolver.service.ts): `{{ nombre }}` con letras, números, `_`, `.` y `-`. */
const PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;
const VALID_KEY = /^[\w.-]+$/;

/** Un tramo de texto; si es una `{{variable}}` dice cuál y si tiene valor. */
export interface TextSegment {
  text: string;
  variable?: { name: string; defined: boolean };
}

const isDefined = (variables: VariableMap, name: string) => Object.hasOwn(variables, name);

/** Sustituye las `{{variables}}` que tienen valor; las que no, se dejan tal cual. */
export function interpolate(text: string, variables: VariableMap): string {
  return text.replace(PATTERN, (match, name: string) =>
    isDefined(variables, name) ? (variables[name] ?? match) : match,
  );
}

/** Parte el texto en tramos para pintar las variables de otro color. Unidos, dan siempre el texto original. */
export function splitVariables(text: string, variables: VariableMap): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(PATTERN)) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index) });
    segments.push({
      text: match[0],
      variable: { name: match[1] ?? '', defined: isDefined(variables, match[1] ?? '') },
    });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

/** Nombres de las variables que usa el texto, sin repetir y en orden de aparición. */
export function variableNames(text: string): string[] {
  return [...new Set([...text.matchAll(PATTERN)].map((match) => match[1] ?? ''))];
}

const PREVIEW_LENGTH = 60;

/** Resumen de las variables del texto para un tooltip: `{{host}} → api.dev` o `{{token}} sin definir`. */
export function describeVariables(text: string, variables: VariableMap): string {
  return variableNames(text)
    .map((name) => {
      if (!isDefined(variables, name)) return `{{${name}}} sin definir`;
      const value = variables[name] ?? '';
      const shown = value.length > PREVIEW_LENGTH ? `${value.slice(0, PREVIEW_LENGTH)}…` : value;
      return `{{${name}}} → ${shown === '' ? '(vacío)' : shown}`;
    })
    .join('\n');
}

// ─── Entornos ───────────────────────────────────────────────────────────────────

/**
 * Las variables que verá una ejecución: primero las de los entornos globales del workspace y
 * encima las del entorno activo, que las pisan. Solo cuentan las habilitadas.
 */
export function mergeVariables(
  globals: readonly Environment[],
  active: Environment | null,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const environment of [...globals, ...(active ? [active] : [])]) {
    for (const variable of environment.variables) {
      if (variable.enabled) merged[variable.key] = variable.value;
    }
  }
  return merged;
}

// ─── Edición de las variables de un entorno ─────────────────────────────────────

/** Una fila de la tabla de variables. Si viene del servidor lleva su `id`; las nuevas, no. */
export interface VariableRow extends KeyValue {
  id?: string;
}

export function rowsFromVariables(variables: readonly Variable[]): VariableRow[] {
  return variables.map(({ id, key, value, enabled }) => ({ id, key, value, enabled }));
}

/** Lo que de verdad se guarda: sin filas sin nombre y con el nombre sin espacios a los lados. */
export function cleanRows(rows: readonly VariableRow[]): VariableRow[] {
  return rows
    .filter((row) => row.key.trim() !== '')
    .map((row) => ({ ...row, key: row.key.trim() }));
}

export function sameRows(a: readonly VariableRow[], b: readonly VariableRow[]): boolean {
  const flat = (rows: readonly VariableRow[]) =>
    JSON.stringify(cleanRows(rows).map((row) => [row.id ?? null, row.key, row.value, row.enabled]));
  return flat(a) === flat(b);
}

/** Filas con valor pero sin nombre: al guardar se ignorarían, así que se avisa en vez de perderlas en silencio. */
export function unnamedRows(rows: readonly VariableRow[]): number {
  return rows.filter((row) => row.key.trim() === '' && row.value !== '').length;
}

/** Nombres que `{{…}}` nunca encontraría (con espacios, símbolos, etc.). */
export function invalidKeys(rows: readonly VariableRow[]): string[] {
  return cleanRows(rows)
    .map((row) => row.key)
    .filter((key) => !VALID_KEY.test(key));
}

/** Nombres repetidos entre las filas habilitadas: en una ejecución gana el último. */
export function duplicateKeys(rows: readonly VariableRow[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const row of cleanRows(rows).filter((r) => r.enabled)) {
    if (seen.has(row.key)) repeated.add(row.key);
    seen.add(row.key);
  }
  return [...repeated];
}

export interface VariableChanges {
  create: VariableRow[];
  update: { id: string; changes: UpdateVariableDto }[];
  remove: string[];
}

/** Qué hay que pedirle al servidor para que las variables guardadas queden como las filas. */
export function diffVariables(
  saved: readonly Variable[],
  rows: readonly VariableRow[],
): VariableChanges {
  const kept = cleanRows(rows);
  const byId = new Map(saved.map((variable) => [variable.id, variable]));
  const keptIds = new Set(kept.flatMap((row) => (row.id ? [row.id] : [])));

  const update: VariableChanges['update'] = [];
  for (const row of kept) {
    const before = row.id ? byId.get(row.id) : undefined;
    if (!before) continue;
    const changes: UpdateVariableDto = {};
    if (before.key !== row.key) changes.key = row.key;
    if (before.value !== row.value) changes.value = row.value;
    if (before.enabled !== row.enabled) changes.enabled = row.enabled;
    if (Object.keys(changes).length) update.push({ id: before.id, changes });
  }

  return {
    create: kept.filter((row) => !row.id || !byId.has(row.id)),
    update,
    remove: saved.filter((variable) => !keptIds.has(variable.id)).map((variable) => variable.id),
  };
}
