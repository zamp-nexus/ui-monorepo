import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface ResizablePanelOptions {
  readonly defaultWidth: number;
  readonly minWidth: number;
  /** The main content's own minimum -- resizing must never shrink it below this. */
  readonly minRemainingWidth: number;
}

/**
 * Tracks a panel's width via pointer drag, generic to any panel -- nothing
 * here knows about the Activity Inspector specifically.
 *
 * Clamped on every move rather than only at drag-end, so the panel never
 * visibly overshoots past its minimum before snapping back.
 */
export const useResizablePanel = ({
  defaultWidth,
  minWidth,
  minRemainingWidth,
}: ResizablePanelOptions) => {
  const [width, setWidth] = useState(defaultWidth);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(defaultWidth);

  const onDragStart = useCallback(
    (event: ReactPointerEvent) => {
      dragStartX.current = event.clientX;
      dragStartWidth.current = width;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = dragStartX.current - moveEvent.clientX;
        const maxWidth = window.innerWidth - minRemainingWidth;
        setWidth(Math.min(maxWidth, Math.max(minWidth, dragStartWidth.current + delta)));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [width, minWidth, minRemainingWidth],
  );

  return { width, onDragStart };
};
