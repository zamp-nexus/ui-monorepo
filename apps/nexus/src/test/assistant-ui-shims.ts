/**
 * jsdom implements no layout or scrolling, but `@assistant-ui/react`'s
 * viewport auto-scroll calls `Element.scrollTo` on mount regardless -- this
 * only needs to exist so that effect does not throw, not to scroll anything.
 */
if (typeof Element.prototype.scrollTo !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  Element.prototype.scrollTo = function scrollTo(): void {};
}
