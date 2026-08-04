import type { SequenceNodeKind } from '../graph-layout';

/** Token classes per node kind — no raw hex, matching the rest of the app's
 * class-string convention (see `sequence-card.tsx`, `table-detail-modal.tsx`). */
export const NODE_CARD_CLASSES: Record<SequenceNodeKind, string> = {
  raw: 'border-border bg-card',
  step: 'border-border bg-card',
  final: 'border-primary bg-card',
  failed: 'border-danger bg-card',
};

export const HANDLE_CLASSES = '!h-1.5 !w-1.5 !border-0 !bg-border';
