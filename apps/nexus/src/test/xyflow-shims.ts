/**
 * jsdom is missing a few browser APIs React Flow needs just to mount:
 * `ResizeObserver` (it measures every node/viewport), `DOMMatrixReadOnly`
 * (it reads the pane's transform), and `SVGElement.getBBox` (edges measure
 * their path). None of these need to *compute* anything real for a test —
 * they only need to exist so React Flow's mount effects do not throw.
 */

class ResizeObserverStub {
  // No-op: this stub only needs to exist so React Flow's mount effects,
  // which call these, do not throw in jsdom.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  observe(): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  unobserve(): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  class DOMMatrixReadOnlyStub {
    m22 = 1;
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
      if (scale) this.m22 = Number(scale);
    }
  }
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly;
}

// `getBBox` belongs to `SVGGraphicsElement`, not `SVGElement` itself — hence
// the `any` cast on both the read and the write.
if (typeof SVGElement !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svgElementPrototype = SVGElement.prototype as any;
  if (!svgElementPrototype.getBBox) {
    svgElementPrototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
  }
}

// jsdom's own implementation returns every dimension as 0, which is
// indistinguishable from "not rendered" to React Flow's viewport fitting.
Element.prototype.getBoundingClientRect = () =>
  ({
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    top: 0,
    left: 0,
    right: 200,
    bottom: 100,
    toJSON: () => '',
  } as DOMRect);
