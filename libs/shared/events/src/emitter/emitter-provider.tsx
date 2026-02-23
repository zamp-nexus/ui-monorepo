import { useRef, type ReactElement, type ReactNode } from 'react';

import { createEmitter } from './create-emitter';
import { EmitterContext } from './emitter-context';
import type { EventMap, TypedEmitter } from './types';

export interface EmitterProviderProps<TEvents extends EventMap = Record<string, unknown[]>> {
  emitter?: TypedEmitter<TEvents>;
  children: ReactNode;
}

export const EmitterProvider = <TEvents extends EventMap = Record<string, unknown[]>>({
  emitter,
  children,
}: EmitterProviderProps<TEvents>): ReactElement => {
  const emitterRef = useRef<TypedEmitter<TEvents> | null>(null);
  if (!emitter && !emitterRef.current) {
    emitterRef.current = createEmitter<TEvents>();
  }

  const contextEmitter = emitter ?? emitterRef.current;

  return (
    <EmitterContext.Provider value={contextEmitter as unknown as TypedEmitter<EventMap>}>
      {children}
    </EmitterContext.Provider>
  );
};
