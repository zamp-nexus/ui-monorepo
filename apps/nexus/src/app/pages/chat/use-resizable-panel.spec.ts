/// <reference types="vitest/globals" />
import { act, renderHook } from '@testing-library/react';

import { useResizablePanel } from './use-resizable-panel';

const drag = (startX: number, moveToX: number) => {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: moveToX }));
  void startX;
};

describe('useResizablePanel', () => {
  it('starts at the default width', () => {
    const { result } = renderHook(() =>
      useResizablePanel({ defaultWidth: 360, minWidth: 280, minRemainingWidth: 480 }),
    );
    expect(result.current.width).toBe(360);
  });

  it('grows and shrinks as the pointer drags left and right', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
    const { result } = renderHook(() =>
      useResizablePanel({ defaultWidth: 360, minWidth: 280, minRemainingWidth: 480 }),
    );

    act(() => {
      result.current.onDragStart({ clientX: 800 } as React.PointerEvent);
    });
    act(() => {
      drag(800, 700); // dragged left by 100 -> panel widens by 100
    });
    expect(result.current.width).toBe(460);

    act(() => {
      drag(800, 850); // dragged right of the start point -> panel narrows
    });
    expect(result.current.width).toBe(310);
  });

  it('never shrinks the panel below its stated minimum', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
    const { result } = renderHook(() =>
      useResizablePanel({ defaultWidth: 360, minWidth: 280, minRemainingWidth: 480 }),
    );

    act(() => {
      result.current.onDragStart({ clientX: 800 } as React.PointerEvent);
    });
    act(() => {
      drag(800, 1100); // dragged far right -> would go well below minWidth
    });
    expect(result.current.width).toBe(280);
  });

  it('never grows the panel past what the remaining content needs', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
    const { result } = renderHook(() =>
      useResizablePanel({ defaultWidth: 360, minWidth: 280, minRemainingWidth: 480 }),
    );

    act(() => {
      result.current.onDragStart({ clientX: 800 } as React.PointerEvent);
    });
    act(() => {
      drag(800, 0); // dragged far left -> would exceed innerWidth - minRemainingWidth
    });
    expect(result.current.width).toBe(720); // 1200 - 480
  });

  it('stops listening once the drag ends', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
    const { result } = renderHook(() =>
      useResizablePanel({ defaultWidth: 360, minWidth: 280, minRemainingWidth: 480 }),
    );

    act(() => {
      result.current.onDragStart({ clientX: 800 } as React.PointerEvent);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup'));
    });
    act(() => {
      drag(800, 700);
    });
    expect(result.current.width).toBe(360);
  });
});
