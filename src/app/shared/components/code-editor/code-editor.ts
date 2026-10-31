import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { VariableMap } from '../../../core/variables/variables';
import { variableHighlight } from './variable-highlight';

export type CodeLanguage = 'json' | 'xml' | 'text';

const theme = EditorView.theme(
  {
    '&': {
      height: '100%',
      color: 'var(--text)',
      backgroundColor: 'transparent',
      fontSize: 'var(--text-sm)',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55', overflow: 'auto' },
    '.cm-content': { caretColor: 'var(--cyan)', padding: '6px 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--cyan)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--cyan-glow)',
    },
    '.cm-activeLine': { backgroundColor: 'var(--cyan-wash)' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
      border: 'none',
    },
    '.cm-activeLineGutter': { backgroundColor: 'var(--cyan-wash)', color: 'var(--text)' },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--surface-3)',
      border: 'none',
      color: 'var(--text-muted)',
    },
    '.cm-placeholder': { color: 'var(--text-muted)' },
    '.cm-selectionMatch': { backgroundColor: 'var(--violet-glow)' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'var(--cyan-glow)',
      outline: 'none',
    },
    '.cm-panels': {
      backgroundColor: 'var(--surface-2)',
      color: 'var(--text)',
      borderColor: 'var(--border)',
    },
    '.cm-panels input, .cm-panels button': {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-sm)',
    },
    '.cm-var': {
      borderRadius: '3px',
      backgroundColor: 'color-mix(in srgb, var(--cyan) 20%, transparent)',
      boxShadow: '0 0 0 1px var(--cyan-border)',
    },
    '.cm-var-missing': {
      backgroundColor: 'color-mix(in srgb, var(--amber) 22%, transparent)',
      boxShadow: '0 0 0 1px color-mix(in srgb, var(--amber) 55%, transparent)',
    },
    '.cm-searchMatch': { backgroundColor: 'var(--violet-glow)' },
    '.cm-searchMatch-selected': { backgroundColor: 'var(--cyan-glow)' },
  },
  { dark: true },
);

const highlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [tags.propertyName, tags.tagName], color: 'var(--cyan)' },
    { tag: [tags.string, tags.attributeValue], color: 'var(--emerald)' },
    { tag: [tags.number, tags.integer, tags.float], color: 'var(--amber)' },
    {
      tag: [tags.bool, tags.null, tags.keyword],
      color: 'color-mix(in srgb, var(--violet) 55%, white)',
    },
    { tag: tags.attributeName, color: 'var(--amber)' },
    {
      tag: [tags.angleBracket, tags.punctuation, tags.separator, tags.bracket],
      color: 'var(--text-muted)',
    },
    { tag: [tags.comment, tags.blockComment], color: 'var(--text-muted)', fontStyle: 'italic' },
    { tag: tags.processingInstruction, color: 'var(--text-muted)' },
    { tag: tags.invalid, color: 'var(--danger)' },
  ]),
);

function languageExtension(language: CodeLanguage): Extension {
  switch (language) {
    case 'json':
      return json();
    case 'xml':
      return xml();
    default:
      return [];
  }
}

/**
 * Editor de código (CodeMirror 6) con colores para JSON y XML. Con `readOnly` sirve de visor.
 * Ctrl/Cmd+Enter queda libre: el editor de peticiones lo usa para enviar.
 */
@Component({
  selector: 'app-code-editor',
  template: '<div class="host" #host></div>',
  styles: `
    :host {
      display: block;
      min-height: 0;
      height: 100%;
    }

    .host {
      height: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeEditor {
  readonly value = model('');
  readonly language = input<CodeLanguage>('text');
  readonly readOnly = input(false);
  readonly lineWrap = input(false);
  readonly placeholderText = input('');
  readonly ariaLabel = input('Editor de código');
  /** Si se da, las `{{variables}}` del texto se pintan según tengan valor o no. */
  readonly variables = input<VariableMap | null>(null);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private view?: EditorView;

  private readonly languageSlot = new Compartment();
  private readonly editableSlot = new Compartment();
  private readonly wrapSlot = new Compartment();
  private readonly labelSlot = new Compartment();
  private readonly variablesSlot = new Compartment();

  constructor() {
    afterNextRender(() => this.create());
    inject(DestroyRef).onDestroy(() => this.view?.destroy());

    // Un cambio de `value` desde fuera (otra pestaña, "formatear") se vuelca al documento.
    effect(() => {
      const value = this.value();
      const view = this.view;
      if (view && view.state.doc.toString() !== value) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      }
    });

    effect(() => {
      const language = languageExtension(this.language());
      const editable = !this.readOnly();
      const wrap = this.lineWrap() ? EditorView.lineWrapping : [];
      const label = EditorView.contentAttributes.of({ 'aria-label': this.ariaLabel() });
      const variables = this.variables();
      this.view?.dispatch({
        effects: [
          this.languageSlot.reconfigure(language),
          this.editableSlot.reconfigure([
            EditorView.editable.of(editable),
            EditorState.readOnly.of(!editable),
          ]),
          this.wrapSlot.reconfigure(wrap),
          this.labelSlot.reconfigure(label),
          this.variablesSlot.reconfigure(variables ? variableHighlight(variables) : []),
        ],
      });
    });
  }

  private create(): void {
    const editable = !this.readOnly();
    const variables = this.variables();
    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: EditorState.create({
        doc: this.value(),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          keymap.of([
            // Mod-Enter inserta una línea; aquí es "enviar", así que se deja pasar.
            ...defaultKeymap.filter((binding) => binding.key !== 'Mod-Enter'),
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            indentWithTab,
          ]),
          placeholder(this.placeholderText()),
          theme,
          highlighting,
          this.languageSlot.of(languageExtension(this.language())),
          this.editableSlot.of([
            EditorView.editable.of(editable),
            EditorState.readOnly.of(!editable),
          ]),
          this.wrapSlot.of(this.lineWrap() ? EditorView.lineWrapping : []),
          this.labelSlot.of(EditorView.contentAttributes.of({ 'aria-label': this.ariaLabel() })),
          this.variablesSlot.of(variables ? variableHighlight(variables) : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) this.value.set(update.state.doc.toString());
          }),
        ],
      }),
    });
  }
}
