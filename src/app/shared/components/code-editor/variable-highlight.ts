import { Extension } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { VariableMap } from '../../../core/variables/variables';

const defined = Decoration.mark({ class: 'cm-var' });
const missing = Decoration.mark({ class: 'cm-var cm-var-missing' });

/**
 * Pinta las `{{variables}}` del documento: con el color de acento si tienen valor y en ámbar si no.
 * Es la misma expresión que sustituye el backend al ejecutar.
 */
export function variableHighlight(variables: VariableMap): Extension {
  const matcher = new MatchDecorator({
    regexp: /\{\{\s*([\w.-]+)\s*\}\}/g,
    decoration: (match) => (Object.hasOwn(variables, match[1] ?? '') ? defined : missing),
  });

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }

      update(update: ViewUpdate): void {
        this.decorations = matcher.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
