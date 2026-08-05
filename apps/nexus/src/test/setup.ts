import '@testing-library/jest-dom';

// ProseMirror reads browser layout APIs to position the native Tiptap caret.
// jsdom deliberately omits these visual-browser APIs, so give tests inert
// geometry rather than changing production editor behavior.
Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
Object.defineProperty(Node.prototype, 'getClientRects', { configurable: true, value: () => [] });
Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
