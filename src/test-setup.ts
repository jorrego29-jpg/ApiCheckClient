// jsdom no trae ResizeObserver y CodeMirror lo usa al montar el editor.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
